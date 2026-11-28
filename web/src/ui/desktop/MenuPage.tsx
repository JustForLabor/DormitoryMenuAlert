"use client";

// 식단표 탭: 식당 고르기, 주간(7일 × 세 끼)·월간 식단표, 고른 메뉴 상세(메뉴·알레르기·별점).
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  DORMS,
  MEALS,
  MEAL_NAME,
  WD,
  addDays,
  dayNum,
  dormOf,
  hoursOf,
  mainDish,
  mondayOf,
  monthNum,
  nextMeal,
  shortDate,
  weekday,
  type DayMenu,
  type Dorm,
  type Meal,
  type Ymd,
} from "@/lib/menu";
import { trackRate } from "@/lib/track";
import { Ico } from "../kit";
import { DORM_ICON } from "../sheets";
import { ShareButton, toShareMeal } from "../share";
import { AL, dishes, favAddedText, favorites, hits, loadable, refreshWeeks, setFav, useDay, useWeeks, type Dish } from "../store";
import { MEAL_ICO, Search, Seg, Stars, dayLabel, fixedDishes, monthMondays, st, useDesk, weekDates } from "./shared";

export function MenuPage() {
  const { s, view, setView, mode, setMode } = useDesk();
  return (
    <>
      <header className="ph st" style={st(0)}>
        <div>
          <h1>식단표</h1>
          <p>생활관 홈페이지 식단을 그대로 옮겨 와요. 생활관은 다음 주까지만 올려요.</p>
        </div>
        <span className="sp" />
        <Search />
      </header>
      <div className="bar st" style={st(1)}>
        <Seg
          className="dorms"
          label="식당"
          value={view}
          onChange={(d: Dorm) => setView(d)}
          items={DORMS.map((d) => [
            d.id,
            <>
              <Ico k={DORM_ICON[d.id]} size={34} />
              <span>
                <b>
                  {d.name}
                  {s.dorm === d.id && <em>내 식당</em>}
                </b>
                <small>{d.label}</small>
              </span>
            </>,
          ])}
        />
        <span className="sp" />
        <Seg
          label="보기"
          value={mode}
          onChange={setMode}
          items={[
            ["week", "주간"],
            ["month", "월간"],
          ]}
        />
      </div>
      <div className="split">
        <div className="st" style={st(2)}>
          {mode === "week" ? <WeekBoard /> : <MonthBoard />}
        </div>
        <DetailPanel />
      </div>
    </>
  );
}

function BoardHead({ title, sub, onPrev, onNext, nextOk, onRefresh }: { title: string; sub: string; onPrev: () => void; onNext: () => void; nextOk: boolean; onRefresh: () => Promise<void> }) {
  const { setSel } = useDesk();
  const [spin, setSpin] = useState(false);
  const refresh = async () => {
    setSpin(true);
    try {
      await onRefresh();
    } finally {
      setSpin(false);
    }
  };
  return (
    <div className="bh">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      <span className="sp" />
      <div className="pager">
        <button onClick={onPrev} aria-label="이전">
          ‹
        </button>
        <button onClick={() => setSel(nextMeal())}>오늘</button>
        <button onClick={onNext} disabled={!nextOk} aria-label="다음">
          ›
        </button>
      </div>
      <button className={`icon-btn${spin ? " spin" : ""}`} onClick={() => void refresh()} aria-label="새로고침" title="생활관 홈페이지에서 다시 받기">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11a8 8 0 10-2.3 5.7" />
          <path d="M20 4v7h-7" />
        </svg>
      </button>
    </div>
  );
}

function statusLine(e: { week?: unknown; loading: boolean; error?: string }, far: boolean): string {
  if (far) return "아직 올라오지 않은 주예요 (생활관은 다음 주까지만 올려요)";
  if (e.loading && !e.week) return "생활관 홈페이지에서 받는 중…";
  if (e.error && e.week) return "사이트에 연결하지 못해 이 기기에 남은 결과를 보여 줘요";
  if (e.error) return `식단을 못 불러왔어요 · ${e.error}`;
  return "";
}

