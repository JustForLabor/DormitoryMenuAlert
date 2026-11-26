package kr.pe.ybkim.ssaltech;

import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * 앱 안 업데이트. version.json 을 켜질 때(6시간마다)와 checkUpdate() 때 보고,
 * 더 새 버전이면 대화상자를 띄운 뒤 받아 해시 확인하고 PackageInstaller 로 설치한다.
 * 디버그 빌드만 intent extra / setDebugManifest 로 매니페스트 주소를 바꿀 수 있다.
 */
final class Updater {
    static final String CHANNEL = "updates";
    private static final String MANIFEST = "https://dorm.ybkim.pe.kr/app/version.json";
    private static final long CHECK_EVERY_MS = 6L * 60 * 60 * 1000;
    private static final int NOTIF = 7100;
    private static final int TIMEOUT_MS = 20000;
    private static final String K_CHECKED = "update_checked_at";
    private static final String K_LATEST = "update_latest";
    private static final String K_DISMISS = "update_dismissed";
    private static final String K_REOPEN = "update_reopen";
    private static final String K_WAIT_PERM = "update_wait_perm";

    private static final Object LOCK = new Object();
    private static String state = "idle";
    private static double progress = 0;
    private static String error;
    private static JSONObject latest;
    private static String debugManifest;
    private static volatile boolean dialogUp;
    private static volatile boolean busy;
    private static WeakReference<MainActivity> front = new WeakReference<>(null);

    private Updater() {}

    static void attach(MainActivity activity) {
        front = new WeakReference<>(activity);
    }

    /** 디버그 빌드에서만 동작. 릴리스는 인자를 버려 출시 APK 에 시험 주소가 남지 않는다. */
    static void setDebugManifest(String url) {
        if (!BuildConfig.DEBUG) return;
        debugManifest = url == null || url.isEmpty() ? null : url;
    }

    static String manifestUrl() {
        if (BuildConfig.DEBUG && debugManifest != null) return debugManifest;
        return MANIFEST;
    }

    static void onLaunch(MainActivity activity) {
        ensureChannel(activity);
        if (!Alarms.prefs(activity).getBoolean(K_WAIT_PERM, false)) cleanup(activity);
        synchronized (LOCK) {
            latest = readCached(activity);
        }
        long last = Alarms.prefs(activity).getLong(K_CHECKED, 0);
        if (System.currentTimeMillis() - last < CHECK_EVERY_MS) return;
        check(activity, false);
    }

    /** 알 수 없는 앱 설치 설정을 다녀온 뒤, 받기가 끝났으면 설치를 이어 한다. */
    static void onResume(MainActivity activity) {
        if (!Alarms.prefs(activity).getBoolean(K_WAIT_PERM, false)) return;
        if (!canInstall(activity)) return;
        Alarms.prefs(activity).edit().putBoolean(K_WAIT_PERM, false).apply();
        File apk = newestApk(activity);
        if (apk != null) install(activity, apk);
    }

    static boolean consumeReopen(Context c) {
        boolean v = Alarms.prefs(c).getBoolean(K_REOPEN, false);
        if (v) Alarms.prefs(c).edit().putBoolean(K_REOPEN, false).apply();
        return v;
    }

    static void check(MainActivity activity, boolean fromUser) {
        setState("checking", 0, null);
        new Thread(() -> {
            try {
                JSONObject j = fetchManifest();
                Alarms.prefs(activity).edit()
                        .putLong(K_CHECKED, System.currentTimeMillis())
                        .putString(K_LATEST, j.toString())
                        .apply();
                int code = j.optInt("versionCode", 0);
                synchronized (LOCK) {
                    latest = j;
                }
                if (code > BuildConfig.VERSION_CODE) {
                    setState("available", 0, null);
                    int dismissed = Alarms.prefs(activity).getInt(K_DISMISS, 0);
                    if (fromUser || dismissed != code) activity.runOnUiThread(() -> showDialog(activity, j));
                } else {
                    setState("idle", 0, null);
                }
            } catch (Exception e) {
                Log.w(Alarms.TAG, "update check failed", e);
                setState("error", 0, "버전을 확인하지 못했어요");
            }
        }, "ssaltech-update-check").start();
    }

