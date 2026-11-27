import { MEAL_NAME, dormOf, isDorm, isMeal, isYmd, mondayOf, shortDate, weekday } from "@/lib/menu";
import { fetchWeek, rangeOf } from "@/lib/site";

/**
 * GET /api/notify?dorm=kb&date=2026-11-27&meal=breakfast → { title, body }
 * Android 앱이 알림 시각에 불러 그대로 띄운다(알림 내용을 예약 시점이 아니라 울리는 시점에 정한다).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const dorm = q.get("dorm");
  const date = q.get("date");
  const meal = q.get("meal");
  if (!isDorm(dorm) || !isYmd(date) || !isMeal(meal)) {
    return Response.json({ error: "dorm, date(YYYY-MM-DD), meal(breakfast|lunch|dinner)이 필요합니다" }, { status: 400 });
  }

  const title = `${shortDate(date)} ${MEAL_NAME[meal]} · ${dormOf(dorm).label}`;
  const monday = mondayOf(date);
  if (rangeOf(monday) === "far") return Response.json({ title, body: "아직 식단이 올라오지 않았어요", registered: false });

  try {
    const day = (await fetchWeek(dorm, monday)).days[(weekday(date) + 6) % 7];
    const body = !day.registered ? "아직 식단이 올라오지 않았어요 (미등록)" : day.meals[meal] || "이때는 밥이 안 나와요";
    return Response.json(
      { title, body, registered: day.registered },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } },
    );
  } catch {
    return Response.json({ title, body: "식단을 가져오지 못했어요. 눌러서 확인해 주세요", registered: false }, { status: 502 });
  }
}