/** 고른 칸(.cell.on)을 따라 미끄러지는 테두리 */
function useRing(grid: RefObject<HTMLElement | null>, key: string): CSSProperties | undefined {
  const [r, setR] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const g = grid.current;
    if (!g) return;
    const measure = () => {
      const c = g.querySelector<HTMLElement>(".cell.on");
      setR(c ? { transform: `translate(${c.offsetLeft}px, ${c.offsetTop}px)`, width: c.offsetWidth, height: c.offsetHeight } : undefined);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(g);
    return () => ro.disconnect();
  }, [grid, key]);
  return r;
}

/** 바뀐 값이 앞인지 뒤인지 (주·달을 넘길 때 미끄러지는 방향) */
function useDirection(v: string): "" | "fwd" | "back" {
  const [st8, setSt8] = useState<{ v: string; dir: "" | "fwd" | "back" }>({ v, dir: "" });
  if (st8.v !== v) setSt8({ v, dir: v > st8.v ? "fwd" : "back" });
  return st8.v !== v ? (v > st8.v ? "fwd" : "back") : st8.dir;
}

function WeekBoard() {
  const { s, view, sel, setSel, today } = useDesk();
  const monday = mondayOf(sel.date);
  const [e] = useWeeks(view, [monday]);
  const dir = useDirection(monday);
  const dates = weekDates(monday);
  const byDate = new Map((e.week?.days ?? []).map((d) => [d.date, d]));
  const fav = favorites(s);
  const status = statusLine(e, !loadable(monday));
  const wk = Math.ceil(dayNum(monday) / 7);
  const grid = useRef<HTMLDivElement>(null);
  const ring = useRing(grid, `${view}|${sel.date}|${sel.meal}|${e.week ? 1 : 0}`);
  return (
    <section className="board">
      <BoardHead
        title={`${monthNum(monday)}월 ${wk}주 · ${dormOf(view).label}`}
        sub={status || `${shortDate(monday)} ~ ${shortDate(addDays(monday, 6))} · 칸을 누르거나 ←→↑↓`}
        onPrev={() => setSel((x) => ({ ...x, date: addDays(x.date, -7) }))}
        onNext={() => setSel((x) => ({ ...x, date: addDays(x.date, 7) }))}
        nextOk={loadable(addDays(monday, 7))}
        onRefresh={() => refreshWeeks(view, [monday])}
      />
      <div key={`${view}-${monday}`} ref={grid} className={`wk ${dir}`} role="grid" aria-label="주간 식단표">
        {ring && <span className="ring" style={ring} aria-hidden="true" />}
        <div className="corner" />
        {dates.map((d) => (
          <div key={d} className={`dh${d === today ? " today" : ""}${weekday(d) === 6 ? " sat" : weekday(d) === 0 ? " sun" : ""}`} role="columnheader">
            <small>{WD[weekday(d)]}</small>
            <b>{dayNum(d)}</b>
            {d === today && <em>오늘</em>}
          </div>
        ))}
        {MEALS.map((meal) => (
          <Row key={meal} meal={meal} dates={dates} byDate={byDate} fav={fav} loading={e.loading} />
        ))}
      </div>
    </section>
  );
}