    static void startUpdate(MainActivity activity) {
        synchronized (LOCK) {
            if (busy) return;
            busy = true;
        }
        setState("downloading", 0, null);
        new Thread(() -> {
            File apk = null;
            try {
                JSONObject j;
                synchronized (LOCK) {
                    j = latest;
                }
                if (j == null) j = fetchManifest();
                String url = j.optString("url", "");
                String expect = j.optString("sha256", "");
                long size = j.optLong("size", -1);
                int code = j.optInt("versionCode", 0);
                if (url.isEmpty() || expect.isEmpty()) throw new IllegalStateException("bad manifest");
                cleanup(activity);
                apk = new File(updateDir(activity), "ssaltech-" + code + ".apk");
                download(url, apk, size > 0 ? size : -1);
                String got = sha256(apk);
                if (!expect.equalsIgnoreCase(got)) {
                    if (!apk.delete()) Log.w(Alarms.TAG, "leftover apk");
                    throw new IllegalStateException("sha256 mismatch");
                }
                setState("ready", 1, null);
                File ready = apk;
                activity.runOnUiThread(() -> install(activity, ready));
            } catch (Exception e) {
                Log.w(Alarms.TAG, "update download failed", e);
                if (apk != null && apk.exists() && !apk.delete()) Log.w(Alarms.TAG, "leftover apk");
                cancelNotif(activity);
                setState("error", 0, "업데이트를 받지 못했어요");
                synchronized (LOCK) {
                    busy = false;
                }
            }
        }, "ssaltech-update-dl").start();
    }

