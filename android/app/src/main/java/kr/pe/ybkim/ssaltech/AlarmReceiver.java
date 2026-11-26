package kr.pe.ybkim.ssaltech;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** 예약한 시각에 울린다: 메뉴를 받아 알림을 띄우고 그 규칙의 다음 시각을 다시 예약한다. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Alarms.ACTION_FIRE.equals(intent.getAction())) return;
        String id = intent.getStringExtra(Alarms.EXTRA_ID);
        Context app = context.getApplicationContext();
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                JSONObject a = id == null ? null : Alarms.find(app, id);
                if (a != null && a.optBoolean("on", true)) Alarms.fire(app, a);
            } finally {
                Alarms.scheduleAll(app);
                result.finish();
            }
        }, "ssaltech-fire").start();
    }
}
