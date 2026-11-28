package kr.pe.ybkim.ssaltech;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.net.URISyntaxException;

/**
 * SsalTech 웹 앱(BuildConfig.BASE_URL)을 띄우는 WebView 껍데기. 화면은 웹과 같고,
 * 이 앱이 더하는 것은 정한 시각 알림(Alarms)과 앱 안 업데이트(Updater)다.
 * 웹 앱은 window.SsalTechNative 가 있으면 앱 안이라고 본다.
 */
public class MainActivity extends Activity {
    static final String EXTRA_PATH = "path";
    /** 디버그 빌드만 읽는다. 릴리스는 Updater 가 이 값을 버린다. */
    static final String EXTRA_UPDATE_MANIFEST = "update_manifest";
    private static final String NATIVE_EVENT = "window.dispatchEvent(new Event('ssaltech-native'))";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyDebugUpdateOverride(getIntent());
        Alarms.ensureChannel(this);
        web = new WebView(this);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        web.setBackgroundColor(Color.parseColor("#F3F4F7"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " SsalTech/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(this), "SsalTechNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) Toast.makeText(MainActivity.this, R.string.offline, Toast.LENGTH_LONG).show();
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> openOutside(Uri.parse(url)));
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(urlFor(getIntent()));
        // 앱을 처음 열 때도 저장된 규칙을 다시 건다(설치 직후·강제 종료 뒤).
        new Thread(() -> Alarms.scheduleAll(getApplicationContext()), "ssaltech-schedule").start();
        Updater.attach(this);
        Updater.onLaunch(this);
    }

    private static String urlFor(Intent intent) {
        String path = intent == null ? null : intent.getStringExtra(EXTRA_PATH);
        return BuildConfig.BASE_URL + (path != null && path.startsWith("/") ? path : "/");
    }

    private void applyDebugUpdateOverride(Intent intent) {
        if (!BuildConfig.DEBUG || intent == null) return;
        String u = intent.getStringExtra(EXTRA_UPDATE_MANIFEST);
        if (u != null) Updater.setDebugManifest(u);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyDebugUpdateOverride(intent);
        if (intent.hasExtra(EXTRA_PATH)) web.loadUrl(urlFor(intent));
    }

    /** http(s) 같은 호스트만 웹뷰에 두고, intent:·카카오·마켓 등은 앱으로 연다. */
    private boolean handleUrl(Uri u) {
        if (u == null) return true;
        String scheme = u.getScheme();
        if (scheme == null) return true;
        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = Uri.parse(BuildConfig.BASE_URL).getHost();
            if (u.getHost() != null && u.getHost().equals(host)) return false;
            openOutside(u);
            return true;
        }
        if ("intent".equals(scheme)) {
            openIntentUri(u.toString());
            return true;
        }
        openOutside(u);
        return true;
    }

    private void openIntentUri(String raw) {
        Intent intent;
        try {
            intent = Intent.parseUri(raw, Intent.URI_INTENT_SCHEME);
        } catch (URISyntaxException e) {
            Toast.makeText(this, raw, Toast.LENGTH_SHORT).show();
            return;
        }
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setComponent(null);
        intent.setSelector(null);
        try {
            startActivity(intent);
            return;
        } catch (ActivityNotFoundException ignored) {
            // 아래 폴백
        }
        String fallback = intent.getStringExtra("browser_fallback_url");
        if (fallback != null && !fallback.isEmpty()) {
            Uri f = Uri.parse(fallback);
            String sch = f.getScheme();
            if ("http".equals(sch) || "https".equals(sch)) {
                String host = Uri.parse(BuildConfig.BASE_URL).getHost();
                if (f.getHost() != null && f.getHost().equals(host)) web.loadUrl(fallback);
                else openOutside(f);
                return;
            }
        }
        String pkg = intent.getPackage();
        if (pkg != null) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
            } catch (ActivityNotFoundException e) {
                openOutside(Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
            }
        }
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, u.toString(), Toast.LENGTH_SHORT).show();
        }
    }

    /** 권한·알림함·업데이트가 바뀌었다고 웹 앱에 알린다(native.ts 가 다시 읽는다). */
    void notifyWeb() {
        if (web == null) return;
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(NATIVE_EVENT, null);
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == Bridge.REQ_NOTIFY) notifyWeb();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Updater.attach(this);
        Updater.onResume(this);
        if (web != null) notifyWeb();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** 웹 앱이 history 로 시트 닫기·탭 되돌리기를 하므로 뒤로 가기는 먼저 WebView 에 준다. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        web = null;
        super.onDestroy();
    }
}
