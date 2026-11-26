"use client";

// 이 브라우저 알림 카드. Android 앱 안에서는 그리지 않는다(앱 알림이 이미 있다).
import { useSyncExternalStore } from "react";
import { Ico } from "./kit";
import { APK_URL, NATIVE_EVENT, bridge } from "./native";
import type { Alarm } from "./store";
import { subscribePush, testPush, unsubscribePush, useWebPush, type PushPhase } from "./webpush";

const COPY: Record<PushPhase, string> = {
  "ios-install": "아이폰은 홈 화면에 추가한 뒤에 알림을 받을 수 있어요. iOS 16.4 이상이 필요해요. Safari 아래쪽 공유 → 홈 화면에 추가 → 추가를 눌러 주세요.",
  "ios-old": "이 아이폰은 iOS 16.4보다 낮아서 브라우저 알림을 받을 수 없어요. Android 앱을 써 주세요.",
  unsupported: "이 브라우저는 알림을 지원하지 않아요. Android 앱에서는 받을 수 있어요.",
  denied: "알림이 차단돼 있어요. 주소창의 자물쇠 → 사이트 설정에서 알림을 허용해 주세요.",
  default: "정한 시각에 그 끼니 메뉴를 이 브라우저로 보내 드려요. 브라우저를 닫아도 울려요.",
  granted: "알림은 허용돼 있어요. 구독하면 정한 시각에 메뉴가 와요.",
  subscribed: "이 브라우저로 알림을 받는 중이에요. 규칙을 바꾸면 여기에도 반영돼요.",
};

const CHIP: Record<PushPhase, readonly [string, "" | "on" | "bad"]> = {
  "ios-install": ["홈 화면 추가 필요", ""],
  "ios-old": ["지원 안 함", "bad"],
  unsupported: ["지원 안 함", "bad"],
  denied: ["차단됨", "bad"],
  default: ["꺼짐", ""],
  granted: ["허용됨", ""],
  subscribed: ["받는 중", "on"],
};

export function WebPushCard({
  alarms,
  toast,
  variant,
  onApk,
}: {
  alarms: readonly Alarm[];
  toast: (m: string) => void;
  variant: "mobile" | "desktop";
  onApk?: () => void;
}) {
  const native = useSyncExternalStore(
    (cb) => {
      window.addEventListener(NATIVE_EVENT, cb);
      return () => window.removeEventListener(NATIVE_EVENT, cb);
    },
    () => !!bridge(),
    () => false,
  );
  const { phase, busy, run } = useWebPush();
  if (native) return null;

  const subscribe = () => void run(() => subscribePush(alarms), "이 브라우저로 알림을 받을게요.", toast);
  const test = () => void run(testPush, "테스트 알림을 보냈어요.", toast);
  const unsubscribe = () => void run(unsubscribePush, "알림 구독을 끊었어요.", toast);
  const canSubscribe = phase === "default" || phase === "granted";
  const apk = variant === "mobile" && onApk ? (
    <button type="button" className="pbtn press" onClick={onApk}>Android 앱으로 받기</button>
  ) : variant === "desktop" ? (
    <a className="ghost sm" href={APK_URL} download>Android 앱으로 받기</a>
  ) : null;

  const actions = (
    <>
      {canSubscribe && (
        <button type="button" className={variant === "mobile" ? "cta press" : "cta sm"} disabled={busy} onClick={subscribe}>
          알림 받기
        </button>
      )}
      {phase === "subscribed" && (
        <>
          <button type="button" className={variant === "mobile" ? "cta press" : "cta sm"} disabled={busy} onClick={test}>테스트 알림</button>
          <button type="button" className={variant === "mobile" ? "pbtn press" : "ghost sm"} disabled={busy} onClick={unsubscribe}>구독 끊기</button>
        </>
      )}
      {apk}
    </>
  );

  if (variant === "desktop") {
    const [chip, tone] = CHIP[phase];
    return (
      <section className="pushcard">
        <Ico k="bell" size={56} className="pi" />
        <div className="pc">
          <h3>
            이 브라우저로 알림 받기 <span className={`pc-chip ${tone}`}>{chip}</span>
          </h3>
          <p>{COPY[phase]}</p>
        </div>
        <div className="push-acts">{actions}</div>
      </section>
    );
  }
  return (
    <div className="card">
      <h3>이 브라우저로 알림 받기</h3>
      <p className="sub">{COPY[phase]}</p>
      <div className="push-acts">{actions}</div>
    </div>
  );
}
