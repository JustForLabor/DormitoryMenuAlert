"use client";

// 이 기기에만 저장하는 앱 상태(식당·알레르기·별점·알림 규칙)와 식단 불러오기.
// 서버로 보내는 것은 식단 요청(식당·주)뿐이다.
import { useEffect, useSyncExternalStore } from "react";
import { addDays, entryEnd, isWeekend, kstToday, menuItems, mondayOf, type Dorm, type Meal, type WeekMenu, type Ymd } from "@/lib/menu";

// ---------- 알레르기 (식품 알레르기 표시 기준 1~19번) ----------

export const AL = [
  "",
  "난류",
  "우유",
  "메밀",
  "땅콩",
  "대두",
  "밀",
  "고등어",
  "게",
  "새우",
  "돼지고기",
  "복숭아",
  "토마토",
  "아황산류",
  "호두",
  "닭고기",
  "쇠고기",
  "오징어",
  "조개류",
  "잣",
] as const;

/**
 * 생활관 식단표에는 알레르기 번호가 없어서 메뉴 이름에 든 낱말로 짐작한다.
 * 이름에 드러나지 않는 재료(소스·반죽)는 잡지 못하므로 화면에 늘 "이름으로 짐작"이라고 밝힌다.
 */
const AL_WORDS: Record<number, readonly string[]> = {
  1: ["계란", "달걀", "메추리알", "에그", "오믈렛", "마요", "스크램블", "지단", "머랭"],
  2: ["우유", "치즈", "크림", "요거트", "요구르트", "요플레", "버터", "라떼", "밀크", "까르보나라", "그라탕"],
  3: ["메밀", "모밀"],
  4: ["땅콩", "피넛"],
  5: ["두부", "된장", "간장", "두유", "유부", "청국장", "쌈장", "미소", "콩"],
  6: ["빵", "국수", "우동", "라면", "파스타", "스파게티", "만두", "까스", "가스", "튀김", "짜장", "짬뽕", "카레", "수제비", "씨리얼", "시리얼", "쿠키", "케이크", "와플", "토스트", "버거", "피자", "춘권", "탕수", "너겟", "고로케", "함박", "멘", "쫄면", "칼국수", "웨하스", "크로와상"],
  7: ["고등어"],
  8: ["꽃게", "게살", "대게", "게장", "크래미", "맛살"],
  9: ["새우", "쉬림프"],
  10: ["돼지", "돈육", "제육", "삼겹", "목살", "돈까스", "돈가스", "돈불고기", "햄", "베이컨", "소세지", "소시지", "스팸", "동그랑땡", "보쌈", "족발", "순대", "수육", "한돈", "탕수육"],
  11: ["복숭아"],
  12: ["토마토", "케첩", "케찹"],
  13: ["와인", "건포도"],
  14: ["호두"],
  15: ["닭", "치킨", "너겟"],
  16: ["소고기", "쇠고기", "소불고기", "한우", "차돌", "사골", "육개장", "갈비탕", "우삼겹"],
  17: ["오징어"],
  18: ["조개", "바지락", "홍합", "꼬막", "가리비", "재첩", "전복", "굴"],
  19: ["잣"],
};

/** 메뉴 한 항목: [이름, 짐작한 알레르기 번호] */
export type Dish = readonly [string, readonly number[]];

export function dishes(text: string): Dish[] {
  return menuItems(text).map((name) => {
    const nums: number[] = [];
    for (let n = 1; n < AL.length; n++) if (AL_WORDS[n].some((w) => name.includes(w))) nums.push(n);
    return [name, nums] as const;
  });
}

export const hits = (list: readonly Dish[], allergy: readonly number[]) => list.filter((d) => d[1].some((n) => allergy.includes(n)));

// ---------- 앱 상태 ----------

export type Repeat = "all" | "weekday" | "weekend";

