package kr.pe.ybkim.ssaltech;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 재부팅·앱 업데이트·시계 변경·정확한 알람 권한 변경 뒤에 예약을 다시 건다(AlarmManager 예약은 재부팅 때 사라진다). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Alarms.scheduleAll(context.getApplicationContext());
    }
}
