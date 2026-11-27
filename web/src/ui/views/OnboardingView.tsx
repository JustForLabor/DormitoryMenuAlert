"use client";

// 첫 실행 (WasteLess 온보딩 rOnb): 식당 → 알레르기 → 추천 알림 → 준비 끝.
import type { MouseEvent, ReactNode } from "react";
import { DORMS, MEAL_NAME } from "@/lib/menu";
import { useMobile } from "../app";
import { haptic, prefersReducedMotion, Swap } from "../motion";
import { bridge } from "../native";
import { AL, type AppState } from "../store";
import { Ico, Icon, Mascot, st } from "../kit";
import { DORM_ICON } from "../sheets";
import { PRESETS, newId } from "./AlarmView";

const PCT = [33, 66, 100];

function pop(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  el.animate({ scale: [0.9, 1.07, 1] }, { duration: 320, easing: "cubic-bezier(.3,1.5,.5,1)" });
}

function shake(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  el.animate({ translate: ["0", "-6px", "6px", "-3px", "3px", "0"] }, { duration: 320, easing: "ease-out" });
}

export function OnboardingView() {
  const { S, ob, setOb, go, back, obStep, toast, confetti, replaceState, setDormSel } = useMobile();
  const step = ob.step;
  const set = (p: Partial<typeof ob>) => setOb({ ...ob, ...p });
  const obNext = () => obStep(step + 1);
  const obBack = () => back(() => (S ? go("my") : undefined));
  const tgOb = (n: number, e: MouseEvent<HTMLElement>) => {
    haptic("select");
    pop(e.currentTarget);
    set({ al: ob.al.includes(n) ? ob.al.filter((x) => x !== n) : [...ob.al, n] });
  };
  const refuse = (e: MouseEvent<HTMLElement>) => {
    haptic("warn");
    shake(e.currentTarget);
    toast("위에서 먼저 골라 주세요");
  };
  const dorm = DORMS.find((d) => d.id === ob.dorm) ?? DORMS[0];
  const finish = (e: MouseEvent) => {
    const base: AppState = S ? structuredClone(S) : { dorm: dorm.id, allergy: [], rates: {}, alarms: [] };
    const next: AppState = { ...base, dorm: dorm.id, allergy: [...ob.al].sort((a, b) => a - b) };
    if (ob.preset && !next.alarms.length) next.alarms = PRESETS.slice(0, 2).map((p) => ({ ...p, id: newId(), dorm: dorm.id, on: true }));
    replaceState(next);
    setDormSel(null);
    confetti(e.clientX, e.clientY);
    // 앱 안이면 알림 권한을 이때 묻는다(규칙을 켠 경우만).
    if (next.alarms.some((a) => a.on) && bridge()?.permission() === "ask") bridge()?.requestPermission();
    window.setTimeout(() => go("home"), 350);
  };

  if (step >= 3) {
    return (
      <div className="ob">
        <Swap k={step}>
          <div className="done">
            <div className="ill">
              <Mascot />
            </div>
            <h2>준비 끝!</h2>
            <p className="d">
              {dorm.label}, 반가워요!
              <br />
              오늘 메뉴부터 같이 볼까요?
            </p>
          </div>
        </Swap>
        <div className="obb">
          <button className="cta press" onClick={finish}>
            시작하기
          </button>
        </div>
      </div>
    );
  }

  let ok = true;
  let btn = "다음";
  let body: ReactNode;
  if (step === 0) {
    ok = !!ob.dorm;
    body = (
      <>
        <h2 className="st">어느 식당에서 먹나요?</h2>
        <p className="d st" style={st(1)}>
          서울과학기술대학교 생활관 식당이에요. 나중에 MY에서 바꿀 수 있어요.
        </p>
        <div className="orgs">
          {DORMS.map((d, i) => (
            <button
              key={d.id}
              className={`org press st${ob.dorm === d.id ? " on" : ""}`}
              style={st(i + 2)}
              onClick={() => {
                if (ob.dorm === d.id) return;
                haptic("select");
                set({ dorm: d.id });
              }}
            >
              <Ico k={DORM_ICON[d.id]} size={44} />
              <p>
                {d.label}
                <small>{d.sub} 학생 이용</small>
              </p>
              <span className="ck">
                <Icon k="check" />
              </span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (step === 1) {
    btn = ob.al.length ? `알레르기 ${ob.al.length}개 등록하기` : "알레르기 없어요";
    body = (
      <>
        <h2 className="st">알레르기가 있나요?</h2>
        <p className="d st" style={st(1)}>
          고른 번호는 이 기기에만 저장되고 서버로 보내지 않아요.
          <br />
          메뉴 이름에 그 재료가 보이면 빨갛게 표시해 드려요.
        </p>
        <div className="chips">
          {AL.slice(1).map((a, i) => (
            <button key={a} className={`chip st${ob.al.includes(i + 1) ? " on" : ""}`} style={st(Math.min(i, 12))} onClick={(e) => tgOb(i + 1, e)}>
              <i>{i + 1}</i>
              {a}
            </button>
          ))}
        </div>
      </>
    );
  } else {
    btn = ob.preset ? "이 알림으로 할게요" : "알림 없이 시작";
    body = (
      <>
        <h2 className="st">메뉴 알림을 받을까요?</h2>
        <p className="d st" style={st(1)}>
          정한 시각에 메뉴를 보내 드려요. 알림 탭에서 시각·메뉴·식당을 언제든 바꿀 수 있어요.
        </p>
        <div className="orgs">
          {[true, false].map((v, i) => (
            <button
              key={String(v)}
              className={`org press st${ob.preset === v ? " on" : ""}`}
              style={st(i + 2)}
              onClick={() => {
                if (ob.preset === v) return;
                haptic("select");
                set({ preset: v });
              }}
            >
              <Ico k={v ? "bell" : "clock"} size={44} />
              <p>
                {v ? "추천 알림 받기" : "나중에 할게요"}
                <small>
                  {v
                    ? PRESETS.slice(0, 2)
                        .map((p) => `${p.time} ${p.offset ? "내일" : "오늘"} ${MEAL_NAME[p.meal]}`)
                        .join(" · ")
                    : "알림 없이 식단만 볼게요"}
                </small>
              </p>
              <span className="ck">
                <Icon k="check" />
              </span>
            </button>
          ))}
        </div>
        {!bridge() && (
          <p className="d st" style={{ ...st(4), marginTop: 14, fontSize: 13 }}>
            이 브라우저로도 알림을 받을 수 있어요. 앱을 꺼도 정확한 시각에 울리게 하려면 Android 앱을 써 주세요.
          </p>
        )}
      </>
    );
  }

  return (
    <div className="ob">
      <Swap k="obt">
        <div className="obt">
          {step > 0 || S ? (
            <button className="ib" onClick={obBack} aria-label="뒤로">
              <Icon k="back" />
            </button>
          ) : (
            <span className="ib" aria-hidden="true" />
          )}
          <div className="prog" role="progressbar" aria-label="진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={PCT[step]}>
            <i style={{ width: `${PCT[step]}%` }} />
          </div>
        </div>
      </Swap>
      <Swap k={step}>
        <div className="ao-step">{body}</div>
      </Swap>
      <div className="obb">
        <button className={`cta press${ok ? "" : " dis"}`} aria-disabled={ok ? undefined : true} onClick={ok ? obNext : refuse}>
          {btn}
        </button>
      </div>
    </div>
  );
}
