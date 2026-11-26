"use client";

// 데스크톱 화면 여러 페이지가 함께 쓰는 상태(context), 계산, 작은 부품.
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { MEALS, MEAL_NAME, addDays, dormOf, mainDish, mondayOf, shortDate, type Dorm, type Meal, type Ymd } from "@/lib/menu";
import type { IconName } from "../icons";
import { I, STAR_OFF, STAR_ON } from "../icons";
import { Svg, st } from "../kit";
import { dishes, loadedWeeks, useWeeks, type AppState } from "../store";

export type DTab = "home" | "menu" | "alarm" | "allergy" | "my";
export type Mode = "week" | "month";
export interface Sel {
  date: Ymd;
  meal: Meal;
}

export interface Desk {
  s: AppState;
  update: (fn: (x: AppState) => void) => void;
  today: Ymd;
  /** 지금 시각(ms, 분 단위로 바뀜) */
  now: number;
  /** 식단표에서 보는 식당 (내 식당과 다를 수 있다) */
  view: Dorm;
  setView: (d: Dorm) => void;
  sel: Sel;
  setSel: Dispatch<SetStateAction<Sel>>;
  mode: Mode;
  setMode: (m: Mode) => void;
  tab: DTab;
  go: (tab: DTab) => void;
  /** 식단표 탭으로 가서 그 끼니를 고른다 */
  open: (date: Ymd, meal: Meal, dorm?: Dorm) => void;
  toast: (msg: string) => void;
  /** 화면 좌표에서 작은 축하 조각을 터뜨린다 */
  burst: (x: number, y: number) => void;
  /** 이 기기 기록을 지운다 (휴대폰 화면은 다음에 처음 화면부터) */
  reset: () => void;
}

export const MEAL_ICO: Record<Meal, IconName> = { breakfast: "bowl", lunch: "tray", dinner: "salad" };

export const DeskCtx = createContext<Desk | null>(null);

export function useDesk(): Desk {
  const d = useContext(DeskCtx);
  if (!d) throw new Error("useDesk outside DesktopApp");
  return d;
}

export { st };

function everyMinute(cb: () => void) {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
}

/** 1분마다 바뀌는 지금 시각. 서버에서는 0. */
export function useNow(): number {
  return useSyncExternalStore(everyMinute, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);
}

export const weekDates = (monday: Ymd) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export const dayLabel = (d: Ymd, today: Ymd) =>
  d === today ? "오늘" : d === addDays(today, 1) ? "내일" : d === addDays(today, -1) ? "어제" : shortDate(d);

/** 정해진 메뉴만 ("선택식 - 빵/우유…"는 골라 먹는 줄이라 식단표 칸·경고 표시에서 뺀다) */
export const fixedDishes = (text: string) => dishes(text).filter((x) => !x[0].startsWith("선택식"));

export const restOf = (text: string, main: string) =>
  fixedDishes(text)
    .map((x) => x[0])
    .filter((x) => x !== main)
    .join(", ");

/** 날짜가 든 달과 겹치는 주의 월요일들 */
export function monthMondays(d: Ymd): Ymd[] {
  const first = d.slice(0, 8) + "01";
  const out: Ymd[] = [];
  for (let m = mondayOf(first); m.slice(0, 7) <= d.slice(0, 7); m = addDays(m, 7)) out.push(m);
  return out;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** "07:30~08:50" → [450, 530] (분) */
export const spanOf = (hours: string) => hours.split("~").map(toMin) as [number, number];

/** "2시간 5분" */
export const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}` : `${min}분`);

/**
 * 묶음 안에서 `data-k`가 key인 칸의 위치. 그 뒤로 미끄러지는 알약(thumb)의 style을 돌려준다.
 * 글꼴이 늦게 와서 칸 폭이 바뀌어도 ResizeObserver로 다시 잰다.
 */
export function useThumb(host: RefObject<HTMLElement | null>, key: string, axis: "x" | "y" = "x"): CSSProperties | undefined {
  const [box, setBox] = useState<{ p: number; s: number } | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"]`);
      setBox(on ? (axis === "x" ? { p: on.offsetLeft, s: on.offsetWidth } : { p: on.offsetTop, s: on.offsetHeight }) : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [host, key, axis]);
  if (!box) return undefined;
  return axis === "x" ? { transform: `translateX(${box.p}px)`, width: box.s } : { transform: `translateY(${box.p}px)`, height: box.s };
}

/** 고른 칸 뒤로 알약이 미끄러지는 단추 묶음 */
export function Seg<T extends string>({
  items,
  value,
  onChange,
  label,
  className = "",
}: {
  items: readonly (readonly [T, ReactNode])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const thumb = useThumb(host, value);
  return (
    <div ref={host} className={`seg ${className}`} role="group" aria-label={label}>
      {thumb && <span className="thumb" style={thumb} aria-hidden="true" />}
      {items.map(([v, node]) => (
        <button key={v} data-k={v} className={v === value ? "on" : ""} aria-pressed={v === value} onClick={() => onChange(v)}>
          {node}
        </button>
      ))}
    </div>
  );
}

/** 별 다섯 개. 바뀐 별만 다시 그려져 톡 튀는 애니메이션이 돈다. */
export function Stars({ name, value, onRate }: { name: string; value: number; onRate: (n: number, el: HTMLElement) => void }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={value >= n ? "on" : ""} style={st(n)} onClick={(e) => onRate(n, e.currentTarget)} aria-label={`${name} ${n}점`} aria-pressed={value >= n}>
          <Svg key={value >= n ? "on" : "off"} html={value >= n ? STAR_ON : STAR_OFF} />
        </button>
      ))}
    </span>
  );
}

