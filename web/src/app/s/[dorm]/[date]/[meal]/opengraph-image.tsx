// og:image 주소 뒤 ?해시는 이 파일 내용으로 정해진다. 카드 모양(lib/og.tsx)을 바꾸면 이 줄의 판 번호를 올려
// 주소를 바꿔야 카카오톡·인스타그램이 예전 이미지를 다시 쓰지 않는다. 판 2: 흰 카드에 짙은 글씨.
// share.tsx 카카오톡 공유의 imageUrl ?v= 도 같은 번호로 맞춘다.
import { MealCard, loadMoa, ogImage } from "@/lib/og";
import { loadMealView } from "@/lib/share-meal";

export const alt = "SsalTech 식단";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Image({ params }: { params: Promise<{ dorm: string; date: string; meal: string }> }) {
  const { dorm, date, meal } = await params;
  const view = await loadMealView(dorm, date, meal);
  if (!view) return new Response("not found", { status: 404 });
  return ogImage(<MealCard view={view} moa={await loadMoa()} />, 1200, 630);
}
