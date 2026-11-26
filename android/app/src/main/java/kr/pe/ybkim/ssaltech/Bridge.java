package kr.pe.ybkim.ssaltech;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 웹 앱의 window.SsalTechNative (web/src/ui/native.ts). JavaBridge 스레드에서 불리므로
 * 화면을 건드리는 일은 UI 스레드로 넘긴다.
 */
final class Bridge {
    static final int REQ_NOTIFY = 1;
    private static final String K_ASKED = "asked_notify";
    private final MainActivity activity;

    Bridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void setAlarms(String json) {
        try {
            Alarms.save(activity, json);
        } catch (JSONException e) {
            Log.w(Alarms.TAG, "bad alarms json", e);
        }
    }

    /** "granted" | "denied" | "ask" */
    @JavascriptInterface
    public String permission() {
        if (activity.getSystemService(NotificationManager.class).areNotificationsEnabled()) return "granted";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "denied";
        boolean asked = Alarms.prefs(activity).getBoolean(K_ASKED, false);
        // 한 번 거절하면 rationale 이 true, 두 번 거절(다시 묻지 않음)하면 다시 false 가 된다.
        if (!asked || activity.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) return "ask";
        return "denied";
    }

    @JavascriptInterface
    public void requestPermission() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && "ask".equals(permission())) {
                Alarms.prefs(activity).edit().putBoolean(K_ASKED, true).apply();
                activity.requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
            } else {
                // 다시 묻지 못하면 앱 알림 설정으로 보낸다.
                activity.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName()));
            }
        });
    }

    @JavascriptInterface
    public boolean exactAlarms() {
        return Alarms.canExact(activity);
    }

    @JavascriptInterface
    public void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        activity.runOnUiThread(() -> activity.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + activity.getPackageName()))));
    }

    @JavascriptInterface
    public String inbox() {
        return Alarms.inbox(activity);
    }

    @JavascriptInterface
    public String version() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    @JavascriptInterface
    public void share(String title, String text, String url) {
        activity.runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TITLE, title);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            String body = text == null ? "" : text;
            if (url != null && !url.isEmpty()) body = body.isEmpty() ? url : body + "\n" + url;
            send.putExtra(Intent.EXTRA_TEXT, body);
            activity.startActivity(Intent.createChooser(send, title == null ? "" : title));
        });
    }

    @JavascriptInterface
    public String update() {
        return Updater.statusJson();
    }

    @JavascriptInterface
    public void checkUpdate() {
        Updater.check(activity, true);
    }

    @JavascriptInterface
    public void startUpdate() {
        activity.runOnUiThread(() -> Updater.startUpdate(activity));
    }

    /** 규칙 하나를 지금 한 번 울린다(알림 탭의 "시험 알림"). */
    @JavascriptInterface
    public void test(String json) {
        final JSONObject a;
        try {
            a = new JSONObject(json);
        } catch (JSONException e) {
            return;
        }
        new Thread(() -> {
            Alarms.fire(activity.getApplicationContext(), a);
            activity.notifyWeb();
        }, "ssaltech-test").start();
    }
}
