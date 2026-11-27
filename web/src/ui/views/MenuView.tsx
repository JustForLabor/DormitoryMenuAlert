"use client";

// 식단 탭 (WasteLess 식단표 rMenu + 대학 식당 rMenuU): 주간은 식당 알약·날짜 칩·메뉴 카드, 월간은 달력.
import { useState, ViewTransition } from "react";
import {
  DORMS,
  MEALS,
  MEAL_NAME,
  SITE_URL,
  WD,
  addDays,
  dayNum,
  dormOf,
  hoursOf,
  kstToday,
  mainDish,
  mondayOf,
  monthNum,
  shortDate,
  weekday,
  type DayMenu,
  type Dorm,
  type Ymd,
} from "@/lib/menu";
import { useMobile } from "../app";
import { haptic, motion, PullToRefresh, Swap } from "../motion";
import { AppSheet, DormSheet, HoursSheet, nearMondays } from "../sheets";
import { ShareSheet, toShareMeal } from "../share";
import { dishes, favorites, hits, loadable, refreshWeeks, useWeeks } from "../store";
import { HitBox, Ico, MenuItems, WkChips, st } from "../kit";

/** 날짜가 든 달의 월요일들 (그 달과 겹치는 주) */
function monthMondays(d: Ymd): Ymd[] {
  const first = d.slice(0, 8) + "01";
  const out: Ymd[] = [];
  for (let m = mondayOf(first); m.slice(0, 7) <= d.slice(0, 7); m = addDays(m, 7)) out.push(m);
  return out;
}

function daysInMonth(d: Ymd): Ymd[] {
  const out: Ymd[] = [];
  for (let x = d.slice(0, 8) + "01"; x.slice(0, 7) === d.slice(0, 7); x = addDays(x, 1)) out.push(x);
  return out;
}

