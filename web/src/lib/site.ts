import { SITE_URL, addDays, allRegistered, kstToday, mondayOf, parseWeek, type Dorm, type WeekMenu, type Ymd } from "./menu";

const TIMEOUT_MS = 15_000;
const HOUR = 3600;

/** 생활관 사이트에서 한 주(월~일)를 받아 파싱한다. 항상 월요일로 요청한다. revalidate 를 주면 그 초만큼 캐시한다. */
export async function fetchWeek(dorm: Dorm, monday: Ymd, cache?: { revalidate?: number }): Promise<WeekMenu> {
  const [year, month, day] = monday.split("-").map(Number);
  const form = new URLSearchParams({ foodtype: dorm, year: String(year), month: String(month), day: String(day) });
  const res = await fetch(SITE_URL, {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "dorm-menu" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(cache?.revalidate ? { next: { revalidate: cache.revalidate } } : { cache: "no-store" as const }),
  });
  if (!res.ok) throw new Error(`생활관 사이트가 HTTP ${res.status}로 응답했습니다`);
  return { dorm, monday, days: parseWeek(await res.text(), monday), fetchedAt: new Date().toISOString() };
}

export type WeekRange = "past" | "current" | "far";

/** 사이트에 부담을 주지 않으려고 다음 주보다 먼 주는 요청하지 않는다. */
export function rangeOf(monday: Ymd, today = kstToday()): WeekRange {
  const thisMonday = mondayOf(today);
  if (monday < thisMonday) return "past";
  return monday > addDays(thisMonday, 7) ? "far" : "current";
}

/**
 * CDN 캐시 시간. 지난 주는 바뀌지 않고, 다 올라온 주는 12시간,
 * 미등록 날이 있는 주는 3시간마다 다시 받는다.
 */
export function cacheControl(week: WeekMenu, range: WeekRange): string {
  const maxAge = range === "past" ? 7 * 24 * HOUR : allRegistered(week) ? 12 * HOUR : 3 * HOUR;
  return `public, max-age=300, s-maxage=${maxAge}, stale-while-revalidate=${HOUR}`;
}
