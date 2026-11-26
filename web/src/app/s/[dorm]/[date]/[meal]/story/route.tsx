import { StoryCard, loadMoa, ogImage } from "@/lib/og";
import { loadMealView } from "@/lib/share-meal";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ dorm: string; date: string; meal: string }> }) {
  const { dorm, date, meal } = await ctx.params;
  const view = await loadMealView(dorm, date, meal);
  if (!view) return new Response("not found", { status: 404 });
  return ogImage(<StoryCard view={view} moa={await loadMoa()} />, 1080, 1920);
}