function Row({ meal, dates, byDate, fav, loading }: { meal: Meal; dates: Ymd[]; byDate: Map<Ymd, DayMenu>; fav: Set<string>; loading: boolean }) {
  const { s, sel, setSel, today } = useDesk();
  return (
    <>
      <div className="mh" role="rowheader">
        <Ico k={MEAL_ICO[meal]} size={30} />
        <b>{MEAL_NAME[meal]}</b>
        <span>{hoursOf(dates[0], meal)}</span>
      </div>
      {dates.map((d, i) => {
        const day = byDate.get(d);
        const text = day?.meals[meal] ?? "";
        const list = fixedDishes(text);
        const main = mainDish(text);
        const on = sel.date === d && sel.meal === meal;
        const hit = hits(list, s.allergy).length > 0;
        const cls = ["cell", on && "on", d === today && "today", d < today && "past", day && !day.registered && "na", hit && "hit"].filter(Boolean).join(" ");
        return (
          <button
            key={d}
            className={cls}
            style={st(i + MEALS.indexOf(meal) * 2)}
            role="gridcell"
            aria-selected={on}
            onClick={() => {
              setSel({ date: d, meal });
              // 1180px 이하(iPad)에서는 상세 패널이 표 아래로 내려가니 보이게 스크롤한다 (desktop.css 의 같은 폭 규칙).
              if (matchMedia("(max-width: 1180px)").matches) document.querySelector(".wld .split > .panel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            {day && !day.registered ? (
              <span className="empty">미등록</span>
            ) : list.length ? (
              <ul>
                {list.map(([name, nums], j) => (
                  <li key={`${j}-${name}`} className={`${name === main ? "main" : ""}${nums.some((n) => s.allergy.includes(n)) ? " h" : ""}`}>
                    {name}
                    {fav.has(name) && <em> ♥</em>}
                  </li>
                ))}
              </ul>
            ) : loading && !day ? (
              <span className="skel" aria-label="불러오는 중">
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span className="empty">—</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function MonthBoard() {
  const { s, view, sel, setSel, setMode, today } = useDesk();
  const mondays = monthMondays(sel.date);
  const entries = useWeeks(view, mondays);
  const byDate = new Map(entries.flatMap((e) => e.week?.days ?? []).map((d) => [d.date, d]));
  const month = sel.date.slice(0, 7);
  const dir = useDirection(month);
  const firstOf = (d: Ymd) => d.slice(0, 8) + "01";
  const nextMonthFirst = firstOf(addDays(firstOf(sel.date), 32));
  const loadingAny = entries.some((e) => e.loading && !e.week);
  return (
    <section className="board">
      <BoardHead
        title={`${Number(month.slice(0, 4))}년 ${monthNum(sel.date)}월 · ${dormOf(view).label}`}
        sub={loadingAny ? "생활관 홈페이지에서 받는 중…" : "날짜를 누르면 그 주 식단표로 가요"}
        onPrev={() => setSel((x) => ({ ...x, date: firstOf(addDays(firstOf(x.date), -1)) }))}
        onNext={() => setSel((x) => ({ ...x, date: firstOf(addDays(firstOf(x.date), 32)) }))}
        nextOk={loadable(mondayOf(nextMonthFirst))}
        onRefresh={() => refreshWeeks(view, mondays.filter(loadable))}
      />
      <div key={`${view}-${month}`} className={`mo ${dir}`} role="grid" aria-label="월간 식단표">
        {["월", "화", "수", "목", "금", "토", "일"].map((w) => (
          <div key={w} className="dw" role="columnheader">
            {w}
          </div>
        ))}
        {mondays.flatMap(weekDates).map((d, i) => {
          const day = byDate.get(d);
          const out = d.slice(0, 7) !== month;
          const hit = day ? MEALS.some((m) => hits(fixedDishes(day.meals[m]), s.allergy).length > 0) : false;
          const cls = ["mday", out && "out", d === today && "today", d === sel.date && "on", day && !day.registered && "na"].filter(Boolean).join(" ");
          return (
            <button key={d} className={cls} style={st(Math.min(i, 30))} role="gridcell" onClick={() => (setSel((x) => ({ ...x, date: d })), setMode("week"))}>
              <span className="n">
                <b>{dayNum(d)}</b>
                {hit && <i title="알레르기 주의" />}
              </span>
              {day?.registered &&
                MEALS.map((m) => {
                  const main = mainDish(day.meals[m]);
                  return main ? (
                    <span key={m} className="ml">
                      <small>{MEAL_NAME[m][0]}</small>
                      {main}
                    </span>
                  ) : null;
                })}
              {day && !day.registered && <span className="ml na">미등록</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DetailPanel() {
  const { s, update, view, sel, setSel, today, toast, burst } = useDesk();
  const { day, loading } = useDay(view, sel.date);
  const list: Dish[] = dishes(day?.meals[sel.meal] ?? "");
  const hl = hits(list, s.allergy);
  const nums = [...new Set(hl.flatMap((d) => d[1].filter((n) => s.allergy.includes(n))))].sort((a, b) => a - b);
  const rates = s.rates[sel.date] ?? {};
  const rateable = list.filter((x) => !x[0].startsWith("선택식"));
  const fav = favorites(s);
  const toggleFav = (name: string) => {
    const on = !fav.has(name);
    update((x) => setFav(x, name, on));
    toast(on ? favAddedText(s, name) : `${name} 즐겨찾기를 뺐어요`);
  };
  const rate = (name: string, n: number, el: HTMLElement) => {
    update((x) => {
      x.rates[sel.date] = { ...(x.rates[sel.date] ?? {}), [name]: n };
      if (n >= 4) setFav(x, name, true);
    });
    if (rates[name] !== n) trackRate({ dorm: view, date: sel.date, meal: sel.meal, dish: name, n });
    if (n === 5) {
      const r = el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2);
    }
    if (n >= 4 && !fav.has(name)) toast(favAddedText(s, name));
  };
  return (
    <aside className="panel" aria-label="고른 메뉴">
      <div className="ptop">
        <button className="arrow" onClick={() => setSel((x) => ({ ...x, date: addDays(x.date, -1) }))} aria-label="전날">
          ‹
        </button>
        <Seg
          className="meals3"
          label="메뉴"
          value={sel.meal}
          onChange={(meal: Meal) => setSel((x) => ({ ...x, meal }))}
          items={MEALS.map((m) => [m, MEAL_NAME[m]])}
        />
        <button className="arrow" onClick={() => setSel((x) => ({ ...x, date: addDays(x.date, 1) }))} aria-label="다음날">
          ›
        </button>
      </div>
      <div key={`${view}|${sel.date}|${sel.meal}`} className="pin">
        <div className="phead">
          <Ico k={MEAL_ICO[sel.meal]} size={56} className="pi" />
          <div>
            <p className="kicker">
              {dayLabel(sel.date, today)} · 입장 {hoursOf(sel.date, sel.meal)}
            </p>
            <h2>
              {shortDate(sel.date)} {MEAL_NAME[sel.meal]}
            </h2>
            <p className="where">
              {dormOf(view).label}
              {s.dorm !== view && (
                <button
                  className="mini"
                  onClick={() => {
                    update((x) => void (x.dorm = view));
                    toast(`${dormOf(view).name}을 내 식당으로 정했어요`);
                  }}
                >
                  내 식당으로 정하기
                </button>
              )}
            </p>
          </div>
          <ShareButton icon label="이 메뉴 공유" meal={toShareMeal(view, sel.date, sel.meal, day?.meals[sel.meal] ?? "")} toast={toast} />
        </div>
        <div className="pbody">
          {day && !day.registered ? (
            <Empty text="이날은 생활관 홈페이지에 아직 식단이 없어요" />
          ) : !list.length ? (
            <Empty text={loading ? "불러오는 중…" : !loadable(mondayOf(sel.date)) ? "아직 올라오지 않은 날이에요" : "이때는 메뉴가 없어요"} />
          ) : (
            <>
              {hl.length > 0 && (
                <div className="alert">
                  <Ico k="shield" size={30} />
                  <span>
                    <b>{hl.map((x) => x[0]).join(", ")} 주의</b>
                    <small>메뉴 이름으로 짐작: {nums.map((n) => `${n} ${AL[n]}`).join(", ")}</small>
                  </span>
                </div>
              )}
              <ul className="dl">
                {list.map(([name, ns], i) => (
                  <li key={`${i}-${name}`} className={ns.some((n) => s.allergy.includes(n)) ? "h" : ""} style={st(i)}>
                    <span className="nm">{name}</span>
                    <span className="al">
                      {ns.map((n) => (
                        <i key={n} className={s.allergy.includes(n) ? "h" : ""} title={AL[n]}>
                          {n}
                        </i>
                      ))}
                    </span>
                    {name.startsWith("선택식") ? (
                      <span className="fv" aria-hidden="true" />
                    ) : (
                      <button className={`fv${fav.has(name) ? " on" : ""}`} aria-pressed={fav.has(name)} aria-label={`${name} 즐겨찾기`} title="즐겨찾기" onClick={() => toggleFav(name)}>
                        {fav.has(name) ? "♥" : "♡"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {sel.date <= today && rateable.length > 0 && (
                <div className="rate">
                  <h4>먹어 봤다면 별점</h4>
                  <p>4점 이상 주면 즐겨찾기(♥)에 넣어요 · 별점은 익명으로 모아 메뉴 통계에 써요</p>
                  {rateable.map(([name]) => (
                    <div className="rrow" key={name}>
                      <span>{name}</span>
                      <Stars name={name} value={rates[name] ?? 0} onRate={(n, el) => rate(name, n, el)} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Ico k="cal" size={64} />
      <p>{text}</p>
    </div>
  );
}
