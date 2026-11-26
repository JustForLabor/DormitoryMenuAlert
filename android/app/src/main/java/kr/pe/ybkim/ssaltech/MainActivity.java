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

/**
 * SsalTech 웹 앱(BuildConfig.BASE_URL)을 띄우는 WebView 껍데기. 화면은 웹과 같고,
 * 이 앱이 더하는 것은 정한 시각 알림(Alarms)뿐이다. 웹 앱은 window.SsalTechNative 가 있으면 앱 안이라고 본다.
 */
public class MainActivity extends Activity {
    static final String EXTRA_PATH = "path";
    private static final String NATIVE_EVENT = "window.dispatchEvent(new Event('ssaltech-native'))";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
                Uri u = req.getUrl();
                if (u.getHost() != null && u.getHost().equals(Uri.parse(BuildConfig.BASE_URL).getHost())) return false;
                openOutside(u);
                return true;
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
    }

    private static String urlFor(Intent intent) {
        String path = intent == null ? null : intent.getStringExtra(EXTRA_PATH);
        return BuildConfig.BASE_URL + (path != null && path.startsWith("/") ? path : "/");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.hasExtra(EXTRA_PATH)) web.loadUrl(urlFor(intent));
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, u.toString(), Toast.LENGTH_SHORT).show();
        }
    }

    /** 권한·알림함이 바뀌었다고 웹 앱에 알린다(native.ts useNativeState 가 다시 읽는다). */
    void notifyWeb() {
        runOnUiThread(() -> web.evaluateJavascript(NATIVE_EVENT, null));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == Bridge.REQ_NOTIFY) notifyWeb();
    }

    @Override
    protected void onResume() {
        super.onResume();
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
        web.destroy();
        super.onDestroy();
    }
}
