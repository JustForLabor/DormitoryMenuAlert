// og:image 주소 뒤 ?해시는 이 파일 내용으로 정해진다. 카드 모양(lib/og.tsx)을 바꾸면 이 줄의 판 번호를 올린다. 판 2: 흰 카드에 짙은 글씨.
import { HomeCard, loadMoa, ogImage } from "@/lib/og";

export const alt = "SsalTech · 서울과기대 생활관 식단";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image() {
  return ogImage(<HomeCard moa={await loadMoa()} />, 1200, 630);
}