    static String statusJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("current", new JSONObject().put("code", BuildConfig.VERSION_CODE).put("name", BuildConfig.VERSION_NAME));
            JSONObject src;
            String st;
            double pr;
            String err;
            synchronized (LOCK) {
                src = latest;
                st = state;
                pr = progress;
                err = error;
            }
            if (src == null) o.put("latest", JSONObject.NULL);
            else {
                JSONObject l = new JSONObject();
                l.put("code", src.optInt("versionCode"));
                l.put("name", src.optString("versionName"));
                l.put("notes", src.optJSONArray("notes") != null ? src.optJSONArray("notes") : new JSONArray());
                l.put("size", src.optLong("size"));
                o.put("latest", l);
            }
            o.put("state", st);
            o.put("progress", pr);
            if (err != null) o.put("error", err);
        } catch (JSONException e) {
            return "{}";
        }
        return o.toString();
    }

    static void onInstallResult(Context c, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    c.startActivity(confirm);
                } catch (RuntimeException e) {
                    Log.w(Alarms.TAG, "confirm intent blocked", e);
                    notifyConfirm(c, confirm);
                }
            }
            return;
        }
        cancelNotif(c);
        synchronized (LOCK) {
            busy = false;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            setState("installing", 1, null);
            return;
        }
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        Log.w(Alarms.TAG, "install status " + status + " " + msg);
        setState("error", 0, "설치가 취소되었거나 실패했어요");
    }

    private static void showDialog(MainActivity activity, JSONObject j) {
        if (activity.isFinishing() || dialogUp) return;
        int code = j.optInt("versionCode", 0);
        if (code <= BuildConfig.VERSION_CODE) return;
        String name = j.optString("versionName", String.valueOf(code));
        StringBuilder msg = new StringBuilder();
        JSONArray notes = j.optJSONArray("notes");
        if (notes != null) {
            for (int i = 0; i < notes.length(); i++) {
                if (msg.length() > 0) msg.append('\n');
                msg.append(notes.optString(i));
            }
        }
        long size = j.optLong("size", 0);
        if (size > 0) {
            if (msg.length() > 0) msg.append("\n\n");
            msg.append(formatSize(size));
        }
        dialogUp = true;
        new AlertDialog.Builder(activity, android.R.style.Theme_Material_Light_Dialog_Alert)
                .setTitle(activity.getString(R.string.update_title, name))
                .setMessage(msg.toString())
                .setPositiveButton(R.string.update_now, (d, w) -> {
                    dialogUp = false;
                    startUpdate(activity);
                })
                .setNegativeButton(R.string.update_later, (d, w) -> {
                    dialogUp = false;
                    Alarms.prefs(activity).edit().putInt(K_DISMISS, code).apply();
                })
                .setOnCancelListener(d -> {
                    dialogUp = false;
                    Alarms.prefs(activity).edit().putInt(K_DISMISS, code).apply();
                })
                .show();
    }

    private static JSONObject fetchManifest() throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(manifestUrl()).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept", "application/json");
        try {
            if (conn.getResponseCode() != 200) throw new IllegalStateException("HTTP " + conn.getResponseCode());
            return new JSONObject(readAll(conn.getInputStream()));
        } finally {
            conn.disconnect();
        }
    }

    private static void download(String url, File dest, long expected) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setInstanceFollowRedirects(true);
        try {
            if (conn.getResponseCode() != 200) throw new IllegalStateException("HTTP " + conn.getResponseCode());
            long total = conn.getContentLengthLong();
            if (total <= 0) total = expected;
            Context c = app();
            if (c != null) ensureChannel(c);
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[8192];
                long got = 0;
                int lastPct = -1;
                for (int n; (n = in.read(buf)) > 0; ) {
                    out.write(buf, 0, n);
                    got += n;
                    double p = total > 0 ? Math.min(1, got / (double) total) : 0;
                    int pct = (int) (p * 100);
                    if (pct != lastPct) {
                        lastPct = pct;
                        setState("downloading", p, null);
                        if (c != null) progressNotif(c, pct, total > 0);
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private static void install(MainActivity activity, File apk) {
        if (!canInstall(activity)) {
            Alarms.prefs(activity).edit().putBoolean(K_WAIT_PERM, true).apply();
            synchronized (LOCK) {
                busy = false;
            }
            setState("ready", 1, null);
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        setState("installing", 1, null);
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        try {
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setSize(apk.length());
            params.setAppPackageName(activity.getPackageName());
            int id = installer.createSession(params);
            try (PackageInstaller.Session session = installer.openSession(id)) {
                try (InputStream in = new FileInputStream(apk);
                     OutputStream out = session.openWrite("ssaltech.apk", 0, apk.length())) {
                    byte[] buf = new byte[8192];
                    for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                    session.fsync(out);
                }
                Intent cb = new Intent(activity, InstallReceiver.class);
                PendingIntent pi = PendingIntent.getBroadcast(activity, id, cb,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                Alarms.prefs(activity).edit().putBoolean(K_REOPEN, true).apply();
                session.commit(pi.getIntentSender());
            }
        } catch (Exception e) {
            Log.w(Alarms.TAG, "install failed", e);
            synchronized (LOCK) {
                busy = false;
            }
            setState("error", 0, "설치를 시작하지 못했어요");
        }
    }

    private static boolean canInstall(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return c.getPackageManager().canRequestPackageInstalls();
    }

    private static void ensureChannel(Context c) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_updates), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(c.getString(R.string.channel_updates_desc));
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private static void progressNotif(Context c, int pct, boolean known) {
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setColor(0xFFFF6A45)
                .setContentTitle(c.getString(R.string.update_downloading))
                .setContentText(known ? pct + "%" : "")
                .setProgress(100, known ? pct : 0, !known)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
        c.getSystemService(NotificationManager.class).notify(NOTIF, n);
    }

    private static void notifyConfirm(Context c, Intent confirm) {
        ensureChannel(c);
        PendingIntent pi = PendingIntent.getActivity(c, NOTIF, confirm,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setColor(0xFFFF6A45)
                .setContentTitle(c.getString(R.string.update_ready))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        c.getSystemService(NotificationManager.class).notify(NOTIF, n);
    }

    private static void cancelNotif(Context c) {
        c.getSystemService(NotificationManager.class).cancel(NOTIF);
    }

    private static void setState(String st, double pr, String err) {
        synchronized (LOCK) {
            state = st;
            progress = pr;
            error = err;
        }
        MainActivity activity = front.get();
        if (activity != null) activity.notifyWeb();
    }

    private static Context app() {
        MainActivity activity = front.get();
        return activity == null ? null : activity.getApplicationContext();
    }

    private static JSONObject readCached(Context c) {
        String s = Alarms.prefs(c).getString(K_LATEST, null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    private static File updateDir(Context c) {
        File d = new File(c.getCacheDir(), "updates");
        if (!d.isDirectory() && !d.mkdirs()) Log.w(Alarms.TAG, "cache dir");
        return d;
    }

    private static File newestApk(Context c) {
        File[] files = updateDir(c).listFiles();
        File best = null;
        if (files == null) return null;
        for (File f : files) {
            if (!f.getName().endsWith(".apk")) continue;
            if (best == null || f.lastModified() > best.lastModified()) best = f;
        }
        return best;
    }

    private static void cleanup(Context c) {
        File[] files = updateDir(c).listFiles();
        if (files == null) return;
        for (File f : files) {
            if (!f.delete()) Log.w(Alarms.TAG, "cleanup " + f.getName());
        }
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format(Locale.US, "%02x", b));
        return hex.toString();
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    private static String formatSize(long n) {
        if (n < 1024 * 1024) return String.format(Locale.US, "%.0f KB", n / 1024.0);
        return String.format(Locale.US, "%.1f MB", n / (1024.0 * 1024.0));
    }
}
