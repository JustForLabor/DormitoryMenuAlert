"use client";

// 알림 탭: 휴대폰 화면의 알림 규칙(C 버전 `dorm-menu alarm add`)을 넓게 보고 고친다.
// 이 브라우저 알림(웹 푸시)과 Android 앱 알림을 함께 둔다.
import { useState } from "react";
import { DORMS, MEALS, MEAL_NAME, dormOf, type Dorm, type Meal } from "@/lib/menu";
import { Ico, Mascot } from "../kit";
import { APK_URL } from "../native";
import { DORM_ICON } from "../sheets";
import { WebPushCard } from "../WebPushCard";
import { FavAlarmCard } from "../FavAlarmCard";
import { deliveredAlarms, type Alarm, type Repeat } from "../store";
import { PRESETS, newId, nextFire, ruleText } from "../views/AlarmView";
import { Seg, dayLabel, st, useDesk } from "./shared";

const REPEATS: readonly (readonly [Repeat, string])[] = [
  ["all", "매일"],
  ["weekday", "평일"],
  ["weekend", "주말"],
];

const sameRule = (a: Pick<Alarm, "offset" | "meal" | "time" | "dorm">, b: Pick<Alarm, "offset" | "meal" | "time" | "dorm">) =>
  a.offset === b.offset && a.meal === b.meal && a.time === b.time && a.dorm === b.dorm;

export function AlarmPage() {
  const { s, update, today, toast } = useDesk();
  const on = s.alarms.filter((a) => a.on);
  // nextFire는 오늘 이미 지난 시각을 건너뛴다
  const next = on
    .map((a) => ({ a, d: nextFire(a, today) }))
    .filter((x): x is { a: Alarm; d: string } => x.d !== null)
    .sort((x, y) => (x.d === y.d ? x.a.time.localeCompare(y.a.time) : x.d.localeCompare(y.d)))[0];
  return (
    <>
      <header className="ph st" style={st(0)}>
        <div>
          <h1>알림</h1>
          <p>정한 시각에 메뉴를 보내 드려요. 이 브라우저 알림 또는 Android 앱이 울려요.</p>
        </div>
      </header>
      <section className="ahero st" style={st(1)}>
        <div>
          <p className="kicker">다음 알림</p>
          {next ? (
            <>
              <h2>
                {dayLabel(next.d, today)} {next.a.time}
              </h2>
              <p>
                {ruleText(next.a)} · {dormOf(next.a.dorm).label}
              </p>
            </>
          ) : (
            <>
              <h2>켜진 알림이 없어요</h2>
              <p>오른쪽에서 규칙을 만들거나 추천 규칙을 눌러 보세요</p>
            </>
          )}
          <span className="pill">이 브라우저에 켜진 규칙 {on.length}개</span>
        </div>
        <span className="bellbox" aria-hidden="true">
          <span className="ring" />
          <span className="ring r2" />
          <Ico k="bell" size={128} />
          <Mascot className="am" wave={false} />
        </span>
      </section>
      <div className="st" style={st(2)}>
        <WebPushCard alarms={deliveredAlarms(s)} toast={toast} variant="desktop" />
      </div>
      <FavAlarmCard s={s} update={update} toast={toast} variant="desktop" />
      <div className="duo">
        <Rules />
        <NewRule />
      </div>
      <Install />
    </>
  );
}

