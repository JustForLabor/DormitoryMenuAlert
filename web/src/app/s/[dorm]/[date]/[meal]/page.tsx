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
    // 사람은 GoApp 이 바로 앱으로 보내므로 본문은 크롤러·화면 낭독기만 읽게 숨긴다.
    <article style={{ position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
      <p>SsalTech</p>
      <h1>{view.title}</h1>
      <p>{view.body}</p>
      {view.items.length > 0 && (
        <ul>
          {view.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <p>
        <a href={href}>SsalTech에서 보기</a>
      </p>
      <GoApp href={href} />
    </article>
  );
}
