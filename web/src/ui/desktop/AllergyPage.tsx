"use client";

// 알레르기 탭: 19종 고르기, 내 식당에서 앞으로 주의할 메뉴.
import { MEALS, MEAL_NAME, addDays, dayNum, dormOf, mainDish, mondayOf, WD, weekday, type Meal, type Ymd } from "@/lib/menu";
import { Ico, Mascot } from "../kit";
import { AL, hits, useWeeks, type Dish } from "../store";
import { dayLabel, fixedDishes, st, useDesk } from "./shared";

export function AllergyPage() {
  const { s, update } = useDesk();
  const toggle = (n: number) =>
    update((x) => {
      x.allergy = x.allergy.includes(n) ? x.allergy.filter((y) => y !== n) : [...x.allergy, n].sort((a, b) => a - b);
    });
  return (
    <>
      <header className="ph st" style={st(0)}>
        <div>
          <h1>알레르기</h1>
          <p>고른 알레르기는 식단표와 오늘 화면에 빨갛게 표시돼요. 생활관 식단표에는 번호가 없어 메뉴 이름으로 짐작해요.</p>
        </div>
      </header>
      <section className="sec st" style={st(1)}>
        <div className="sh">
          <h2>내 알레르기</h2>
          <span>{s.allergy.length ? `${s.allergy.length}개 골랐어요` : "해당하는 것을 눌러 주세요"}</span>
          <span className="sp" />
          {s.allergy.length > 0 && (
            <button className="link" onClick={() => update((x) => void (x.allergy = []))}>
              모두 끄기
            </button>
          )}
        </div>
        <div className="alg">
          {AL.slice(1).map((name, i) => {
            const n = i + 1;
            const on = s.allergy.includes(n);
            return (
              <button key={n} className={on ? "on" : ""} style={st(i)} aria-pressed={on} onClick={() => toggle(n)}>
                <i>{n}</i>
                <b>{name}</b>
                <span className="ck" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <Upcoming />
    </>
  );
}

function Upcoming() {
  const { s, today, open } = useDesk();
  const m = mondayOf(today);
  const entries = useWeeks(s.dorm, [m, addDays(m, 7)]);
  const loading = entries.some((e) => e.loading && !e.week);
  const rows: { date: Ymd; meal: Meal; main: string; hl: Dish[] }[] = [];
  for (const e of entries)
    for (const d of e.week?.days ?? [])
      if (d.date >= today && d.registered)
        for (const meal of MEALS) {
          const hl = hits(fixedDishes(d.meals[meal]), s.allergy);
          if (hl.length) rows.push({ date: d.date, meal, main: mainDish(d.meals[meal]), hl });
        }
  return (
    <section className="sec st" style={st(2)}>
      <div className="sh">
        <h2>앞으로 주의할 메뉴</h2>
        <span>
          {dormOf(s.dorm).label} · 오늘부터 다음 주까지{rows.length ? ` · ${rows.length}끼` : ""}
        </span>
      </div>
      {!s.allergy.length ? (
        <Calm text="위에서 알레르기를 고르면 주의할 메뉴를 모아 보여 드려요" />
      ) : loading ? (
        <p className="none">생활관 홈페이지에서 받는 중…</p>
      ) : !rows.length ? (
        <Calm text="오늘부터 다음 주까지 주의할 메뉴가 없어요" />
      ) : (
        <ul className="watch">
          {rows.map((r, i) => (
            <li key={`${r.date}-${r.meal}`} style={st(Math.min(i, 16))}>
              <button onClick={() => open(r.date, r.meal, s.dorm)}>
                <span className={`dc${r.date === today ? " today" : ""}`}>
                  <small>{WD[weekday(r.date)]}</small>
                  <b>{dayNum(r.date)}</b>
                </span>
                <span className="wt">
                  <small>
                    {dayLabel(r.date, today)} {MEAL_NAME[r.meal]}
                  </small>
                  <b>{r.main}</b>
                </span>
                <span className="wh">
                  {r.hl.map(([name, ns]) => (
                    <span key={name}>
                      {name}
                      {ns
                        .filter((n) => s.allergy.includes(n))
                        .map((n) => (
                          <i key={n} title={AL[n]}>
                            {n}
                          </i>
                        ))}
                    </span>
                  ))}
                </span>
                <Ico k="shield" size={30} className="ws" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Calm({ text }: { text: string }) {
  return (
    <div className="calm">
      <Mascot className="cm" />
      <p>{text}</p>
    </div>
  );
}