/** 알림 규칙: 매일(또는 평일·주말) time에 offset일 뒤 meal 메뉴를 보낸다. C 버전 alarm 규칙과 같은 모양. */
export interface Alarm {
  id: string;
  /** 0 오늘, 1 내일 */
  offset: 0 | 1;
  meal: Meal;
  /** HH:MM */
  time: string;
  dorm: Dorm;
  repeat: Repeat;
  on: boolean;
  /** "fav"이면 즐겨찾기 알림: meal 대신 그날 세 끼에서 favs 메뉴를 찾아, 있을 때만 울린다. deliveredAlarms가 만든다. */
  kind?: "fav";
  favs?: string[];
  /**
   * 있으면 마감 알림: 그날 meal 입장 마감 before분 전에 울린다(offset은 0). 평일·주말 마감 시각이 달라
   * deliveredAlarms가 평일·주말 규칙으로 나눠 time을 채운다. 저장된 time은 평일 기준 값이다.
   */
  before?: number;
}

/** 즐겨찾기 메뉴 알림 설정: offset일 뒤 메뉴에 즐겨찾기가 있으면 매일 time에 알린다. */
export interface FavAlarm {
  on: boolean;
  offset: 0 | 1;
  /** HH:MM */
  time: string;
}

export const FAV_ALARM_DEFAULT: FavAlarm = { on: false, offset: 1, time: "21:00" };

export interface AppState {
  dorm: Dorm;
  allergy: number[];
  /** 날짜별 내가 매긴 별점 (메뉴 이름 → 1~5) */
  rates: Record<Ymd, Record<string, number>>;
  alarms: Alarm[];
  /** 즐겨찾기한 메뉴 이름. 없던 시절 상태는 loadState가 별점 4점 이상으로 채운다. */
  favs?: string[];
  favAlarm?: FavAlarm;
}

const KEY = "ssaltech_v1";

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AppState;
    if (!s.favs) s.favs = [...latestRates(s)].filter(([, v]) => v >= 4).map(([k]) => k);
    return s;
  } catch {
    return null;
  }
}

export function saveState(s: AppState | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

/** 가장 최근에 매긴 별점 (메뉴 이름 → 점수) */
export function latestRates(s: AppState): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of Object.keys(s.rates).sort()) for (const [k, v] of Object.entries(s.rates[d])) out.set(k, v);
  return out;
}

export const ratingCount = (s: AppState) => Object.values(s.rates).reduce((a, r) => a + Object.keys(r).length, 0);

/** 즐겨찾기한 메뉴 */
export const favorites = (s: AppState): Set<string> => new Set(s.favs ?? []);

/** 즐겨찾기를 켜거나 끈다 (update 안에서 부른다). */
export function setFav(x: AppState, name: string, on: boolean) {
  const f = favorites(x);
  if (on) f.add(name);
  else f.delete(name);
  x.favs = [...f];
}

export const favAddedText = (s: AppState, name: string) =>
  `${name} 즐겨찾기 ♥ · ${s.favAlarm?.on ? "나오는 날 알려 드려요" : "알림 탭에서 나오는 날 알림을 켤 수 있어요"}`;

export const FAV_MAX = 50;

/** 마감 알림 분 고르기 */
export const BEFORE_CHOICES = [10, 20, 30, 60] as const;
export const BEFORE_MAX = 180;

