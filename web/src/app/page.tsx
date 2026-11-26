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

/** 크롤러와 첫 페인트용 본문. 앱이 올라오면 치운다. */
export default async function Page() {
  const today = kstToday();
  const monday = mondayOf(today);
  const days = await Promise.all(DORMS.map((d) => todayMenu(d.id, monday, today)));
  return (
    <>
      <section id="ssr-home" aria-label="오늘의 식단" style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 48px", fontFamily: '"Pretendard Variable", Pretendard, sans-serif', color: "#17191E", background: "#F3F4F7", minHeight: "100vh" }}>
        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.03em" }}>SsalTech</h1>
        <p style={{ marginTop: 8, lineHeight: 1.55, color: "#555C68" }}>서울과학기술대학교 생활관(KB·성림·수림학사) 식단을 보고, 정한 시각에 알림을 받아요.</p>
        <p style={{ marginTop: 16, fontWeight: 800 }}>{shortDate(today)} 식단</p>
        {days.map((day) => (
          <article key={day.dorm} style={{ marginTop: 16, padding: 16, borderRadius: 18, background: "#fff" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{dormOf(day.dorm).name}</h2>
            {day.note ? <p style={{ margin: "8px 0 0", color: "#555C68" }}>{day.note}</p> : null}
            {day.meals.map((m) => (
              <p key={m.name} style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
                <b>{m.name}</b> {m.dish || "운영하지 않아요"}
                {m.items.length > 0 ? <span style={{ color: "#555C68" }}> · {m.items.join(", ")}</span> : null}
              </p>
            ))}
          </article>
        ))}
        <p style={{ marginTop: 20 }}>
          <a href="/?tab=menu" style={{ color: "#FF6A45", fontWeight: 800 }}>식단표 보기</a>
        </p>
      </section>
      <ClientPage />
    </>
  );
}