function Rules() {
  const { s, update, today, toast } = useDesk();
  const presets = PRESETS.filter((p) => !s.alarms.some((a) => sameRule(a, { ...p, dorm: s.dorm })));
  return (
    <section className="sec st" style={st(2)}>
      <div className="sh">
        <h2>내 알림 규칙</h2>
        <span>{s.alarms.length}개</span>
      </div>
      {s.alarms.length ? (
        <ul className="rules">
          {s.alarms.map((a, i) => {
            const d = nextFire(a, today);
            return (
              <li key={a.id} className={a.on ? "" : "off"} style={st(i)}>
                <Ico k={DORM_ICON[a.dorm]} size={40} />
                <span className="rt">
                  <b>{a.time}</b>
                  <small>
                    {ruleText(a)} · {dormOf(a.dorm).name}
                    {a.on && d ? ` · 다음 ${dayLabel(d, today)}` : ""}
                  </small>
                </span>
                <button
                  className={`sw${a.on ? " on" : ""}`}
                  role="switch"
                  aria-checked={a.on}
                  aria-label={`${ruleText(a)} 켜기`}
                  onClick={() => update((x) => void (x.alarms[i].on = !x.alarms[i].on))}
                >
                  <i />
                </button>
                <button
                  className="del"
                  aria-label={`${ruleText(a)} 지우기`}
                  onClick={() => {
                    update((x) => void x.alarms.splice(i, 1));
                    toast("알림 규칙을 지웠어요");
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="none">아직 규칙이 없어요. 추천 규칙을 누르면 바로 추가돼요.</p>
      )}
      {presets.length > 0 && (
        <>
          <h3 className="sub-h">추천 규칙 · {dormOf(s.dorm).name}</h3>
          <div className="presets">
            {presets.map((p) => (
              <button
                key={ruleText(p)}
                onClick={() => {
                  update((x) => void x.alarms.push({ ...p, id: newId(), dorm: x.dorm, on: true }));
                  toast(`${ruleText(p)} 알림을 추가했어요`);
                }}
              >
                + {ruleText(p)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function NewRule() {
  const { s, update, toast } = useDesk();
  const [v, setV] = useState<Omit<Alarm, "id" | "on">>({ offset: 1, meal: "breakfast", time: "21:00", dorm: s.dorm, repeat: "all" });
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((o) => ({ ...o, [k]: x }));
  const dup = s.alarms.some((a) => sameRule(a, v) && a.repeat === v.repeat);
  return (
    <section className="sec form st" style={st(3)}>
      <div className="sh">
        <h2>새 알림</h2>
      </div>
      <label className="fl">언제</label>
      <div className="row">
        <Seg label="반복" value={v.repeat} onChange={(r: Repeat) => set("repeat", r)} items={REPEATS} />
        <input className="time" type="time" value={v.time} required onChange={(e) => e.target.value && set("time", e.target.value)} aria-label="알림 시각" />
      </div>
      <label className="fl">어떤 메뉴</label>
      <div className="row">
        <Seg
          label="날"
          value={String(v.offset)}
          onChange={(o: string) => set("offset", o === "1" ? 1 : 0)}
          items={[
            ["0", "오늘"],
            ["1", "내일"],
          ]}
        />
        <Seg label="메뉴" value={v.meal} onChange={(m: Meal) => set("meal", m)} items={MEALS.map((m) => [m, MEAL_NAME[m]])} />
      </div>
      <label className="fl">식당</label>
      <Seg label="식당" value={v.dorm} onChange={(d: Dorm) => set("dorm", d)} items={DORMS.map((d) => [d.id, d.name])} />
      <p className="preview">
        <b>{ruleText(v)}</b> 메뉴를 {dormOf(v.dorm).name}에서 받아 보내요
      </p>
      <button
        className="cta"
        disabled={dup}
        onClick={() => {
          update((x) => void x.alarms.push({ ...v, id: newId(), on: true }));
          toast(`${ruleText(v)} 알림을 추가했어요`);
        }}
      >
        {dup ? "이미 있는 규칙이에요" : "알림 추가"}
      </button>
    </section>
  );
}

function Install() {
  return (
    <section className="sec install st" style={st(4)}>
      <div className="sh">
        <h2>휴대폰에서 알림 받기</h2>
        <span>이 브라우저로도 받을 수 있고, Android 앱은 더 정확한 시각에 울려요.</span>
      </div>
      <ol className="steps">
        <li style={st(0)}>
          <i>1</i>
          <b>Android 앱 받기</b>
          <p>휴대폰에서 이 사이트를 열고 APK를 받아요</p>
        </li>
        <li style={st(1)}>
          <i>2</i>
          <b>설치 허용</b>
          <p>“출처를 알 수 없는 앱” 설치를 한 번 허용해요</p>
        </li>
        <li style={st(2)}>
          <i>3</i>
          <b>알림 규칙 정하기</b>
          <p>처음 화면에서 시각을 고르면 정확한 시각에 울려요</p>
        </li>
        <li style={st(3)}>
          <i className="ap">
            <Ico k="apple" size={22} />
          </i>
          <b>아이폰은 홈 화면에</b>
          <p>Safari 공유 → 홈 화면에 추가. iOS 16.4 이상이면 이 브라우저 알림을 받아요</p>
        </li>
      </ol>
      <a className="cta" href={APK_URL} download>
        Android 앱 받기 (APK)
      </a>
    </section>
  );
}
