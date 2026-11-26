// 식단 데이터 모델, 날짜 계산, 식단표 HTML 파싱. 서버(라우트)와 브라우저가 함께 쓴다.
// 규칙은 C 버전(Source/parse.c, date.c, notify.c)과 같다.

export const SITE_URL = "https://housing.seoultech.ac.kr/livng/dining";

export const DORMS = [
  { id: "kb", name: "KB학사", label: "KB학사 식당", sub: "불암·KB·창명" },
  { id: "sunglim", name: "성림학사", label: "성림학사 식당", sub: "성림·누리" },
  { id: "surim", name: "수림학사", label: "수림학사 식당", sub: "수림" },
] as const;

export type Dorm = (typeof DORMS)[number]["id"];
export const isDorm = (s: unknown): s is Dorm => DORMS.some((d) => d.id === s);
export const dormOf = (id: Dorm) => DORMS.find((d) => d.id === id) ?? DORMS[0];

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];
export const isMeal = (s: unknown): s is Meal => MEALS.includes(s as Meal);
export const MEAL_NAME: Record<Meal, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };

/** YYYY-MM-DD (한국 시간 기준 날짜) */
export type Ymd = string;

export interface DayMenu {
  date: Ymd;
  /** false면 사이트에 "미등록"으로 나온 날 */
  registered: boolean;
  /** 아침·점심·저녁 원문 한 줄. 없으면 "" */
  meals: Record<Meal, string>;
}

export interface WeekMenu {
  dorm: Dorm;
  monday: Ymd;
  days: DayMenu[];
  fetchedAt: string;
}

// ---------- 날짜 (모두 UTC 자정으로 계산해 시간대에 흔들리지 않게 한다) ----------

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const isYmd = (s: unknown): s is Ymd => typeof s === "string" && YMD.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const toMs = (d: Ymd) => Date.parse(d + "T00:00:00Z");
const fromMs = (ms: number): Ymd => new Date(ms).toISOString().slice(0, 10);

export const kstToday = (now = Date.now()): Ymd => fromMs(now + KST_MS);
export const kstMinute = (now = Date.now()) => {
  const d = new Date(now + KST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const addDays = (d: Ymd, n: number): Ymd => fromMs(toMs(d) + n * DAY_MS);
/** 0 = 일요일 */
export const weekday = (d: Ymd) => new Date(toMs(d)).getUTCDay();
export const mondayOf = (d: Ymd): Ymd => addDays(d, -((weekday(d) + 6) % 7));
export const isWeekend = (d: Ymd) => weekday(d) === 0 || weekday(d) === 6;
export const WD = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const dayNum = (d: Ymd) => Number(d.slice(8, 10));
export const monthNum = (d: Ymd) => Number(d.slice(5, 7));
/** 11/26(목) */
export const shortDate = (d: Ymd) => `${monthNum(d)}/${dayNum(d)}(${WD[weekday(d)]})`;

// ---------- 식당 이용시간 (사이트의 식당이용시간 표, 학기 기준) ----------

/** 퇴장 시각(분). 이 시각이 지나면 다음 끼니로 넘어간다. */
const END_WEEKDAY: Record<Meal, number> = { breakfast: 9 * 60, lunch: 14 * 60, dinner: 18 * 60 + 50 };
const END_WEEKEND: Record<Meal, number> = { breakfast: 9 * 60, lunch: 13 * 60 + 30, dinner: 18 * 60 + 30 };

/** 입장 시간 */
export const HOURS: Record<"weekday" | "weekend", Record<Meal, string>> = {
  weekday: { breakfast: "07:30~08:50", lunch: "11:30~13:30", dinner: "17:30~18:40" },
  weekend: { breakfast: "08:00~08:50", lunch: "12:30~13:20", dinner: "17:30~18:20" },
};
export const hoursOf = (d: Ymd, m: Meal) => HOURS[isWeekend(d) ? "weekend" : "weekday"][m];

/** 아직 끝나지 않은 가장 가까운 끼니 */
export function nextMeal(now = Date.now()): { date: Ymd; meal: Meal } {
  const today = kstToday(now);
  const minute = kstMinute(now);
  const end = isWeekend(today) ? END_WEEKEND : END_WEEKDAY;
  for (const m of MEALS) if (minute < end[m]) return { date: today, meal: m };
  return { date: addDays(today, 1), meal: "breakfast" };
}

// ---------- 메뉴 문자열 다루기 ----------

/** "콩나물국, 간장돈불고기, …, 선택식 - 빵/요플레" → 항목 배열 */
export function menuItems(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const SIDE = /(잡곡밥|쌀밥|흑미밥|백미밥|추가밥|국|장국|탕|스프|수프)$/;

/** 대표 메뉴: 밥·국을 건너뛴 첫 항목 */
export function mainDish(text: string): string {
  const items = menuItems(text).filter((s) => !s.startsWith("선택식"));
  return items.find((s) => !SIDE.test(s)) ?? items[0] ?? "";
}

// ---------- 식단표 파싱 (<table class="chang">) ----------
//   <th>23일</th><th>월</th>
//   <td> <font>아침 :</font> 메뉴, … <br> <font>점심 :</font> … </td>
// 올라오지 않은 날은 <td> 안에 "미등록"만 있다.

const MARK: Record<Meal, string> = { breakfast: "아침 :", lunch: "점심 :", dinner: "저녁 :" };
const ENT: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">" };

/** <br>, <font>만 지우고 엔티티를 풀어 공백을 하나로 모은다. "<선택>" 같은 글자는 메뉴라 남긴다. */
function cleanText(s: string): string {
  return s
    .replace(/<\/?(br|font)(\s[^>]*)?\/?>/gi, " ")
    .replace(/&(nbsp|amp|lt|gt);/g, (e) => ENT[e])
    .replace(/\s+/g, " ")
    .replace(/[\s,]+$/, "")
    .trim();
}

function parseCell(cell: string): Pick<DayMenu, "registered" | "meals"> {
  const meals = { breakfast: "", lunch: "", dinner: "" } as Record<Meal, string>;
  for (const m of MEALS) {
    const at = cell.indexOf(MARK[m]);
    if (at < 0) continue;
    const start = at + MARK[m].length;
    const next = cell.indexOf("<font>", start);
    meals[m] = cleanText(cell.slice(start, next < 0 ? undefined : next));
  }
  return { registered: !cell.includes("미등록"), meals };
}

export class ParseError extends Error {}

/** 사이트는 요청한 날짜부터 7일을 돌려준다. 칸의 일(日)이 기대한 날짜와 다르면 오류로 본다. */
export function parseWeek(html: string, monday: Ymd): DayMenu[] {
  const start = html.indexOf('class="chang"');
  const end = start < 0 ? -1 : html.indexOf("</table>", start);
  if (start < 0 || end < 0) throw new ParseError("식단표(table.chang)를 찾지 못했습니다");
  const table = html.slice(start, end);
  const row = /<th[^>]*>\s*(\d+)\s*일\s*<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g;
  const days: DayMenu[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const m = row.exec(table);
    if (!m) throw new ParseError(`식단표 ${i + 1}번째 줄을 읽지 못했습니다`);
    if (Number(m[1]) !== dayNum(date)) throw new ParseError(`${i + 1}번째 날짜가 ${dayNum(date)}일이어야 하는데 ${m[1]}일입니다`);
    days.push({ date, ...parseCell(m[2]) });
  }
  return days;
}

export const allRegistered = (w: Pick<WeekMenu, "days">) => w.days.every((d) => d.registered);
