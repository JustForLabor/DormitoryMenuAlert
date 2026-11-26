package kr.pe.ybkim.ssaltech;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HashSet;
import java.util.Set;

/**
 * 알림 규칙 저장·예약·발송. 규칙은 웹 앱(store.ts Alarm)이 넘긴 JSON 그대로다:
 * {id, offset(0 오늘|1 내일), meal(breakfast|lunch|dinner), time "HH:MM", dorm, repeat(all|weekday|weekend), on}.
 * 시각은 생활관 기준(Asia/Seoul)으로 계산한다. 메뉴는 예약할 때가 아니라 울릴 때 /api/notify 에서 받는다.
 */
final class Alarms {
    static final String TAG = "SsalTech";
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    /** 예전 채널(menu)은 중요도를 올릴 수 없어 지우고, 헤드업용 새 채널을 쓴다. */
    static final String CHANNEL = "menu-heads";
    private static final String OLD_CHANNEL = "menu";
    static final String ACTION_FIRE = "kr.pe.ybkim.ssaltech.FIRE";
    static final String EXTRA_ID = "id";
    private static final String PREFS = "ssaltech";
    private static final String K_ALARMS = "alarms";
    private static final String K_SCHEDULED = "scheduled";
    private static final String K_INBOX = "inbox";
    private static final int INBOX_MAX = 20;
    private static final int TIMEOUT_MS = 4000;
    private static Bitmap largeIcon;

