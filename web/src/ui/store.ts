"use client";

// 이 기기에만 저장하는 앱 상태(식당·알레르기·별점·알림 규칙)와 식단 불러오기.
// 서버로 보내는 것은 식단 요청(식당·주)뿐이다.
import { useEffect, useSyncExternalStore } from "react";
import { addDays, kstToday, menuItems, mondayOf, type Dorm, type Meal, type WeekMenu, type Ymd } from "@/lib/menu";

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
}

export interface AppState {
  dorm: Dorm;
  allergy: number[];
  /** 날짜별 내가 매긴 별점 (메뉴 이름 → 1~5) */
  rates: Record<Ymd, Record<string, number>>;
  alarms: Alarm[];
}

const KEY = "ssaltech_v1";

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
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

/** 별점 4점 이상을 준 메뉴 */
export function favorites(s: AppState): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of latestRates(s)) if (v >= 4) out.add(k);
  return out;
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
