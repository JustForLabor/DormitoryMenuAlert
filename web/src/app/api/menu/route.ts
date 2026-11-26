import { isDorm, isYmd, kstToday, mondayOf } from "@/lib/menu";
import { cacheControl, fetchWeek, rangeOf } from "@/lib/site";

/** GET /api/menu?dorm=kb&week=2026-11-26 → 그 날짜가 속한 주(월~일) 식단 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const dorm = q.get("dorm") ?? "kb";
  const date = q.get("week") ?? kstToday();
  if (!isDorm(dorm)) return Response.json({ error: "dorm은 kb, sunglim, surim 중 하나입니다" }, { status: 400 });
  if (!isYmd(date)) return Response.json({ error: "week는 YYYY-MM-DD 형식입니다" }, { status: 400 });

  const monday = mondayOf(date);
  const range = rangeOf(monday);
  if (range === "far") return Response.json({ error: "다음 주보다 먼 주는 아직 올라오지 않습니다" }, { status: 404 });

  try {
    const week = await fetchWeek(dorm, monday);
    return Response.json(week, { headers: { "Cache-Control": cacheControl(week, range) } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
