import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMealView } from "@/lib/share-meal";
import { GoApp } from "./go";

type Props = {
  params: Promise<{ dorm: string; date: string; meal: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dorm, date, meal } = await params;
  const view = await loadMealView(dorm, date, meal);
  if (!view) return { title: { absolute: "식단을 찾을 수 없어요 · SsalTech" } };
  const path = `/s/${view.dorm}/${view.date}/${view.meal}`;
  const description = view.body.slice(0, 160);
  return {
    title: { absolute: view.title },
    description,
    alternates: { canonical: path },
    openGraph: { title: view.title, description, url: path, type: "article", locale: "ko_KR", siteName: "SsalTech" },
    twitter: { card: "summary_large_image", title: view.title, description },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const { dorm, date, meal } = await params;
  const view = await loadMealView(dorm, date, meal);
  if (!view) notFound();
  const sp = await searchParams;
  const q = new URLSearchParams({ dorm: view.dorm, date: view.date, meal: view.meal });
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "ui"]) {
    const v = sp[k];
    if (typeof v === "string") q.set(k, v);
  }
  const href = `/?${q}`;
  return (
    <article style={{ maxWidth: 640, margin: "0 auto", padding: "36px 20px 64px", fontFamily: '"Pretendard Variable", Pretendard, sans-serif', color: "#17191E" }}>
      <p style={{ margin: 0, color: "#FF6A45", fontWeight: 800 }}>SsalTech</p>
      <h1 style={{ margin: "8px 0 0", fontSize: 28, letterSpacing: "-0.03em" }}>{view.title}</h1>
      <p style={{ marginTop: 12, lineHeight: 1.55, color: "#555C68" }}>{view.body}</p>
      {view.items.length > 0 && (
        <ul style={{ marginTop: 18, paddingLeft: 18, lineHeight: 1.7 }}>
          {view.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <p style={{ marginTop: 24 }}>
        <a href={href} style={{ color: "#FF6A45", fontWeight: 800 }}>SsalTech에서 보기</a>
      </p>
      <GoApp href={href} />
    </article>
  );
}
