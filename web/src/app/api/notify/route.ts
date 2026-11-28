import { MEALS, MEAL_NAME, addDays, dormOf, hoursOf, isDorm, isMeal, isYmd, kstToday, menuItems, mondayOf, shortDate, weekday, type Meal } from "@/lib/menu";
import { fetchWeek, rangeOf } from "@/lib/site";

const FAV_MAX = 50;
const norm = (s: string) => s.replace(/\s+/g, "");

/**
 * GET /api/notify?dorm=kb&date=2026-11-27&meal=breakfast → { title, body }
 * GET /api/notify?dorm=kb&date=2026-11-27&fav=제육볶음&fav=떡갈비 → 그날 세 끼에 즐겨찾기 메뉴가 있으면
 *   { title, body, meal }, 없으면 { skip: true }.
 * GET /api/notify?dorm=kb&date=2026-11-27&meal=lunch&before=30 → 입장 마감 30분 전 알림. 그날 그 밥이 없으면 skip: true 도 붙인다.
 * Android 앱과 웹 푸시 서버가 알림 시각에 불러 그대로 띄운다(알림 내용을 예약 시점이 아니라 울리는 시점에 정한다).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const dorm = q.get("dorm");
  const date = q.get("date");
  const meal = q.get("meal");
  const favs = q.getAll("fav").slice(0, FAV_MAX).map((f) => f.slice(0, 80)).filter((f) => norm(f));
  if (!isDorm(dorm) || !isYmd(date) || (!favs.length && !isMeal(meal))) {
    return Response.json({ error: "dorm, date(YYYY-MM-DD)와 meal(breakfast|lunch|dinner) 또는 fav가 필요합니다" }, { status: 400 });
  }
  const b = Number(q.get("before"));
  const before = !favs.length && Number.isInteger(b) && b >= 1 && b <= 180 ? b : 0;
  const title = favs.length
    ? "즐겨찾기 메뉴"
    : before
      ? `${MEAL_NAME[meal as Meal]} 입장 마감 ${before}분 전 (${hoursOf(date, meal as Meal).slice(6)}까지)`
      : `${shortDate(date)} ${MEAL_NAME[meal as Meal]} · ${dormOf(dorm).label}`;
  const monday = mondayOf(date);
  if (rangeOf(monday) === "far") {
    return Response.json(favs.length ? { skip: true } : { title, body: "아직 식단이 올라오지 않았어요", registered: false });
  }

  try {
    const day = (await fetchWeek(dorm, monday)).days[(weekday(date) + 6) % 7];
    const headers = { "Cache-Control": "public, max-age=60, s-maxage=600" };
    if (favs.length) {
      if (!day.registered) return Response.json({ skip: true }, { headers });
      const want = new Set(favs.map(norm));
      const found = MEALS.map((m) => ({ meal: m, dishes: menuItems(day.meals[m]).filter((d) => want.has(norm(d))) })).filter((x) => x.dishes.length);
      if (!found.length) return Response.json({ skip: true }, { headers });
      const today = kstToday();
      const when = date === today ? "오늘" : date === addDays(today, 1) ? "내일" : shortDate(date);
      const first = found[0];
      return Response.json(
        {
          title: `♥ ${when} ${MEAL_NAME[first.meal]}에 ${first.dishes[0]} 나와요`,
          body: `${dormOf(dorm).label} ${shortDate(date)} · ${found.map((x) => `${MEAL_NAME[x.meal]} ${x.dishes.join(", ")}`).join(" · ")}`,
          meal: first.meal,
        },
        { headers },
      );
    }
    const menu = day.meals[meal as Meal];
    if (before) {
      const body = `${dormOf(dorm).label} · ${!day.registered ? "식단이 아직 안 올라왔어요" : menu || "이때는 밥이 안 나와요"}`;
      // 식단이 올라왔는데 그 밥이 없으면 마감 알림은 보낼 까닭이 없다. 옛 앱은 skip 을 모르고 그대로 띄운다.
      return Response.json({ title, body, registered: day.registered, ...(day.registered && !menu ? { skip: true } : {}) }, { headers });
    }
    const body = !day.registered ? "아직 식단이 올라오지 않았어요 (미등록)" : menu || "이때는 밥이 안 나와요";
    return Response.json({ title, body, registered: day.registered }, { headers });
  } catch {
    return Response.json(
      favs.length ? { skip: true, error: "fetch" } : { title, body: "식단을 가져오지 못했어요. 눌러서 확인해 주세요", registered: false },
      { status: 502 },
    );
  }
}
