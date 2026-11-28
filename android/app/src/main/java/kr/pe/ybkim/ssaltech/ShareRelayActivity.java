package kr.pe.ybkim.ssaltech;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * 휴대폰 브라우저의 "인스타그램 DM" 버튼이 여는 화면: ssaltech://dm?title=…&url=…
 * 인스타그램의 글 받는 DM 화면(DirectShareHandlerActivity)은 BROWSABLE 이 아니라 Chrome 이 열 수 없어서
 * 이 앱이 대신 연다. 화면 없이 넘겨 주고 바로 닫힌다. 이 사이트의 공유 링크(/s/…)만 받는다.
 */
public final class ShareRelayActivity extends Activity {
    private static final String INSTAGRAM = "com.instagram.android";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri data = getIntent().getData();
        String url = data == null ? null : data.getQueryParameter("url");
        if (ours(url)) {
            String title = data.getQueryParameter("title");
            if (title != null && title.length() > 200) title = title.substring(0, 200);
            Intent send = Bridge.sendTo(this, INSTAGRAM, title, title, url);
            if (send == null) send = Intent.createChooser(Bridge.textIntent(title, title, url), title == null ? "" : title);
            try {
                startActivity(send);
            } catch (ActivityNotFoundException ignored) {
                // 받을 앱이 사라졌으면 할 일이 없다.
            }
        }
        finish();
    }

    private static boolean ours(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        Uri base = Uri.parse(BuildConfig.BASE_URL);
        String path = u.getPath();
        return base.getScheme().equals(u.getScheme()) && base.getAuthority().equals(u.getAuthority())
                && path != null && path.startsWith("/s/");
    }
}
