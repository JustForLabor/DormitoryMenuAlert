"use client";

// 즐겨찾기 메뉴 알림 카드 (휴대폰·PC 알림 탭). 규칙 하나를 켜고 언제 받을지 고른다(추천 세 가지 또는 직접).
// 실제 규칙은 store.deliveredAlarms가 kind "fav"로 만들어 Android 앱·웹 푸시 서버에 넘긴다.
import { useState } from "react";
import { favAlarmsSupported } from "./native";
import { FAV_ALARM_DEFAULT, favorites, type AppState, type FavAlarm } from "./store";

const WHEN: readonly (readonly [string, Pick<FavAlarm, "offset" | "time">, string])[] = [
  ["eve", { offset: 1, time: "21:00" }, "전날 밤 9시"],
  ["morning", { offset: 0, time: "07:30" }, "당일 아침 7:30"],
  ["noon", { offset: 0, time: "10:30" }, "당일 오전 10:30"],
];

const whenKey = (f: FavAlarm) => WHEN.find(([, w]) => w.offset === f.offset && w.time === f.time)?.[0] ?? "custom";
const whenLabel = (f: FavAlarm) => WHEN.find(([k]) => k === whenKey(f))?.[2] ?? `${f.offset ? "전날" : "당일"} ${f.time}`;

export function FavAlarmCard({
  s,
  update,
  toast,
  variant,
  className = "",
}: {
  s: AppState;
  update: (fn: (x: AppState) => void) => void;
  toast: (m: string) => void;
  variant: "mobile" | "desktop";
  className?: string;
}) {
  const f = s.favAlarm ?? FAV_ALARM_DEFAULT;
  const favs = [...favorites(s)];
  const supported = favAlarmsSupported();
  const [custom, setCustom] = useState(() => whenKey(f) === "custom");
  const label = whenLabel(f);
  const toggle = () => {
    update((x) => void (x.favAlarm = { ...f, on: !f.on }));
    toast(f.on ? "즐겨찾기 알림을 껐어요" : favs.length ? `즐겨찾기 메뉴가 나오면 ${label}에 알려 드려요` : "식단표에서 ♡를 눌러 메뉴를 즐겨찾기해 주세요");
  };
  const pick = (k: string) => {
    setCustom(k === "custom");
    const w = WHEN.find(([key]) => key === k)?.[1];
    if (w) update((x) => void (x.favAlarm = { ...f, ...w, on: true }));
  };
  const setWhen = (w: Partial<Pick<FavAlarm, "offset" | "time">>) => update((x) => void (x.favAlarm = { ...f, ...w, on: true }));
  const keyOn = custom ? "custom" : whenKey(f);
  const choices = [...WHEN.map(([k, , name]) => [k, name] as const), ["custom", "직접 정하기"] as const];
  // 직접 정하기: 전날·당일과 시각
  const customRow = custom && (
    <div className="favc">
      {([1, 0] as const).map((o) => (
        <button key={o} className={f.offset === o ? "on" : ""} aria-pressed={f.offset === o} onClick={() => setWhen({ offset: o })}>
          {o ? "전날" : "당일"}
        </button>
      ))}
      <input type="time" value={f.time} required onChange={(e) => e.target.value && setWhen({ time: e.target.value })} aria-label="즐겨찾기 알림 시각" />
    </div>
  );
  const sub = !supported
    ? "앱을 1.2.0으로 업데이트하면 받을 수 있어요"
    : favs.length
      ? `${favs.slice(0, 2).join(", ")}${favs.length > 2 ? ` 외 ${favs.length - 2}개` : ""} · ${f.on ? label : "꺼짐"}`
      : "식단표에서 메뉴 옆 ♡를 누르면 즐겨찾기돼요";

  if (variant === "mobile")
    return (
      <div className={`lc ${className}`}>
        <h3>즐겨찾기 메뉴 알림</h3>
        <div className="lr">
          <span className="sq favi" aria-hidden="true">
            ♥
          </span>
          <p style={{ flex: 1, opacity: f.on ? 1 : 0.6 }}>
            나오는 날 알려 줘요
            <small>{sub}</small>
          </p>
          <button className={`tg ${f.on ? "on" : ""}`} role="switch" aria-checked={f.on} aria-label="즐겨찾기 메뉴 알림" disabled={!supported} onClick={toggle} />
        </div>
        {f.on && (
          <>
            <div className="seg3" style={{ margin: "4px 0 10px", gridTemplateColumns: "1fr 1fr" }}>
              {choices.map(([k, name]) => (
                <button key={k} className={keyOn === k ? "on" : ""} onClick={() => pick(k)}>
                  {name}
                </button>
              ))}
            </div>
            {customRow}
          </>
        )}
      </div>
    );

  return (
    <section className={`sec ${className}`}>
      <div className="sh">
        <h2>즐겨찾기 메뉴 알림</h2>
        <span>{favs.length}개 메뉴</span>
      </div>
      <ul className="rules">
        <li className={f.on ? "" : "off"}>
          <span className="favi" aria-hidden="true">
            ♥
          </span>
          <span className="rt">
            <b>나오는 날 알려 줘요</b>
            <small>{sub}</small>
          </span>
          <button className={`sw${f.on ? " on" : ""}`} role="switch" aria-checked={f.on} aria-label="즐겨찾기 메뉴 알림" disabled={!supported} onClick={toggle}>
            <i />
          </button>
        </li>
      </ul>
      {f.on && (
        <>
          <div className="presets" style={{ marginTop: 12 }}>
            {choices.map(([k, name]) => (
              <button key={k} className={keyOn === k ? "on" : ""} aria-pressed={keyOn === k} onClick={() => pick(k)}>
                {name}
              </button>
            ))}
          </div>
          {customRow}
        </>
      )}
    </section>
  );
}
