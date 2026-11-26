// 공유 랜딩·OG 이미지가 함께 쓰는 끼니 조회. 잘못된 주소만 거절하고, 식단이 없어도 제목은 만든다.
import { MEAL_NAME, dormOf, isDorm, isMeal, isYmd, mainDish, menuItems, mondayOf, shortDate, weekday, type Dorm, type Meal, type Ymd } from "./menu";
import { fetchWeek } from "./site";

export interface MealView {
  dorm: Dorm;
  date: Ymd;
  meal: Meal;
  title: string;
  body: string;
  dish: string;
  items: string[];
  registered: boolean;
  failed: boolean;
  dormName: string;
  mealName: string;
  dateLabel: string;
}

export async function loadMealView(dorm: string, date: string, meal: string): Promise<MealView | null> {
  if (!isDorm(dorm) || !isYmd(date) || !isMeal(meal)) return null;
  let text = "";
  let registered = false;
  let failed = false;
  try {
    const week = await fetchWeek(dorm, mondayOf(date), { revalidate: 600 });
    const day = week.days[(weekday(date) + 6) % 7];
    registered = !!day?.registered;
    text = registered ? day.meals[meal] : "";
  } catch {
    failed = true;
  }
  const dish = mainDish(text);
  const items = menuItems(text).filter((s) => !s.startsWith("선택식")).slice(0, 8);
  const dateLabel = shortDate(date);
  const mealName = MEAL_NAME[meal];
  const dormName = dormOf(dorm).name;
  const head = `${dateLabel} ${mealName} · ${dormName}`;
  return {
    dorm,
    date,
    meal,
    title: dish ? `${head} - ${dish}` : head,
    body: failed ? "식단을 불러오지 못했어요. SsalTech에서 다시 확인해 주세요." : !registered ? "아직 식단이 올라오지 않았어요." : text || "이 끼니는 운영하지 않아요.",
    dish,
    items,
    registered,
    failed,
    dormName,
    mealName,
    dateLabel,
  };
}
