package kr.pe.ybkim.ssaltech;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** PackageInstaller 세션 결과. 사용자 확인이 필요하면 그 인텐트를 연다. */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Updater.onInstallResult(context.getApplicationContext(), intent);
    }
}
