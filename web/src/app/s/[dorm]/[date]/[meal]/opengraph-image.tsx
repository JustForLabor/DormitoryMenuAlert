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
