"use client";

// 알림 탭 (가운데 버튼): C 버전 `dorm-menu alarm add 날 아침|점심|저녁 HH:MM 학사` 규칙을 화면으로 만든 것.
// Android 앱 안에서는 규칙이 바뀔 때마다 앱에 넘겨 AlarmManager로 예약한다(app.tsx). 웹은 이 브라우저 알림으로 보낸다.
import { useState } from "react";
import { DORMS, MEALS, MEAL_NAME, addDays, dormOf, entryEnd, isWeekend, kstMinute, kstToday, shortDate, type Dorm, type Meal, type Ymd } from "@/lib/menu";
import { useMobile } from "../app";
import { haptic } from "../motion";
import { bridge, useNativeState } from "../native";
import { BEFORE_CHOICES, BEFORE_MAX, alarmTimeOn, closeAlarmTime, deliveredAlarms, type Alarm, type Repeat } from "../store";
import { Ico, Icon, Mascot, st } from "../kit";
import { AppSheet, DORM_ICON } from "../sheets";
import { WebPushCard } from "../WebPushCard";
import { FavAlarmCard } from "../FavAlarmCard";

const REPEAT_NAME: Record<Repeat, string> = { all: "매일", weekday: "평일", weekend: "주말" };
const DAY_NAME = ["오늘", "내일"] as const;

export const PRESETS: readonly Omit<Alarm, "id" | "dorm" | "on">[] = [
  { offset: 1, meal: "breakfast", time: "21:00", repeat: "all" },
  { offset: 0, meal: "lunch", time: "11:00", repeat: "all" },
  { offset: 0, meal: "dinner", time: "17:00", repeat: "all" },
  { offset: 0, meal: "dinner", time: "18:10", repeat: "all", before: 30 },
];

type RuleKey = Pick<Alarm, "offset" | "meal" | "time" | "repeat" | "before">;
export const sameKind = (a: RuleKey, b: RuleKey) =>
  a.meal === b.meal && a.repeat === b.repeat && (a.before ?? 0) === (b.before ?? 0) && (a.before ? true : a.offset === b.offset && a.time === b.time);

export const newId = () => Math.random().toString(36).slice(2, 10);

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const repeatsOn = (r: Repeat, d: Ymd) => r === "all" || (r === "weekend") === isWeekend(d);

/** 규칙이 다음에 울릴 날 (오늘 포함 8일 안) */
export function nextFire(a: Alarm, today = kstToday(), now = kstMinute()): Ymd | null {
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    if (i === 0 && toMin(alarmTimeOn(a, d)) <= now) continue;
    if (repeatsOn(a.repeat, d)) return d;
  }
  return null;
}

/** 목록 제목: 시각 또는 "마감 30분 전" */
export const ruleWhen = (a: RuleKey) => (a.before ? `마감 ${a.before}분 전` : a.time);
export const ruleText = (a: RuleKey) =>
  a.before ? `${REPEAT_NAME[a.repeat]} ${MEAL_NAME[a.meal]} 입장 마감 ${a.before}분 전` : `${REPEAT_NAME[a.repeat]} ${a.time} · ${DAY_NAME[a.offset]} ${MEAL_NAME[a.meal]}`;

/** 마감 알림이 울리는 시각 안내: "평일 18:10(마감 18:40) · 주말 17:50(마감 18:20)" */
export function closeTimesText(a: Pick<Alarm, "meal" | "repeat" | "before">): string {
  const days = a.repeat === "all" ? (["weekday", "weekend"] as const) : [a.repeat];
  return days.map((d) => `${REPEAT_NAME[d]} ${closeAlarmTime(d, a.meal, a.before ?? 0)}(마감 ${entryEnd(d, a.meal)})`).join(" · ");
}

/** 마감 몇 분 전: 고르기 + 직접 입력. 입력 중 빈 값도 허용하고, 저장할 때 5~180분으로 맞춘다. */
export const clampBefore = (n: number) => Math.min(BEFORE_MAX, Math.max(5, Math.round(n) || 30));

