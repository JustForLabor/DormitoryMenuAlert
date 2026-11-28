// OG·스토리 이미지. 한글은 묶어 둔 Pretendard Bold 부분집합으로 그린다.
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import type { MealView } from "./share-meal";

const FONT_PATH = join(process.cwd(), "src/app/fonts/Pretendard-Bold.subset.ttf");
const MOA_PATH = join(process.cwd(), "src/app/fonts/moa.png");

let fontPromise: Promise<ArrayBuffer> | null = null;
let moaPromise: Promise<string> | null = null;

export function ogFont(): Promise<ArrayBuffer> {
  fontPromise ??= readFile(FONT_PATH).then((buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  return fontPromise;
}

export function loadMoa(): Promise<string> {
  moaPromise ??= readFile(MOA_PATH).then((buf) => `data:image/png;base64,${buf.toString("base64")}`);
  return moaPromise;
}

export async function ogImage(node: ReactElement, width: number, height: number) {
  const data = await ogFont();
  return new ImageResponse(node, {
    width,
    height,
    fonts: [{ name: "Pretendard", data, weight: 700, style: "normal" }],
  });
}

function clip(s: string, n: number) {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** 주황 바탕. 밝은 모서리 없이 고르게 짙어 흰 글씨도 읽힌다. 본문은 흰 카드에 짙은 글씨로 쓴다. */
const BG = "linear-gradient(135deg, #FF9A62 0%, #FF6A45 55%, #F2545B 100%)";
const CARD = { display: "flex", flexDirection: "column", borderRadius: 40, background: "#fff", boxShadow: "0 24px 60px rgba(120,30,20,.28)" } as const;

export function HomeCard({ moa }: { moa: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: 1200, height: 630, padding: "0 72px", backgroundImage: BG, fontFamily: "Pretendard", color: "#17191E" }}>
      <div style={{ ...CARD, width: 700, padding: "52px 56px" }}>
        <div style={{ display: "flex", fontSize: 30, color: "#F0502E" }}>SsalTech</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 68, lineHeight: 1.15 }}>서울과기대</div>
        <div style={{ display: "flex", fontSize: 68, lineHeight: 1.15 }}>생활관 식단</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 30, color: "#4B4F58" }}>KB학사 · 성림학사 · 수림학사</div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 26, color: "#F0502E" }}>dorm.ybkim.pe.kr</div>
      </div>
      <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
        <img src={moa} width={300} height={300} alt="" />
      </div>
    </div>
  );
}

export function MealCard({ view, moa }: { view: MealView; moa: string }) {
  const dish = view.dish ? clip(view.dish, 16) : view.registered ? "운영하지 않아요" : "아직 식단이 없어요";
  const dishSize = dish.length <= 8 ? 68 : dish.length <= 11 ? 54 : 44;
  const items = view.items.slice(0, 6).map((s) => clip(s, 12));
  // 메뉴는 흰 카드에 짙은 글씨로 쓴다(주황 바탕에 흰 글씨는 잘 안 보인다). 정사각형으로 잘려도 읽히게 가운데 둔다.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        width: 1200,
        height: 630,
        backgroundImage: BG,
        fontFamily: "Pretendard",
        color: "#17191E",
      }}
    >
      <div style={{ display: "flex", marginBottom: 22, fontSize: 28, color: "#fff", textShadow: "0 2px 10px rgba(110,25,15,.45)" }}>SsalTech · 서울과기대 생활관 식단</div>
      <div style={{ ...CARD, width: 760, padding: "44px 52px 34px" }}>
        <div style={{ display: "flex", fontSize: 30 }}>
          <span style={{ color: "#F0502E" }}>
            {view.dateLabel} {view.mealName}
          </span>
          <span style={{ marginLeft: 12, color: "#6B7280" }}>{view.dormName}</span>
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: dishSize, lineHeight: 1.15 }}>{dish}</div>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 22 }}>
          {items.length > 0 ? (
            items.map((item) => (
              <div key={item} style={{ display: "flex", margin: "0 10px 10px 0", padding: "8px 18px", borderRadius: 999, background: "#FFF1EA", fontSize: 26, color: "#33363D" }}>
                {item}
              </div>
            ))
          ) : (
            <div style={{ display: "flex", marginBottom: 10, fontSize: 26, color: "#33363D" }}>{clip(view.body, 30)}</div>
          )}
        </div>
      </div>
      <img src={moa} width={170} height={170} alt="" style={{ position: "absolute", right: 36, bottom: 30 }} />
    </div>
  );
}

export function StoryCard({ view, moa }: { view: MealView; moa: string }) {
  const dish = view.dish ? clip(view.dish, 16) : view.registered ? "운영하지 않아요" : "아직 식단이 없어요";
  const items = view.items.slice(0, 8).map((s) => clip(s, 18));
  // 인스타그램 스토리(9:16). 위 마스코트·날짜, 가운데 메뉴 카드, 아래 주소. 화면 전체를 채운다.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: 1080,
        height: 1920,
        backgroundImage: "linear-gradient(165deg, #FFB37A 0%, #FF7A50 45%, #F2545B 100%)",
        fontFamily: "Pretendard",
        color: "#17191E",
        padding: "120px 80px 110px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={moa} width={150} height={150} alt="" />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 28 }}>
            <div style={{ display: "flex", fontSize: 44, color: "#fff" }}>SsalTech</div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 32, color: "#FFE8DF" }}>서울과기대 생활관 식단</div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 110, padding: "14px 30px", borderRadius: 999, background: "rgba(255,255,255,.22)", fontSize: 40, color: "#fff" }}>
          {view.dateLabel} {view.mealName} · {view.dormName}
        </div>
        <div style={{ display: "flex", marginTop: 34, fontSize: 112, lineHeight: 1.12, color: "#fff" }}>{dish}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 48, padding: "56px 60px", boxShadow: "0 30px 80px rgba(120,30,20,.25)" }}>
        <div style={{ display: "flex", fontSize: 32, color: "#FF6A45", marginBottom: 18 }}>메뉴</div>
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item} style={{ display: "flex", fontSize: 48, lineHeight: 1.6 }}>
              {item}
            </div>
          ))
        ) : (
          <div style={{ display: "flex", fontSize: 44 }}>{clip(view.body, 40)}</div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 36, color: "#fff" }}>dorm.ybkim.pe.kr</div>
    </div>
  );
}