    private Alarms() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray load(Context c) {
        try {
            return new JSONArray(prefs(c).getString(K_ALARMS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** 웹 앱이 넘긴 규칙 전체를 저장하고 다시 예약한다. */
    static synchronized void save(Context c, String json) throws JSONException {
        JSONArray list = new JSONArray(json); // 형식이 틀리면 저장하지 않는다
        prefs(c).edit().putString(K_ALARMS, list.toString()).apply();
        scheduleAll(c);
    }

    static JSONObject find(Context c, String id) {
        JSONArray list = load(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.optJSONObject(i);
            if (a != null && id.equals(a.optString("id"))) return a;
        }
        return null;
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return c.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    private static PendingIntent fireIntent(Context c, String id, int flags) {
        Intent i = new Intent(c, AlarmReceiver.class)
                .setAction(ACTION_FIRE)
                .setData(Uri.parse("ssaltech://alarm/" + id))
                .putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static boolean repeatsOn(String repeat, LocalDate d) {
        boolean weekend = d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY;
        switch (repeat) {
            case "weekday": return !weekend;
            case "weekend": return weekend;
            default: return true;
        }
    }

    /** 규칙이 다음에 울릴 시각 (지금 이후, 8일 안). 없으면 null. web/src/ui/views/AlarmView.tsx nextFire 와 같다. */
    static ZonedDateTime nextFire(JSONObject a, ZonedDateTime now) {
        LocalTime t;
        try {
            t = LocalTime.parse(a.optString("time", ""));
        } catch (RuntimeException e) {
            return null;
        }
        String repeat = a.optString("repeat", "all");
        for (int i = 0; i < 8; i++) {
            LocalDate d = now.toLocalDate().plusDays(i);
            ZonedDateTime at = ZonedDateTime.of(d, t, KST);
            if (!at.isAfter(now) || !repeatsOn(repeat, d)) continue;
            return at;
        }
        return null;
    }

    /** 켜진 규칙마다 다음 시각 하나씩 예약하고, 사라지거나 꺼진 규칙의 예약은 지운다. */
    static synchronized void scheduleAll(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        SharedPreferences p = prefs(c);
        Set<String> before = new HashSet<>(p.getStringSet(K_SCHEDULED, new HashSet<>()));
        Set<String> now = new HashSet<>();
        JSONArray list = load(c);
        ZonedDateTime clock = ZonedDateTime.now(KST);
        boolean exact = canExact(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.optJSONObject(i);
            if (a == null || !a.optBoolean("on", true)) continue;
            String id = a.optString("id");
            ZonedDateTime at = nextFire(a, clock);
            if (id.isEmpty() || at == null) continue;
            PendingIntent pi = fireIntent(c, id, PendingIntent.FLAG_UPDATE_CURRENT);
            long ms = at.toInstant().toEpochMilli();
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi);
            now.add(id);
            Log.i(TAG, "scheduled " + id + " at " + at + (exact ? " (exact)" : " (inexact)"));
        }
        before.removeAll(now);
        for (String id : before) {
            PendingIntent pi = fireIntent(c, id, PendingIntent.FLAG_NO_CREATE);
            if (pi != null) {
                am.cancel(pi);
                pi.cancel();
            }
        }
        p.edit().putStringSet(K_SCHEDULED, now).apply();
    }

    private static final String[][] MEAL = {{"breakfast", "아침"}, {"lunch", "점심"}, {"dinner", "저녁"}};

    private static String mealName(String meal) {
        for (String[] m : MEAL) if (m[0].equals(meal)) return m[1];
        return meal;
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /**
     * 규칙 하나를 지금 울린다: (오늘+offset)의 그 끼니 메뉴를 받아 알림으로 띄우고 알림함에 남긴다.
     * 네트워크 스레드에서 부른다. 받기에 실패해도 알림은 띄운다(눌러서 앱에서 확인).
     */
    static void fire(Context c, JSONObject a) {
        LocalDate date = LocalDate.now(KST).plusDays(a.optInt("offset", 0));
        String dorm = a.optString("dorm", "kb");
        String meal = a.optString("meal", "breakfast");
        String title = date.getMonthValue() + "/" + date.getDayOfMonth() + " " + mealName(meal);
        String body = "메뉴를 불러오지 못했어요. 눌러서 확인해 보세요.";
        HttpURLConnection conn = null;
        try {
            String q = "dorm=" + URLEncoder.encode(dorm, "UTF-8") + "&date=" + date + "&meal=" + URLEncoder.encode(meal, "UTF-8");
            conn = (HttpURLConnection) new URL(BuildConfig.BASE_URL + "/api/notify?" + q).openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/json");
            if (conn.getResponseCode() == 200) {
                JSONObject j = new JSONObject(readAll(conn.getInputStream()));
                title = j.optString("title", title);
                body = j.optString("body", body);
            } else {
                Log.w(TAG, "notify HTTP " + conn.getResponseCode());
            }
        } catch (Exception e) {
            Log.w(TAG, "notify fetch failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
        String path = "/?dorm=" + enc(dorm) + "&date=" + date + "&meal=" + enc(meal) + "&utm_source=push&utm_medium=notification";
        notify(c, a.optString("id", "test"), title, body, path, date.toString());
        remember(c, title, body);
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return s;
        }
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.deleteNotificationChannel(OLD_CHANNEL);
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_menu), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_menu_desc));
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableLights(true);
        ch.setShowBadge(true);
        nm.createNotificationChannel(ch);
    }

    private static Bitmap appIcon(Context c) {
        if (largeIcon != null) return largeIcon;
        Drawable d = c.getPackageManager().getApplicationIcon(c.getApplicationInfo());
        int s = Math.max(1, (int) (64 * c.getResources().getDisplayMetrics().density));
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(b);
        d.setBounds(0, 0, s, s);
        d.draw(canvas);
        largeIcon = b;
        return b;
    }

    private static void notify(Context c, String alarmId, String title, String body, String path, String date) {
        ensureChannel(c);
        long now = System.currentTimeMillis();
        int childId = alarmId.hashCode() & 0x7fffffff;
        if (childId == 0) childId = 1;
        int summaryId = ("summary:" + date).hashCode() & 0x7fffffff;
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_PATH, path);
        PendingIntent pi = PendingIntent.getActivity(c, childId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String group = "menu-" + date;
        Notification.Action action = new Notification.Action.Builder(
                android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_notify),
                c.getString(R.string.action_open_menu),
                pi).build();
        Notification child = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setLargeIcon(appIcon(c))
                .setColor(0xFFFF6A45)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setWhen(now)
                .setShowWhen(true)
                .setGroup(group)
                .addAction(action)
                .build();
        Notification summary = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setLargeIcon(appIcon(c))
                .setColor(0xFFFF6A45)
                .setContentTitle(c.getString(R.string.notif_group))
                .setContentText(title)
                .setStyle(new Notification.InboxStyle().addLine(title).setSummaryText(c.getString(R.string.app_name)))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setWhen(now)
                .setShowWhen(true)
                .setGroup(group)
                .setGroupSummary(true)
                .setGroupAlertBehavior(Notification.GROUP_ALERT_CHILDREN)
                .build();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.notify(childId, child);
        nm.notify(summaryId, summary);
    }

    private static synchronized void remember(Context c, String title, String body) {
        JSONArray list;
        try {
            list = new JSONArray(prefs(c).getString(K_INBOX, "[]"));
        } catch (JSONException e) {
            list = new JSONArray();
        }
        JSONArray next = new JSONArray();
        try {
            next.put(new JSONObject().put("title", title).put("body", body).put("at", System.currentTimeMillis()));
        } catch (JSONException e) {
            return;
        }
        for (int i = 0; i < list.length() && next.length() < INBOX_MAX; i++) next.put(list.opt(i));
        prefs(c).edit().putString(K_INBOX, next.toString()).apply();
    }

    static String inbox(Context c) {
        return prefs(c).getString(K_INBOX, "[]");
    }
}
