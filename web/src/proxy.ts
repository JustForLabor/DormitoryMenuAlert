import { NextResponse, type NextRequest } from "next/server";
import { BOT_UA, CARRY_PARAMS } from "@/lib/bots";
import { isDorm, isMeal, isYmd } from "@/lib/menu";

/**
 * 공유 링크(/s/학사/날짜/아침·점심·저녁)를 사람이 열면 서버에서 바로 앱 주소로 보낸다.
 * 공유 페이지 본문은 크롤러용이라 숨겨져 있어, 자바스크립트로 넘기면 앱 안 브라우저에서 스크립트가 뜰 때까지 빈 화면이다.
 * 사람은 브라우저가 붙이는 Sec-Fetch-Dest: document 로 가린다. 크롤러는 이 헤더를 보내지 않아 미리보기 메타를 그대로 읽는다.
 */
export function proxy(req: NextRequest) {
  if (req.headers.get("sec-fetch-dest") !== "document" || BOT_UA.test(req.headers.get("user-agent") ?? "")) return NextResponse.next();
  const [, , dorm, date, meal] = req.nextUrl.pathname.split("/");
  if (!isDorm(dorm) || !isYmd(date) || !isMeal(meal)) return NextResponse.next();
  const to = new URL("/", req.nextUrl);
  to.search = "";
  to.searchParams.set("dorm", dorm);
  to.searchParams.set("date", date);
  to.searchParams.set("meal", meal);
  for (const k of CARRY_PARAMS) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) to.searchParams.set(k, v);
  }
  return NextResponse.redirect(to, 307);
}

export const config = { matcher: "/s/:dorm/:date/:meal" };