export function AlarmEditSheet({ alarm }: { alarm?: Alarm }) {
  const { s, update, closeSheet, toast } = useMobile();
  const [v, setV] = useState<Alarm>(alarm ?? { id: newId(), offset: 1, meal: "breakfast", time: "21:00", dorm: s.dorm, repeat: "all", on: true });
  const set = <K extends keyof Alarm>(k: K, x: Alarm[K]) => {
    haptic("select");
    setV((o) => ({ ...o, [k]: x }));
  };
  const close = v.before !== undefined;
  const setMode = (c: boolean) => {
    haptic("select");
    setV((o) => (c ? { ...o, before: o.before || 30, offset: 0 } : { ...o, before: undefined }));
  };
  const save = () => {
    const r: Alarm = { ...v, on: true };
    if (r.before !== undefined) {
      r.before = clampBefore(r.before);
      r.offset = 0;
      r.time = closeAlarmTime(r.repeat === "weekend" ? "weekend" : "weekday", r.meal, r.before);
    } else delete r.before;
    update((x) => {
      const i = x.alarms.findIndex((a) => a.id === r.id);
      if (i >= 0) x.alarms[i] = r;
      else x.alarms.push(r);
    });
    closeSheet();
    toast(`${ruleText(r)} 알림을 저장했어요`);
  };
  return (
    <>
      <h3>{alarm ? "알림 고치기" : "알림 추가"}</h3>
      <p className="sd">{close ? "식당 입장 마감 전에 메뉴와 함께 알려 드려요" : "정한 시각에 메뉴를 보내 드려요"}</p>
      <p className="kid-h">언제</p>
      <div className="seg3">
        {(["all", "weekday", "weekend"] as const).map((r) => (
          <button key={r} className={v.repeat === r ? "on" : ""} onClick={() => set("repeat", r)}>
            {REPEAT_NAME[r]}
          </button>
        ))}
      </div>
      <div className="seg3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button className={close ? "" : "on"} onClick={() => setMode(false)}>
          시각 정하기
        </button>
        <button className={close ? "on" : ""} onClick={() => setMode(true)}>
          마감 전에
        </button>
      </div>
      {close ? (
        <>
          <div className="seg3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {BEFORE_CHOICES.map((n) => (
              <button key={n} className={v.before === n ? "on" : ""} onClick={() => set("before", n)}>
                {n}분 전
              </button>
            ))}
          </div>
          <label className="sbox" style={{ marginTop: 10 }}>
            <Icon k="clock" />
            <input
              type="number"
              inputMode="numeric"
              min={5}
              max={BEFORE_MAX}
              step={5}
              value={v.before || ""}
              onChange={(e) => setV((o) => ({ ...o, before: Number(e.target.value) || 0 }))}
              onBlur={() => setV((o) => ({ ...o, before: clampBefore(o.before ?? 30) }))}
              aria-label="입장 마감 몇 분 전"
            />
            <span className="sub">분 전</span>
          </label>
          <p className="sub" style={{ margin: "8px 2px 0" }}>
            {closeTimesText({ ...v, before: clampBefore(v.before ?? 30) })}에 울려요
          </p>
        </>
      ) : (
        <label className="sbox" style={{ marginTop: 10 }}>
          <Icon k="clock" />
          <input type="time" value={v.time} required onChange={(e) => e.target.value && setV((o) => ({ ...o, time: e.target.value }))} aria-label="알림 시각" />
        </label>
      )}
      <p className="kid-h">어떤 메뉴</p>
      {!close && (
        <div className="seg3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {([0, 1] as const).map((o) => (
            <button key={o} className={v.offset === o ? "on" : ""} onClick={() => set("offset", o)}>
              {DAY_NAME[o]}
            </button>
          ))}
        </div>
      )}
      <div className="seg3">
        {MEALS.map((m) => (
          <button key={m} className={v.meal === m ? "on" : ""} onClick={() => set("meal", m as Meal)}>
            {MEAL_NAME[m]}
          </button>
        ))}
      </div>
      <p className="kid-h">식당</p>
      <div className="seg3">
        {DORMS.map((d) => (
          <button key={d.id} className={v.dorm === d.id ? "on" : ""} onClick={() => set("dorm", d.id as Dorm)}>
            {d.name}
          </button>
        ))}
      </div>
      <div className={alarm ? "my-lo" : ""}>
        {alarm && (
          <button
            className="my-cn press"
            onClick={() => {
              haptic("warn");
              update((x) => {
                x.alarms = x.alarms.filter((a) => a.id !== alarm.id);
              });
              closeSheet();
              toast("알림을 지웠어요");
            }}
          >
            지우기
          </button>
        )}
        <button className="cta press" onClick={save} style={alarm ? undefined : { marginTop: 22 }}>
          저장
        </button>
      </div>
    </>
  );
}

function StatusCard() {
  const { sheet, toast, s } = useMobile();
  const ns = useNativeState();
  if (ns === "web") {
    return <WebPushCard alarms={deliveredAlarms(s)} toast={toast} variant="mobile" onApk={() => sheet(<AppSheet />)} />;
  }
  if (ns.permission !== "granted") {
    return (
      <div className="notice" style={{ margin: "0 16px 12px" }}>
        <span className="pill">권한</span>
        <span>
          알림이 꺼져 있어요{" "}
          <button className="pbtn press" onClick={() => bridge()?.requestPermission()}>
            허용하기
          </button>
        </span>
      </div>
    );
  }
  if (!ns.exact) {
    return (
      <div className="notice" style={{ margin: "0 16px 12px" }}>
        <span className="pill">정확도</span>
        <span>
          정확한 시각 알림이 막혀 있어 몇 분 늦을 수 있어요{" "}
          <button
            className="pbtn press"
            onClick={() => {
              bridge()?.openExactAlarmSettings();
              toast("[알람 및 리마인더]를 허용해 주세요");
            }}
          >
            설정
          </button>
        </span>
      </div>
    );
  }
  return null;
}