/** 행 n개(+첫 행 반복)를 굴리는 keyframes. 행 높이 24px, 각 행에 머물다 마지막 3%에 넘어간다. */
function rollKeyframes(n: number): string {
  const seg = 100 / n;
  const holds = Array.from({ length: n }, (_, i) => `${+(i * seg).toFixed(2)}%,${+((i + 1) * seg - 3).toFixed(2)}%{transform:translateY(${-24 * i}px)}`);
  return `@keyframes wld-roll-${n}{${holds.join("")}100%{transform:translateY(${-24 * n}px)}}`;
}

/** 메뉴 검색: 지난주~다음 주. 비어 있을 때는 앞으로 나올 메뉴가 굴러간다. */
export function Search({ big = false }: { big?: boolean }) {
  const { view, today, open } = useDesk();
  const m = mondayOf(today);
  useWeeks(view, [addDays(m, -7), m, addDays(m, 7)]);
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [cur, setCur] = useState(0);
  const query = q.trim();
  // useWeeks 구독 덕에 주를 받을 때마다 다시 그려지므로 loadedWeeks는 늘 최신이다. 많아야 3주 × 21끼.
  const weeks = loadedWeeks(view);
  const results: { date: Ymd; meal: Meal; hit: string }[] = [];
  const roll: [string, string][] = [];
  for (const w of weeks)
    for (const d of w.days)
      for (const meal of MEALS) {
        if (query) {
          const hit = dishes(d.meals[meal]).find((x) => x[0].includes(query));
          if (hit) results.push({ date: d.date, meal, hit: hit[0] });
        } else if (d.date >= today && d.registered) {
          const main = mainDish(d.meals[meal]);
          if (main) roll.push([main, `${dayLabel(d.date, today)} ${MEAL_NAME[meal]}`]);
        }
      }
  const order = (a: { date: Ymd; meal: Meal }, b: { date: Ymd; meal: Meal }) =>
    a.date === b.date ? MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) : a.date.localeCompare(b.date);
  results.sort(order);
  results.splice(12);
  roll.splice(6);
  const n = roll.length;

  const choose = (date: Ymd, meal: Meal) => {
    open(date, meal, view);
    setQ("");
    setShow(false);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") (setQ(""), setShow(false), e.currentTarget.blur());
    if (e.key === "ArrowDown") (e.preventDefault(), setCur((c) => Math.min(c + 1, results.length - 1)));
    if (e.key === "ArrowUp") (e.preventDefault(), setCur((c) => Math.max(c - 1, 0)));
    const r = results[cur] ?? results[0];
    if (e.key === "Enter" && r) choose(r.date, r.meal);
  };

  return (
    <div className={`srch${big ? " big" : ""}`} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setShow(false)}>
      <label className="box">
        <input
          type="search"
          value={q}
          placeholder={n ? "" : `${dormOf(view).name} 메뉴 찾기`}
          aria-label={`${dormOf(view).name} 메뉴 찾기 (지난주~다음 주)`}
          onChange={(e) => (setQ(e.target.value), setShow(true), setCur(0))}
          onFocus={() => setShow(true)}
          onKeyDown={onKey}
        />
        {!q && n > 0 && (
          <span className="roll" aria-hidden="true">
            <style href={`wld-roll-${n}`} precedence="wld">
              {rollKeyframes(n)}
            </style>
            <span style={{ animation: `wld-roll-${n} ${n * 2.4}s infinite` }}>
              {[...roll, roll[0]].map(([main, when], i) => (
                <span key={i}>
                  <b>{(i % n) + 1}</b>
                  {main}
                  <i>{when}</i>
                </span>
              ))}
            </span>
          </span>
        )}
        <Svg html={I.search} className="mag" />
      </label>
      {show && query && (
        <div className="drop" role="listbox" aria-label="검색 결과">
          {results.length ? (
            results.map((r, i) => (
              <button key={`${r.date}-${r.meal}`} role="option" aria-selected={i === cur} className={i === cur ? "cur" : ""} style={st(i)} onMouseEnter={() => setCur(i)} onClick={() => choose(r.date, r.meal)}>
                <b>{r.hit}</b>
                <span>
                  {dayLabel(r.date, today)} {MEAL_NAME[r.meal]}
                </span>
              </button>
            ))
          ) : (
            <p>“{query}”이 든 메뉴가 지난주~다음 주에 없어요</p>
          )}
        </div>
      )}
    </div>
  );
}