const hhmm = (min: number) => {
  const m = Math.max(0, min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const minOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** 마감 알림이 평일·주말에 울리는 시각 */
export const closeAlarmTime = (day: "weekday" | "weekend", meal: Meal, before: number) => hhmm(minOf(entryEnd(day, meal)) - before);

/** 이 규칙이 d날에 울리는 시각 */
export const alarmTimeOn = (a: Pick<Alarm, "time" | "meal" | "before">, d: Ymd) =>
  a.before ? closeAlarmTime(isWeekend(d) ? "weekend" : "weekday", a.meal, a.before) : a.time;

/** 기기·허브에 넘길 알림 목록: 내가 만든 규칙(마감 알림은 평일·주말로 나눔) + 즐겨찾기 알림(켜져 있고 즐겨찾기가 있을 때). */
export function deliveredAlarms(s: AppState): Alarm[] {
  const out = s.alarms.flatMap((a): Alarm[] => {
    if (!a.before) return [a];
    const before = a.before;
    const days = a.repeat === "all" ? (["weekday", "weekend"] as const) : [a.repeat];
    return days.map((day) => ({ ...a, id: `${a.id}-${day === "weekday" ? "wd" : "we"}`, offset: 0, repeat: day, time: closeAlarmTime(day, a.meal, before) }));
  });
  const f = s.favAlarm;
  const favs = (s.favs ?? []).slice(0, FAV_MAX);
  if (!f?.on || !favs.length) return out;
  return [...out, { id: "fav", kind: "fav", favs, offset: f.offset, meal: "lunch", time: f.time, dorm: s.dorm, repeat: "all", on: true }];
}

// ---------- 식단 불러오기 ----------

interface Entry {
  week?: WeekMenu;
  error?: string;
  loading: boolean;
  /** 네트워크가 안 돼 이 기기에 남은 지난 결과를 보여 주는 중 */
  stale?: boolean;
}

const weeks = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const keyOf = (dorm: Dorm, monday: Ymd) => `${dorm}:${monday}`;
const storeKey = (k: string) => `ssaltech_w_${k}`;

function emit() {
  version++;
  for (const l of listeners) l();
}

function set(k: string, e: Entry) {
  weeks.set(k, e);
  emit();
}

/** 다음 주보다 먼 주는 아직 올라오지 않으므로 요청하지 않는다(서버도 404). */
export const loadable = (monday: Ymd) => monday <= addDays(mondayOf(kstToday()), 7);

export async function loadWeek(dorm: Dorm, monday: Ymd, force = false): Promise<void> {
  const k = keyOf(dorm, monday);
  const cur = weeks.get(k);
  if (!loadable(monday) || cur?.loading || (cur?.week && !cur.stale && !force)) return;
  let saved: WeekMenu | undefined = cur?.week;
  if (!saved) {
    try {
      const raw = localStorage.getItem(storeKey(k));
      saved = raw ? (JSON.parse(raw) as WeekMenu) : undefined;
    } catch {
      saved = undefined;
    }
  }
  set(k, { week: saved, loading: true, stale: !!saved });
  try {
    const res = await fetch(`/api/menu?dorm=${dorm}&week=${monday}`, force ? { cache: "no-cache" } : undefined);
    const j = (await res.json()) as WeekMenu & { error?: string };
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    localStorage.setItem(storeKey(k), JSON.stringify(j));
    set(k, { week: j, loading: false });
  } catch (e) {
    set(k, { week: saved, loading: false, stale: !!saved, error: e instanceof Error ? e.message : String(e) });
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** dorm의 여러 주를 불러오고 상태를 돌려준다. */
export function useWeeks(dorm: Dorm, mondays: readonly Ymd[]): Entry[] {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const sig = mondays.join(",");
  useEffect(() => {
    for (const m of sig.split(",")) void loadWeek(dorm, m);
  }, [dorm, sig]);
  return mondays.map((m) => weeks.get(keyOf(dorm, m)) ?? { loading: loadable(m) });
}

/** 하루치 식단 (불러오지 않았거나 먼 주면 undefined) */
export function useDay(dorm: Dorm, date: Ymd) {
  const [e] = useWeeks(dorm, [mondayOf(date)]);
  return { ...e, day: e.week?.days.find((d) => d.date === date) };
}

/** 당겨서 새로고침: 지금 화면에 쓰는 주를 다시 받는다. */
export async function refreshWeeks(dorm: Dorm, mondays: readonly Ymd[]) {
  await Promise.all(mondays.map((m) => loadWeek(dorm, m, true)));
}

/** 이미 받아 둔 주 전부 (검색용) */
export function loadedWeeks(dorm: Dorm): WeekMenu[] {
  const out: WeekMenu[] = [];
  for (const [k, e] of weeks) if (k.startsWith(dorm + ":") && e.week) out.push(e.week);
  return out.sort((a, b) => a.monday.localeCompare(b.monday));
}