export function AlarmView() {
  const { s, update, sheet, toast } = useMobile();
  const today = kstToday();
  const inApp = !!bridge();
  const toggle = (a: Alarm) => {
    haptic("select");
    update((x) => {
      const r = x.alarms.find((y) => y.id === a.id);
      if (r) r.on = !r.on;
    });
    toast(a.on ? "알림을 껐어요" : `${ruleText(a)} 알림을 켰어요`);
  };
  const addPreset = (p: (typeof PRESETS)[number]) => {
    haptic("select");
    update((x) => {
      x.alarms.push({ ...p, id: newId(), dorm: x.dorm, on: true });
    });
    toast(`${ruleText(p)} 알림을 추가했어요`);
  };
  const sorted = [...s.alarms].sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = sorted
    .filter((a) => a.on)
    .map((a) => ({ a, d: nextFire(a) }))
    .filter((x): x is { a: Alarm; d: Ymd } => !!x.d)
    .map((x) => ({ ...x, t: alarmTimeOn(x.a, x.d) }))
    .sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t))[0];
  const missing = PRESETS.filter((p) => !s.alarms.some((a) => sameKind(a, p)));

  return (
    <>
      <div className="tbar">
        <h1>알림</h1>
        <button className="pbtn press" onClick={() => sheet(<AlarmEditSheet key={Date.now()} />)}>
          + 추가
        </button>
      </div>
      <StatusCard />
      <FavAlarmCard s={s} update={update} toast={toast} variant="mobile" />
      {upcoming && (
        <div className="prof st" style={st(1)}>
          <div className="row">
            <span className="av avin">
              <Mascot wave />
            </span>
            <div>
              <h2>
                {upcoming.d === today ? "오늘" : shortDate(upcoming.d)} {upcoming.t}
              </h2>
              <p>
                {upcoming.a.before
                  ? `다음 알림 · ${dormOf(upcoming.a.dorm).label} ${MEAL_NAME[upcoming.a.meal]} 입장 마감 ${upcoming.a.before}분 전`
                  : `다음 알림 · ${dormOf(upcoming.a.dorm).label} ${upcoming.a.offset ? shortDate(addDays(upcoming.d, 1)) : ""} ${MEAL_NAME[upcoming.a.meal]} 메뉴`}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="lc st" style={st(2)}>
        <h3>내 알림 {s.alarms.length ? `${s.alarms.filter((a) => a.on).length}/${s.alarms.length}` : ""}</h3>
        {sorted.length ? (
          sorted.map((a) => (
            <div className="lr" key={a.id}>
              <span className="sq">
                <Ico k={DORM_ICON[a.dorm]} size={28} />
              </span>
              <button className="press" style={{ flex: 1, textAlign: "left" }} onClick={() => sheet(<AlarmEditSheet key={a.id + Date.now()} alarm={a} />)}>
                <p style={{ opacity: a.on ? 1 : 0.45 }}>
                  {a.before ? `${MEAL_NAME[a.meal]} 마감 ${a.before}분 전` : `${a.time} · ${DAY_NAME[a.offset]} ${MEAL_NAME[a.meal]}`}
                  <small>
                    {REPEAT_NAME[a.repeat]} · {dormOf(a.dorm).label}
                  </small>
                </p>
              </button>
              <button className={`tg ${a.on ? "on" : ""}`} role="switch" aria-checked={a.on} aria-label={`${ruleText(a)} 알림`} onClick={() => toggle(a)} />
            </div>
          ))
        ) : (
          <p className="sub" style={{ padding: "4px 2px 12px" }}>
            아직 알림이 없어요. 아래 추천에서 골라 보세요.
          </p>
        )}
      </div>
      {missing.length > 0 && (
        <div className="lc st" style={st(3)}>
          <h3>추천 알림</h3>
          {missing.map((p) => (
            <button key={ruleText(p)} className="lr press" onClick={() => addPreset(p)}>
              <span className="sq">
                <Icon k={p.meal === "dinner" ? "bowl" : "tray"} />
              </span>
              <p>
                {p.before ? `${MEAL_NAME[p.meal]} 마감 ${p.before}분 전` : `${p.time} · ${DAY_NAME[p.offset]} ${MEAL_NAME[p.meal]}`}
                <small>{p.before ? closeTimesText(p) : p.offset ? "자기 전에 내일 아침 메뉴 미리 보기" : p.meal === "lunch" ? "점심 먹으러 가기 전에" : "저녁 먹으러 가기 전에"}</small>
              </p>
              <span className="pbtn">추가</span>
            </button>
          ))}
        </div>
      )}
      {inApp && s.alarms.some((a) => a.on) && (
        <button
          className="more"
          onClick={() => {
            const a = sorted.find((x) => x.on)!;
            bridge()?.test(JSON.stringify(a));
            toast("시험 알림을 보냈어요");
          }}
        >
          지금 시험 알림 받아 보기
        </button>
      )}
      <p className="foot">알림이 울릴 때 생활관 홈페이지에서 그 메뉴를 새로 받아 보여 줘요.</p>
    </>
  );
}
