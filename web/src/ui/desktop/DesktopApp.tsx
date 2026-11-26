"use client";

// 데스크톱 화면: 넓은 화면에서 한 주(또는 한 달) 식단표를 한눈에 본다.
// WasteLess v3.3 사장님 대시보드(머리글 알약 메뉴, 카드 3단)의 모양을 생활관 식단용으로 옮겼다.
// 상태(내 식당·알레르기·별점·알림 규칙)는 모바일 화면과 같은 localStorage(store.ts)를 쓴다.
//
// 키보드: ←/→ 하루, ↑/↓ 끼니 (입력칸에 있을 때는 무시)
import { useCallback, useEffect, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  isDorm,
  isMeal,
  isYmd,
  kstToday,
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
import { ICON_DEFS, STAR_OFF, STAR_ON } from "../icons";
import { Ico, Mascot, Svg } from "../kit";
import { APK_URL } from "../native";
import { DORM_ICON, REPO_URL } from "../sheets";
import { AL, dishes, favorites, hits, loadable, loadedWeeks, loadState, ratingCount, refreshWeeks, saveState, useDay, useWeeks, type AppState, type Dish } from "../store";

const DEFAULT_STATE: AppState = { dorm: "kb", allergy: [], rates: {}, alarms: [] };

interface Sel {
  date: Ymd;
  meal: Meal;
}

type Mode = "week" | "month";

function everyMinute(cb: () => void) {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
}

/** 1분마다 바뀌는 지금 시각 (다음 끼니 계산용). 서버에서는 0. */
function useNow(): number {
  return useSyncExternalStore(everyMinute, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);
}

/** 주소의 ?dorm=&date=&meal= (알림·공유 링크) */
function bootFromUrl(): { dorm: Dorm | null; sel: Sel | null } {
  const q = new URLSearchParams(location.search);
  const dorm = q.get("dorm");
  const date = q.get("date");
  const meal = q.get("meal");
  return {
    dorm: isDorm(dorm) ? dorm : null,
    sel: isYmd(date) ? { date, meal: isMeal(meal) ? meal : "lunch" } : null,
  };
}

/** 날짜가 든 달과 겹치는 주의 월요일들 */
function monthMondays(d: Ymd): Ymd[] {
  const first = d.slice(0, 8) + "01";
  const out: Ymd[] = [];
  for (let m = mondayOf(first); m.slice(0, 7) <= d.slice(0, 7); m = addDays(m, 7)) out.push(m);
  return out;
}

const weekDates = (monday: Ymd) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
const dayLabel = (d: Ymd, today: Ymd) => (d === today ? "오늘" : d === addDays(today, 1) ? "내일" : d === addDays(today, -1) ? "어제" : shortDate(d));
/** 정해진 메뉴만 ("선택식 - 빵/우유…"는 골라 먹는 줄이라 식단표 칸·경고 표시에서 뺀다) */
const fixedDishes = (text: string) => dishes(text).filter((x) => !x[0].startsWith("선택식"));
const restOf = (text: string, main: string) =>
  fixedDishes(text)
    .map((x) => x[0])
    .filter((x) => x !== main)
    .join(", ");

export function DesktopApp() {
  const [boot] = useState(bootFromUrl);
  const [s, setS] = useState<AppState>(() => loadState() ?? DEFAULT_STATE);
  const update = useCallback((fn: (x: AppState) => void) => {
    setS((prev) => {
      const x: AppState = structuredClone(prev);
      fn(x);
      saveState(x);
      return x;
    });
  }, []);

  const now = useNow();
  const today = kstToday(now || Date.now());
  const nm = nextMeal(now || Date.now());

  const [view, setView] = useState<Dorm>(boot.dorm ?? s.dorm);
  const [sel, setSel] = useState<Sel>(boot.sel ?? nextMeal());
  const [mode, setMode] = useState<Mode>("week");

  const moveDay = useCallback((n: number) => setSel((x) => ({ ...x, date: addDays(x.date, n) })), []);
  const moveMeal = useCallback(
    (n: number) =>
      setSel((x) => {
        const i = MEALS.indexOf(x.meal) + n;
        if (i < 0) return { date: addDays(x.date, -1), meal: "dinner" };
        if (i >= MEALS.length) return { date: addDays(x.date, 1), meal: "breakfast" };
        return { ...x, meal: MEALS[i] };
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const k = { ArrowLeft: () => moveDay(-1), ArrowRight: () => moveDay(1), ArrowUp: () => moveMeal(-1), ArrowDown: () => moveMeal(1) }[e.key];
      if (!k) return;
      e.preventDefault();
      k();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveDay, moveMeal]);

  const pick = (date: Ymd, meal: Meal, dorm?: Dorm) => {
    if (dorm) setView(dorm);
    setSel({ date, meal });
  };

  return (
    <div className="wld">
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_DEFS }} />
      <header className="top">
        <a className="logo" href="/" aria-label="SsalTech 처음으로">
          <span className="mk">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/assets/logo-96.webp" alt="" width={32} height={32} />
          </span>
          <b>
            Ssal<em>Tech</em>
          </b>
        </a>
        <nav className="nav" aria-label="식당">
          {DORMS.map((d) => (
            <button key={d.id} className={view === d.id ? "on" : ""} aria-pressed={view === d.id} onClick={() => setView(d.id)}>
              {d.name}
              {s.dorm === d.id && <i aria-label="내 식당">★</i>}
            </button>
          ))}
        </nav>
        <span className="sp" />
        <Search dorm={view} today={today} onPick={(date, meal) => (setMode("week"), pick(date, meal))} />
        <a className="ghost" href="/?ui=mobile">
          모바일 화면
        </a>
        <a className="run" href={APK_URL} download>
          Android 앱 받기
        </a>
      </header>

      <main className="grid">
        <section className="col left" aria-label="오늘">
          <NextCard s={s} date={nm.date} meal={nm.meal} today={today} onOpen={() => (setMode("week"), pick(nm.date, nm.meal, s.dorm))} />
          <CompareCard s={s} date={nm.date} meal={nm.meal} today={today} view={view} onPick={(d) => (setMode("week"), pick(nm.date, nm.meal, d))} />
          <AppCard s={s} />
        </section>

        <section className="col center" aria-label="식단표">
          {mode === "week" ? (
            <WeekBoard s={s} dorm={view} sel={sel} today={today} mode={mode} setMode={setMode} onPick={pick} onWeek={(n) => moveDay(7 * n)} onToday={() => setSel(nextMeal())} />
          ) : (
            <MonthBoard
              s={s}
              dorm={view}
              sel={sel}
              today={today}
              mode={mode}
              setMode={setMode}
              onPickDay={(date) => (setMode("week"), setSel((x) => ({ ...x, date })))}
              onMonth={(n) => setSel((x) => ({ ...x, date: addDays(x.date.slice(0, 8) + "01", n > 0 ? 32 : -1).slice(0, 8) + "01" }))}
              onToday={() => setSel(nextMeal())}
            />
          )}
        </section>

        <section className="col right" aria-label="고른 끼니">
          <DetailCard s={s} update={update} dorm={view} sel={sel} today={today} onMyDorm={() => update((x) => void (x.dorm = view))} />
          <AllergyCard s={s} update={update} />
          <RecordCard s={s} />
        </section>
      </main>

      <footer className="foot">
        <span>
          <a href={SITE_URL} target="_blank" rel="noreferrer">
            서울과기대 생활관 홈페이지
          </a>
          식단을 그대로 옮겨 보여 주는 비공식 앱이에요. 알레르기는 메뉴 이름으로 짐작해요.
        </span>
        <span>
          키보드 ←→ 하루 · ↑↓ 끼니 ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}

// ---------- 머리글 검색 ----------

function Search({ dorm, today, onPick }: { dorm: Dorm; today: Ymd; onPick: (date: Ymd, meal: Meal) => void }) {
  const m = mondayOf(today);
  useWeeks(dorm, [addDays(m, -7), m, addDays(m, 7)]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const query = q.trim();
  // 위 useWeeks 구독 덕에 주를 받을 때마다 다시 그려지므로 loadedWeeks는 늘 최신이다. 많아야 3주 × 21끼.
  const results: { date: Ymd; meal: Meal; hit: string }[] = [];
  if (query)
    for (const w of loadedWeeks(dorm))
      for (const d of w.days)
        for (const meal of MEALS) {
          const hit = dishes(d.meals[meal]).find((x) => x[0].includes(query));
          if (hit) results.push({ date: d.date, meal, hit: hit[0] });
        }
  results.sort((a, b) => (a.date === b.date ? MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) : a.date.localeCompare(b.date)));
  results.splice(14);

  const choose = (date: Ymd, meal: Meal) => {
    onPick(date, meal);
    setQ("");
    setOpen(false);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") (setQ(""), setOpen(false), e.currentTarget.blur());
    if (e.key === "Enter" && results[0]) choose(results[0].date, results[0].meal);
  };

  return (
    <div className="srch" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <input
        type="search"
        value={q}
        placeholder={`${dormOf(dorm).name} 메뉴 찾기 (지난주~다음 주)`}
        aria-label="메뉴 검색"
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && query && (
        <div className="drop" role="listbox">
          {results.length ? (
            results.map((r) => (
              <button key={`${r.date}-${r.meal}`} role="option" aria-selected={false} onClick={() => choose(r.date, r.meal)}>
                <b>{r.hit}</b>
                <span>
                  {dayLabel(r.date, today)} {MEAL_NAME[r.meal]}
                </span>
              </button>
            ))
          ) : (
            <p>“{query}”이 든 메뉴가 없어요</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 왼쪽: 다음 끼니, 세 식당, 앱 ----------

function NextCard({ s, date, meal, today, onOpen }: { s: AppState; date: Ymd; meal: Meal; today: Ymd; onOpen: () => void }) {
  const { day, loading, error } = useDay(s.dorm, date);
  const text = day?.meals[meal] ?? "";
  const main = mainDish(text);
  const list = fixedDishes(text);
  const hl = hits(list, s.allergy);
  const fav = favorites(s);
  return (
    <div className="card hero">
      <div className="kicker">
        <span className="dot" />
        {date === today ? "오늘" : "내일"} {MEAL_NAME[meal]} · {hoursOf(date, meal)}
      </div>
      <p className="where">
        <Ico k={DORM_ICON[s.dorm]} size={20} />
        {dormOf(s.dorm).label}
      </p>
      {day && !day.registered ? (
        <h2 className="display">아직 식단이 안 올라왔어요</h2>
      ) : main ? (
        <>
          <h2 className="display">
            {main}
            {fav.has(main) && <em aria-label="좋아하는 메뉴"> ♥</em>}
          </h2>
          <p className="rest">{restOf(text, main)}</p>
        </>
      ) : (
        <h2 className="display">{loading ? "불러오는 중…" : error ? "식단을 못 불러왔어요" : "이 끼니는 쉬어요"}</h2>
      )}
      {hl.length > 0 && <p className="warn">⚠ {hl.map((x) => x[0]).join(", ")} 알레르기 주의</p>}
      <button className="open" onClick={onOpen}>
        식단표에서 보기 →
      </button>
      <Mascot className="moa" />
    </div>
  );
}

function CompareCard({ s, date, meal, today, view, onPick }: { s: AppState; date: Ymd; meal: Meal; today: Ymd; view: Dorm; onPick: (d: Dorm) => void }) {
  return (
    <div className="card pad">
      <div className="ch">
        <b>세 식당 한눈에</b>
        <span>
          {dayLabel(date, today)} {MEAL_NAME[meal]}
        </span>
      </div>
      <ul className="cmp">
        {DORMS.map((d) => (
          <CompareRow key={d.id} s={s} dorm={d.id} date={date} meal={meal} on={view === d.id} onPick={() => onPick(d.id)} />
        ))}
      </ul>
    </div>
  );
}

function CompareRow({ s, dorm, date, meal, on, onPick }: { s: AppState; dorm: Dorm; date: Ymd; meal: Meal; on: boolean; onPick: () => void }) {
  const { day, loading } = useDay(dorm, date);
  const text = day?.meals[meal] ?? "";
  const main = mainDish(text);
  const hit = hits(fixedDishes(text), s.allergy).length > 0;
  return (
    <li>
      <button className={on ? "on" : ""} onClick={onPick}>
        <Ico k={DORM_ICON[dorm]} size={30} />
        <span>
          <small>
            {dormOf(dorm).name}
            {s.dorm === dorm && " ★"}
          </small>
          <b>{day && !day.registered ? "미등록" : main || (loading ? "불러오는 중…" : "—")}</b>
        </span>
        {hit && <i title="알레르기 주의">⚠</i>}
      </button>
    </li>
  );
}

function AppCard({ s }: { s: AppState }) {
  const on = s.alarms.filter((a) => a.on);
  return (
    <div className="card pad app">
      <div className="ch">
        <b>메뉴 알림은 휴대폰에서</b>
      </div>
      <p>웹 브라우저는 정한 시각에 알림을 울릴 수 없어요. Android 앱을 설치하면 정한 시각에 그 끼니 메뉴를 보내 드려요.</p>
      {on.length > 0 && (
        <ul className="rules">
          {on.map((a) => (
            <li key={a.id}>
              <b>{a.time}</b> {a.offset ? "내일" : "오늘"} {MEAL_NAME[a.meal]} · {dormOf(a.dorm).name}
            </li>
          ))}
        </ul>
      )}
      <div className="btns">
        <a className="run sm" href={APK_URL} download>
          Android 앱 (APK)
        </a>
        <span>아이폰: Safari 공유 → 홈 화면에 추가</span>
      </div>
    </div>
  );
}

// ---------- 가운데: 주간·월간 식단표 ----------

function BoardHead({
  title,
  sub,
  mode,
  setMode,
  onPrev,
  onNext,
  nextOk,
  onToday,
  onRefresh,
}: {
  title: string;
  sub: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  onPrev: () => void;
  onNext: () => void;
  nextOk: boolean;
  onToday: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="bh">
      <div>
        <h1 className="display">{title}</h1>
        <p>{sub}</p>
      </div>
      <span className="sp" />
      <div className="seg" role="group" aria-label="보기">
        <button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>
          주간
        </button>
        <button className={mode === "month" ? "on" : ""} onClick={() => setMode("month")}>
          월간
        </button>
      </div>
      <div className="pager">
        <button onClick={onPrev} aria-label="이전">
          ‹
        </button>
        <button onClick={onToday}>오늘</button>
        <button onClick={onNext} disabled={!nextOk} aria-label="다음">
          ›
        </button>
      </div>
      <button className="ghost" onClick={onRefresh}>
        새로고침
      </button>
    </div>
  );
}

function statusLine(e: { week?: unknown; loading: boolean; error?: string; stale?: boolean }, far: boolean): string {
  if (far) return "아직 올라오지 않은 주예요 (생활관은 다음 주까지만 올려요)";
  if (e.loading && !e.week) return "생활관 홈페이지에서 받는 중…";
  if (e.error && e.week) return "사이트에 연결하지 못해 이 기기에 남은 결과를 보여 줘요";
  if (e.error) return `식단을 못 불러왔어요 · ${e.error}`;
  return "";
}

function WeekBoard({
  s,
  dorm,
  sel,
  today,
  mode,
  setMode,
  onPick,
  onWeek,
  onToday,
}: {
  s: AppState;
  dorm: Dorm;
  sel: Sel;
  today: Ymd;
  mode: Mode;
  setMode: (m: Mode) => void;
  onPick: (date: Ymd, meal: Meal) => void;
  onWeek: (n: number) => void;
  onToday: () => void;
}) {
  const monday = mondayOf(sel.date);
  const [e] = useWeeks(dorm, [monday]);
  const dates = weekDates(monday);
  const byDate = new Map((e.week?.days ?? []).map((d) => [d.date, d]));
  const fav = favorites(s);
  const status = statusLine(e, !loadable(monday));
  const wk = Math.ceil(dayNum(monday) / 7);
  return (
    <div className="card board">
      <BoardHead
        title={`${monthNum(monday)}월 ${wk}주 · ${dormOf(dorm).label}`}
        sub={status || `${shortDate(monday)} ~ ${shortDate(addDays(monday, 6))}`}
        mode={mode}
        setMode={setMode}
        onPrev={() => onWeek(-1)}
        onNext={() => onWeek(1)}
        nextOk={loadable(addDays(monday, 7))}
        onToday={onToday}
        onRefresh={() => void refreshWeeks(dorm, [monday])}
      />
      <div className="wk" role="grid" aria-label="주간 식단표">
        <div className="corner" />
        {dates.map((d) => (
          <div key={d} className={`dh${d === today ? " today" : ""}${weekday(d) % 6 === 0 ? " we" : ""}`} role="columnheader">
            <b>{WD[weekday(d)]}</b>
            <span>{d === today ? "오늘" : `${monthNum(d)}/${dayNum(d)}`}</span>
          </div>
        ))}
        {MEALS.map((meal) => (
          <WeekRow key={meal} meal={meal} dates={dates} byDate={byDate} s={s} fav={fav} sel={sel} today={today} loading={e.loading} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function WeekRow({
  meal,
  dates,
  byDate,
  s,
  fav,
  sel,
  today,
  loading,
  onPick,
}: {
  meal: Meal;
  dates: Ymd[];
  byDate: Map<Ymd, DayMenu>;
  s: AppState;
  fav: Set<string>;
  sel: Sel;
  today: Ymd;
  loading: boolean;
  onPick: (date: Ymd, meal: Meal) => void;
}) {
  return (
    <>
      <div className="mh" role="rowheader">
        <b>{MEAL_NAME[meal]}</b>
        <span>{hoursOf(dates[0], meal)}</span>
        <span className="we">주말 {hoursOf(dates[5], meal)}</span>
      </div>
      {dates.map((d) => {
        const day = byDate.get(d);
        const text = day?.meals[meal] ?? "";
        const list = fixedDishes(text);
        const main = mainDish(text);
        const on = sel.date === d && sel.meal === meal;
        const hit = hits(list, s.allergy).length > 0;
        const cls = ["cell", on && "on", d === today && "today", day && !day.registered && "na", hit && "hit"].filter(Boolean).join(" ");
        return (
          <button key={d} className={cls} role="gridcell" aria-selected={on} onClick={() => onPick(d, meal)}>
            {day && !day.registered ? (
              <span className="empty">미등록</span>
            ) : list.length ? (
              <ul>
                {list.map(([name, nums], i) => (
                  <li key={`${i}-${name}`} className={`${name === main ? "main" : ""}${nums.some((n) => s.allergy.includes(n)) ? " h" : ""}`}>
                    {name}
                    {fav.has(name) && <em> ♥</em>}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="empty">{loading && !day ? "…" : "—"}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function MonthBoard({
  s,
  dorm,
  sel,
  today,
  mode,
  setMode,
  onPickDay,
  onMonth,
  onToday,
}: {
  s: AppState;
  dorm: Dorm;
  sel: Sel;
  today: Ymd;
  mode: Mode;
  setMode: (m: Mode) => void;
  onPickDay: (date: Ymd) => void;
  onMonth: (n: number) => void;
  onToday: () => void;
}) {
  const mondays = monthMondays(sel.date);
  const entries = useWeeks(dorm, mondays);
  const byDate = new Map(entries.flatMap((e) => e.week?.days ?? []).map((d) => [d.date, d]));
  const month = sel.date.slice(0, 7);
  const nextMonthFirst = addDays(sel.date.slice(0, 8) + "01", 32).slice(0, 8) + "01";
  const loadingAny = entries.some((e) => e.loading && !e.week);
  return (
    <div className="card board">
      <BoardHead
        title={`${Number(month.slice(0, 4))}년 ${monthNum(sel.date)}월 · ${dormOf(dorm).label}`}
        sub={loadingAny ? "생활관 홈페이지에서 받는 중…" : "날짜를 누르면 그 주 식단표로 가요. 생활관은 다음 주까지만 올려요."}
        mode={mode}
        setMode={setMode}
        onPrev={() => onMonth(-1)}
        onNext={() => onMonth(1)}
        nextOk={loadable(mondayOf(nextMonthFirst))}
        onToday={onToday}
        onRefresh={() => void refreshWeeks(dorm, mondays.filter(loadable))}
      />
      <div className="mo" role="grid" aria-label="월간 식단표">
        {["월", "화", "수", "목", "금", "토", "일"].map((w) => (
          <div key={w} className="dh" role="columnheader">
            <b>{w}</b>
          </div>
        ))}
        {mondays.flatMap(weekDates).map((d) => {
          const day = byDate.get(d);
          const out = d.slice(0, 7) !== month;
          const hit = day ? MEALS.some((m) => hits(fixedDishes(day.meals[m]), s.allergy).length > 0) : false;
          const cls = ["mday", out && "out", d === today && "today", d === sel.date && "on", day && !day.registered && "na"].filter(Boolean).join(" ");
          return (
            <button key={d} className={cls} role="gridcell" onClick={() => onPickDay(d)}>
              <span className="n">
                {dayNum(d)}
                {hit && <i title="알레르기 주의">⚠</i>}
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
    </div>
  );
}

// ---------- 오른쪽: 고른 끼니, 알레르기, 내 기록 ----------

function DetailCard({
  s,
  update,
  dorm,
  sel,
  today,
  onMyDorm,
}: {
  s: AppState;
  update: (fn: (x: AppState) => void) => void;
  dorm: Dorm;
  sel: Sel;
  today: Ymd;
  onMyDorm: () => void;
}) {
  const { day, loading } = useDay(dorm, sel.date);
  const list: Dish[] = dishes(day?.meals[sel.meal] ?? "");
  const hl = hits(list, s.allergy);
  const nums = [...new Set(hl.flatMap((d) => d[1].filter((n) => s.allergy.includes(n))))].sort((a, b) => a - b);
  const rates = s.rates[sel.date] ?? {};
  const rateable = list.filter((x) => !x[0].startsWith("선택식"));
  const rate = (name: string, n: number) =>
    update((x) => {
      x.rates[sel.date] = { ...(x.rates[sel.date] ?? {}), [name]: n };
    });
  return (
    <div className="card pad detail">
      <div className="kicker">
        <span className="dot" />
        {dayLabel(sel.date, today)} {MEAL_NAME[sel.meal]} · {hoursOf(sel.date, sel.meal)}
      </div>
      <h3 className="display">
        {shortDate(sel.date)} {MEAL_NAME[sel.meal]}
      </h3>
      <p className="where">
        {dormOf(dorm).label}
        {s.dorm !== dorm && (
          <button className="mini" onClick={onMyDorm}>
            내 식당으로 정하기
          </button>
        )}
      </p>
      {day && !day.registered ? (
        <p className="none">이날은 생활관 홈페이지에 아직 식단이 없어요(미등록).</p>
      ) : !list.length ? (
        <p className="none">{loading ? "불러오는 중…" : !loadable(mondayOf(sel.date)) ? "아직 올라오지 않은 날이에요." : "이 끼니는 메뉴가 없어요."}</p>
      ) : (
        <>
          {hl.length > 0 && (
            <div className="alert">
              <b>{hl.map((x) => x[0]).join(", ")} 주의</b>
              <small>메뉴 이름으로 짐작: {nums.map((n) => `${n} ${AL[n]}`).join(", ")}</small>
            </div>
          )}
          <ul className="dl">
            {list.map(([name, ns], i) => (
              <li key={`${i}-${name}`} className={ns.some((n) => s.allergy.includes(n)) ? "h" : ""}>
                <span className="nm">{name}</span>
                <span className="al">
                  {ns.map((n) => (
                    <i key={n} className={s.allergy.includes(n) ? "h" : ""} title={AL[n]}>
                      {n}
                    </i>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {sel.date <= today && rateable.length > 0 && (
            <div className="rate">
              <h4>먹어 봤다면 별점 (이 기기에만 남아요)</h4>
              {rateable.map(([name]) => (
                <div className="rrow" key={name}>
                  <span>{name}</span>
                  <span className="stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => rate(name, n)} aria-label={`${name} ${n}점`} aria-pressed={(rates[name] ?? 0) >= n}>
                        <Svg html={(rates[name] ?? 0) >= n ? STAR_ON : STAR_OFF} />
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AllergyCard({ s, update }: { s: AppState; update: (fn: (x: AppState) => void) => void }) {
  const toggle = (n: number) =>
    update((x) => {
      x.allergy = x.allergy.includes(n) ? x.allergy.filter((y) => y !== n) : [...x.allergy, n].sort((a, b) => a - b);
    });
  return (
    <div className="card pad">
      <div className="ch">
        <b>내 알레르기</b>
        <span>{s.allergy.length ? `${s.allergy.length}개 · 식단표에 빨갛게` : "고르면 식단표에 표시해요"}</span>
      </div>
      <div className="chips">
        {AL.slice(1).map((name, i) => {
          const n = i + 1;
          const on = s.allergy.includes(n);
          return (
            <button key={n} className={on ? "on" : ""} aria-pressed={on} onClick={() => toggle(n)}>
              <i>{n}</i>
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecordCard({ s }: { s: AppState }) {
  const fav = [...favorites(s)];
  return (
    <div className="card pad">
      <div className="ch">
        <b>내 기록</b>
        <span>별점 {ratingCount(s)}개</span>
      </div>
      {fav.length ? (
        <>
          <p className="sub">4점 이상 준 메뉴는 식단표에 ♥로 보여요.</p>
          <div className="favs">
            {fav.map((x) => (
              <span key={x}>♥ {x}</span>
            ))}
          </div>
        </>
      ) : (
        <p className="sub">먹어 본 끼니를 고르고 별점을 남기면 좋아하는 메뉴를 기억해요.</p>
      )}
    </div>
  );
}