export function MenuView() {
  const { s, sheet, closeSheet, sel, setSel, mView, setMView, dormSel, setDormSel, toast } = useMobile();
  const dorm = dormOf(dormSel ?? s.dorm);
  const today = kstToday();
  const thisMon = mondayOf(today);
  // 주간: 지난 주~다음 주 + 고른 날의 주, 월간: 고른 달의 주들(다음 주까지만 요청된다)
  const weekMondays = [...new Set([addDays(thisMon, -7), thisMon, addDays(thisMon, 7), mondayOf(sel)])].sort();
  const mondays = mView === "w" ? weekMondays : monthMondays(sel);
  const entries = useWeeks(dorm.id, mondays);
  const all = new Map<Ymd, DayMenu>();
  for (const e of entries) for (const d of e.week?.days ?? []) all.set(d.date, d);
  const fav = favorites(s);
  const alOf = (d: DayMenu | undefined) => !!d?.registered && MEALS.some((m) => hits(dishes(d.meals[m]), s.allergy).length > 0);

  const shown = `${dorm.id}-${sel}-${mView}`;
  const [seen, setSeen] = useState(shown);
  const [swapped, setSwapped] = useState(false);
  if (seen !== shown) {
    setSeen(shown);
    setSwapped(true);
  }
  const ent = swapped ? "" : " st";

  const pickDorm = (id: Dorm) => {
    if (id === dorm.id) return;
    haptic("select");
    const idx = (x: Dorm) => DORMS.findIndex((d) => d.id === x);
    motion(idx(id) > idx(dorm.id) ? "wl-swap-next" : "wl-swap-prev", () => setDormSel(id === s.dorm ? null : id));
  };
  const pickView = (v: "w" | "m") => {
    if (v === mView) return;
    haptic("select");
    motion(v === "m" ? "wl-swap-next" : "wl-swap-prev", () => setMView(v));
  };

  let body;
  if (mView === "w") {
    const chips = weekMondays.flatMap((m) => Array.from({ length: 7 }, (_, i) => addDays(m, i)));
    const entry = entries[mondays.indexOf(mondayOf(sel))];
    const day = all.get(sel);
    let cards;
    if (day?.registered) {
      cards = MEALS.map((m, i) => {
        const list = dishes(day.meals[m]);
        return (
          <div key={m} id={`meal-${m}`} className={`mcard${ent} ${m === "dinner" ? "dn" : ""}`} style={st(i)}>
            <div className="mh">
              <b>
                <Ico k={m === "dinner" ? "bowl" : "tray"} size={18} />
                {MEAL_NAME[m]}
              </b>
              <em className="price">{mainDish(day.meals[m]) || "-"}</em>
              <button type="button" className="pbtn press" style={{ marginLeft: "auto", flex: "none" }} onClick={() => sheet(<ShareSheet meal={toShareMeal(dorm.id, sel, m, day.meals[m])} toast={toast} onClose={closeSheet} />)}>
                공유
              </button>
            </div>
            <p className="sub mt">
              {shortDate(sel)} · 입장 {hoursOf(sel, m)}
            </p>
            {list.length ? (
              <>
                <HitBox list={list} />
                <MenuItems list={list} fav={fav} />
              </>
            ) : (
              <p className="sub" style={{ marginTop: 10 }}>
                운영하지 않아요
              </p>
            )}
          </div>
        );
      });
    } else {
      const msg = !loadable(mondayOf(sel))
        ? ["아직 먼 날이에요", "식단은 보통 그 전 주 후반에 올라와요"]
        : day
          ? ["아직 미등록이에요", "생활관 홈페이지에 올라오면 바로 보여요"]
          : entry?.error
            ? ["식단을 못 불러왔어요", `${entry.error} · 아래로 당겨 다시 시도해 보세요`]
            : ["불러오는 중이에요", "생활관 홈페이지에서 가져오고 있어요"];
      cards = (
        <div className={`card${ent}`} style={{ textAlign: "center" }}>
          <Ico k="cal" size={64} />
          <h3 style={{ justifyContent: "center", marginTop: 8 }}>{msg[0]}</h3>
          <p className="sub">{msg[1]}</p>
        </div>
      );
    }
    body = (
      <div>
        <div className="cafs">
          {DORMS.map((d) => {
            const on = d.id === dorm.id;
            return (
              <button key={d.id} className={`press ${on ? "on" : ""}`} aria-pressed={on} onClick={() => pickDorm(d.id)}>
                <b>{d.label}</b>
                <small className="ct">
                  {d.sub}
                  {d.id === s.dorm ? " · 내 식당" : ""}
                </small>
                {on && (
                  <ViewTransition name="wl-u-caf-ind" share="wl-u-ind" default="none">
                    <span className="wl-u-ind" aria-hidden />
                  </ViewTransition>
                )}
              </button>
            );
          })}
        </div>
        <WkChips days={chips} dot={(d) => alOf(all.get(d))} na={(d) => !all.get(d)?.registered} />
        <Swap k={shown}>
          <div>{cards}</div>
        </Swap>
        <p className="foot">
          숫자는 메뉴 이름으로 짐작한 알레르기 번호예요(식단표에 번호가 없어요). ♥는 별점 4점 이상 준 메뉴.
          <br />
          정확한 식단은{" "}
          <a href={SITE_URL} target="_blank" rel="noreferrer">
            생활관 홈페이지
          </a>
          에서 확인해 주세요.
        </p>
      </div>
    );
  } else {
    const dates = daysInMonth(sel);
    const first = weekday(dates[0]);
    const reg = dates.filter((d) => all.get(d)?.registered);
    const alDays = reg.filter((d) => alOf(all.get(d))).length;
    const favDays = reg.filter((d) => MEALS.some((m) => dishes(all.get(d)!.meals[m]).some(([n]) => fav.has(n)))).length;
    const marks: string[] = [];
    const prevMonth = addDays(sel.slice(0, 8) + "01", -1);
    const nextMonth = addDays(dates[dates.length - 1], 1);
    const canNext = nextMonth <= addDays(thisMon, 13);
    const moveMonth = (d: Ymd, dir: "wl-swap-next" | "wl-swap-prev") => {
      haptic("select");
      motion(dir, () => setSel(d));
    };
    body = (
      <div>
        <div className="cafs">
          {DORMS.map((d) => {
            const on = d.id === dorm.id;
            return (
              <button key={d.id} className={`press ${on ? "on" : ""}`} aria-pressed={on} onClick={() => pickDorm(d.id)}>
                <b>{d.label}</b>
                <small className="ct">{d.sub}</small>
                {on && (
                  <ViewTransition name="wl-u-caf-ind" share="wl-u-ind" default="none">
                    <span className="wl-u-ind" aria-hidden />
                  </ViewTransition>
                )}
              </button>
            );
          })}
        </div>
        <div className={`cal mp-cal${ent}`}>
          <div className="ct">
            <b>
              <button className="mnav" onClick={() => moveMonth(prevMonth, "wl-swap-prev")} aria-label="지난 달">
                ‹
              </button>
              {sel.slice(0, 4)}년 {monthNum(sel)}월
              <button className="mnav" disabled={!canNext} onClick={() => moveMonth(nextMonth, "wl-swap-next")} aria-label="다음 달">
                ›
              </button>
            </b>
            <span>빨간 점 = 내 알레르기</span>
          </div>
          <div className="cg">
            {WD.map((x) => (
              <span key={x} className="h">
                {x}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <button key={`e${i}`} className="e" />
            ))}
            {dates.map((d) => {
              const row = all.get(d);
              const a = alOf(row);
              return (
                <button
                  key={d}
                  className={`${d === today ? "td" : ""} ${a ? "al" : ""} ${row?.registered ? "" : "na"}`}
                  style={d === today || a ? st(marks.push(d) - 1) : undefined}
                  onClick={() => {
                    if (row?.registered) {
                      haptic("select");
                      motion("wl-swap-fade", () => {
                        setSel(d);
                        setMView("w");
                      });
                    } else {
                      haptic("warn");
                      toast(loadable(mondayOf(d)) ? `${shortDate(d)} 식단은 미등록이에요` : `${shortDate(d)} 식단은 아직 올라오지 않았어요`);
                    }
                  }}
                >
                  <b>{dayNum(d)}</b>
                  {row?.registered && <small>{mainDish(row.meals.lunch)}</small>}
                </button>
              );
            })}
          </div>
        </div>
        <div className={`card${ent}`} style={st(2)}>
          <h3>
            <Ico k="chart" size={22} />
            이번 달 한눈에
          </h3>
          <div className="kc" style={{ marginTop: 12 }}>
            <span>올라온 날 {reg.length}일</span>
            <span>알레르기 주의 {alDays}일</span>
            <span>좋아하는 메뉴 {favDays}일</span>
          </div>
          <p className="sub" style={{ marginTop: 10 }}>
            칸에는 점심 메인을 적었어요. 날짜를 누르면 그날 식단으로 이동해요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh
      onRefresh={async () => {
        await refreshWeeks(dorm.id, mondays.filter(loadable));
        toast("방금 새로 불러왔어요");
      }}
    >
      <div className="tbar">
        <h1>식단표</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className={`segp ${mView === "m" ? "m" : ""}`}>
            <i />
            <button className={mView === "w" ? "on" : ""} aria-pressed={mView === "w"} onClick={() => pickView("w")}>
              주간
            </button>
            <button className={mView === "m" ? "on" : ""} aria-pressed={mView === "m"} onClick={() => pickView("m")}>
              월간
            </button>
          </div>
          <button className="pbtn press" onClick={() => sheet(<HoursSheet />)}>
            시간
          </button>
        </div>
      </div>
      <Swap k={mView}>{body}</Swap>
      {sel !== today && mView === "w" && (
        <button
          className="more"
          onClick={() => {
            haptic("select");
            motion(today > sel ? "wl-swap-next" : "wl-swap-prev", () => setSel(today));
          }}
        >
          오늘({shortDate(today)})로
        </button>
      )}
    </PullToRefresh>
  );
}
