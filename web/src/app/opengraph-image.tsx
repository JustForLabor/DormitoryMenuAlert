import { HomeCard, loadMoa, ogImage } from "@/lib/og";

export const alt = "SsalTech · 서울과기대 생활관 식단";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image() {
  return ogImage(<HomeCard moa={await loadMoa()} />, 1200, 630);
}
