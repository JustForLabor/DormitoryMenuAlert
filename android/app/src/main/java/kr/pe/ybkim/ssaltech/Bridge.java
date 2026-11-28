package kr.pe.ybkim.ssaltech;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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

    private static Intent textIntent(String title, String text, String url) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TITLE, title);
        send.putExtra(Intent.EXTRA_SUBJECT, title);
        String body = text == null ? "" : text;
        if (url != null && !url.isEmpty()) body = body.isEmpty() ? url : body + "\n" + url;
        send.putExtra(Intent.EXTRA_TEXT, body);
        return send;
    }

    @JavascriptInterface
    public void share(String title, String text, String url) {
        Intent send = textIntent(title, text, url);
        activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, title == null ? "" : title)));
    }

    /** 글과 링크를 한 앱(예: 인스타그램 DM)으로 바로 보낸다. 그 앱이 없으면 false. */
    @JavascriptInterface
    public boolean shareTo(String pkg, String title, String text, String url) {
        Intent send = textIntent(title, text, url).setPackage(pkg);
        if (send.resolveActivity(activity.getPackageManager()) == null) return false;
        activity.runOnUiThread(() -> activity.startActivity(send));
        return true;
    }

    /**
     * 이 사이트의 이미지(path, 예: /s/kb/2026-11-28/lunch/story)를 받아 한 앱으로 보낸다.
     * 인스타그램은 받은 이미지를 스토리·피드·DM 중에 고르게 한다. 그 앱이 없으면 false.
     */
    @JavascriptInterface
    public boolean shareImageTo(String pkg, String path) {
        if (path == null || !path.startsWith("/s/")) return false;
        Intent probe = new Intent(Intent.ACTION_SEND).setType("image/png").setPackage(pkg);
        if (probe.resolveActivity(activity.getPackageManager()) == null) return false;
        new Thread(() -> {
            File out = new File(ShareProvider.dir(activity), "ssaltech.png");
            HttpURLConnection conn = null;
            try {
                if (!out.getParentFile().isDirectory() && !out.getParentFile().mkdirs()) throw new java.io.IOException("mkdir");
                conn = (HttpURLConnection) new URL(BuildConfig.BASE_URL + path).openConnection();
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(15_000);
                if (conn.getResponseCode() != 200) throw new java.io.IOException("HTTP " + conn.getResponseCode());
                try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[16 * 1024];
                    for (int n; (n = in.read(buf)) > 0; ) os.write(buf, 0, n);
                }
            } catch (java.io.IOException e) {
                Log.w("SsalTech", "share image", e);
                activity.runOnUiThread(() -> Toast.makeText(activity, R.string.share_image_failed, Toast.LENGTH_SHORT).show());
                return;
            } finally {
                if (conn != null) conn.disconnect();
            }
            android.net.Uri uri = ShareProvider.uriFor(out.getName());
            Intent send = new Intent(Intent.ACTION_SEND).setType("image/png").setPackage(pkg);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.runOnUiThread(() -> activity.startActivity(send));
        }, "ssaltech-share").start();
        return true;
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

    /** 웹이 즐겨찾기 알림 규칙(kind "fav")을 넘겨도 되는지 알아보는 표시. */
    @JavascriptInterface
    public boolean favAlarms() {
        return true;
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
