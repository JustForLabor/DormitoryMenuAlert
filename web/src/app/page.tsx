import type { Metadata } from "next";
import { DORMS, MEAL_NAME, dormOf, kstToday, mainDish, menuItems, mondayOf, shortDate, weekday, type Dorm, type Ymd } from "@/lib/menu";
import { fetchWeek } from "@/lib/site";
import { ClientPage } from "@/ui/client-page";

export const revalidate = 600;
export const metadata: Metadata = { alternates: { canonical: "/" } };


async function todayMenu(dorm: Dorm, monday: Ymd, date: Ymd) {
  try {
    const week = await fetchWeek(dorm, monday, { revalidate: 600 });
    const day = week.days[(weekday(date) + 6) % 7];
    if (!day?.registered) return { dorm, note: "아직 식단이 올라오지 않았어요", meals: [] as { name: string; dish: string; items: string[] }[] };
    return {
      dorm,
      note: "",
      meals: (["breakfast", "lunch", "dinner"] as const).map((m) => ({
        name: MEAL_NAME[m],
        dish: mainDish(day.meals[m]),
        items: menuItems(day.meals[m]).slice(0, 6),
      })),
    };
  } catch {
    return { dorm, note: "식단을 불러오지 못했어요", meals: [] as { name: string; dish: string; items: string[] }[] };
  }
}

// 화면에 그리지 않는 숨김 스타일: 크롤러와 화면 낭독기는 읽고, 사람에게는 앱이 뜨기 전에도 보이지 않는다.
const HIDDEN = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

/** 크롤러용 본문. 화면에는 보이지 않고, 앱이 올라오면 치운다. */
export default async function Page() {
  const today = kstToday();
  const monday = mondayOf(today);
  const days = await Promise.all(DORMS.map((d) => todayMenu(d.id, monday, today)));
  return (
    <>
      <section id="ssr-home" aria-label="오늘의 식단" style={HIDDEN}>
        <h1>SsalTech</h1>
        <p>서울과학기술대학교 생활관(KB·성림·수림학사) 식단을 보고, 정한 시각에 알림을 받아요.</p>
        <p>{shortDate(today)} 식단</p>
        {days.map((day) => (
          <article key={day.dorm}>
            <h2>{dormOf(day.dorm).name}</h2>
            {day.note ? <p>{day.note}</p> : null}
            {day.meals.map((m) => (
              <p key={m.name}>
                <b>{m.name}</b> {m.dish || "운영하지 않아요"}
                {m.items.length > 0 ? <span> · {m.items.join(", ")}</span> : null}
              </p>
            ))}
          </article>
        ))}
        <p>
          <a href="/?tab=menu">식단표 보기</a>
        </p>
      </section>
      <ClientPage />
    </>
  );
}
