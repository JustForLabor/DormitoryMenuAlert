"use client";

// 메뉴 공유. 카카오·페이스북·X·인스타그램(DM·스토리)·복사·더보기. Android 앱은 네이티브 공유 시트·인스타그램으로 바로 보낸다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MEAL_NAME, dormOf, mainDish, shortDate, type Dorm, type Meal, type Ymd } from "@/lib/menu";
import { track } from "@/lib/track";

export interface ShareMeal {
  dorm: Dorm;
  date: Ymd;
  meal: Meal;
  dish: string;
  text: string;
  dormName: string;
  mealName: string;
  dateLabel: string;
}

export function toShareMeal(dorm: Dorm, date: Ymd, meal: Meal, text: string): ShareMeal {
  return { dorm, date, meal, text, dish: mainDish(text), dormName: dormOf(dorm).name, mealName: MEAL_NAME[meal], dateLabel: shortDate(date) };
}

export function shareTitle(meal: ShareMeal): string {
  const head = `${meal.dateLabel} ${meal.mealName} · ${meal.dormName}`;
  return meal.dish ? `${head} - ${meal.dish}` : head;
}

export function shareUrl(meal: ShareMeal, net: string): string {
  const u = new URL(`https://dorm.ybkim.pe.kr/s/${meal.dorm}/${meal.date}/${meal.meal}`);
  u.searchParams.set("utm_source", net);
  u.searchParams.set("utm_medium", "share");
  return u.href;
}

const mealKey = (meal: ShareMeal) => `${meal.dorm}/${meal.date}/${meal.meal}`;
const KAKAO_SDK = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
const KAKAO_SRI = "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka";

interface KakaoNs {
  isInitialized(): boolean;
  init(key: string): void;
  Share: { sendDefault(opts: Record<string, unknown>): void };
}

declare global {
  interface Window {
    Kakao?: KakaoNs;
  }
}

let kakaoPromise: Promise<KakaoNs> | null = null;

function loadKakao(): Promise<KakaoNs> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) return Promise.reject(new Error("no-key"));
  if (window.Kakao?.isInitialized()) return Promise.resolve(window.Kakao);
  if (!kakaoPromise) {
    const { promise, resolve, reject } = Promise.withResolvers<KakaoNs>();
    kakaoPromise = promise;
    const s = document.createElement("script");
    s.src = KAKAO_SDK;
    s.integrity = KAKAO_SRI;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => {
      const kakao = window.Kakao;
      if (!kakao) {
        kakaoPromise = null;
        reject(new Error("sdk"));
        return;
      }
      if (!kakao.isInitialized()) kakao.init(key);
      resolve(kakao);
    };
    s.onerror = () => {
      kakaoPromise = null;
      reject(new Error("sdk"));
    };
    document.head.appendChild(s);
  }
  return kakaoPromise;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function nativeShare(title: string, text: string, url: string): boolean {
  const share = window.SsalTechNative?.share;
  if (typeof share !== "function") return false;
  share(title, text, url);
  return true;
}

async function fallbackShare(meal: ShareMeal, toast: (m: string) => void): Promise<boolean> {
  const url = shareUrl(meal, "native");
  const title = shareTitle(meal);
  if (nativeShare(title, meal.text, url)) {
    track("share", { net: "native", target: mealKey(meal) });
    return true;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text: meal.text, url });
      track("share", { net: "native", target: mealKey(meal) });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return true;
    }
  }
  if (await copyText(url)) {
    toast("링크를 복사했어요.");
    track("share", { net: "copy", target: mealKey(meal) });
    return true;
  }
  return false;
}

async function shareKakao(meal: ShareMeal, toast: (m: string) => void) {
  const url = shareUrl(meal, "kakao");
  const title = shareTitle(meal);
  try {
    const kakao = await loadKakao();
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title,
        description: meal.text || "서울과기대 생활관 식단",
        // ?v= 는 opengraph-image.tsx 의 판 번호. 카카오톡은 같은 주소의 이미지를 오래 캐시한다.
        imageUrl: `https://dorm.ybkim.pe.kr/s/${meal.dorm}/${meal.date}/${meal.meal}/opengraph-image?v=2`,
        // 크기를 안 주면 카카오톡이 정사각형으로 잘라 가운데만 보인다.
        imageWidth: 1200,
        imageHeight: 630,
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [{ title: "식단 보기", link: { mobileWebUrl: url, webUrl: url } }],
    });
    track("share", { net: "kakao", target: mealKey(meal) });
  } catch {
    if (!(await fallbackShare(meal, toast))) toast("카카오톡 공유를 열지 못했어요. 링크를 복사해 주세요.");
  }
}

const INSTAGRAM = "com.instagram.android";

/** 휴대폰(Android·iPhone·iPad)인지. iPadOS 사파리는 Mac 으로 나서 터치 수로 가른다. */
function mobileOS(): boolean {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** 인스타그램 DM: 링크를 보내면 받는 쪽에 미리보기 카드(opengraph-image)가 뜬다. */
async function shareInstagramDm(meal: ShareMeal, toast: (m: string) => void) {
  const url = shareUrl(meal, "instagram_dm");
  const title = shareTitle(meal);
  const key = mealKey(meal);
  const app = window.SsalTechNative;
  if (typeof app?.shareTo === "function") {
    if (app.shareTo(INSTAGRAM, title, title, url)) {
      track("share", { net: "instagram_dm", target: key });
      return;
    }
    toast("인스타그램 앱이 없어요. 다른 앱으로 보내 주세요.");
    nativeShare(title, title, url);
    return;
  }
  // 옛 Android 앱: 공유 시트에서 Instagram(채팅)을 고르게 한다.
  if (nativeShare(title, title, url)) {
    track("share", { net: "instagram_dm", target: key });
    return;
  }
  // 휴대폰 브라우저: 웹에서는 인스타그램 DM 을 바로 열 수 없어 공유 시트로 넘긴다. 사진 없이 링크만 보내야 DM 에 링크가 남는다.
  if (mobileOS() && navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      track("share", { net: "instagram_dm", target: key });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  // 데스크톱: 웹에서 DM 에 글을 미리 채울 수는 없어, 받는 사람을 고르는 새 메시지 창을 열고 링크는 복사해 둔다.
  const copied = await copyText(url);
  window.open("https://www.instagram.com/direct/new/", "_blank", "noopener,noreferrer");
  toast(copied ? "링크를 복사했어요. 받을 사람을 고르고 붙여 넣어 주세요." : "받을 사람을 고르고 링크를 붙여 넣어 주세요.");
  track("share", { net: "instagram_dm", target: key });
}

/** 인스타그램 스토리: 세로 이미지(/story)를 넘긴다. 앱이 이미지를 받아 스토리·피드·DM 중에 고르게 한다. */
async function shareInstagramStory(meal: ShareMeal, toast: (m: string) => void) {
  const url = shareUrl(meal, "instagram_story");
  const title = shareTitle(meal);
  const key = mealKey(meal);
  const story = `/s/${meal.dorm}/${meal.date}/${meal.meal}/story`;
  const app = window.SsalTechNative;
  if (typeof app?.shareImageTo === "function") {
    if (app.shareImageTo(INSTAGRAM, story)) {
      void copyText(url).then((ok) => ok && toast("링크도 복사했어요. 스토리 링크 스티커에 붙여 넣어 주세요."));
      track("share", { net: "instagram_story", target: key });
      return;
    }
    toast("인스타그램 앱이 없어요.");
    return;
  }
  // 이미지를 넘기는 기능이 없는 옛 Android 앱: WebView 에서는 내려받기도 안 되니 링크를 공유 시트로 보낸다.
  if (nativeShare(title, meal.text, url)) {
    track("share", { net: "native", target: key });
    return;
  }
  if (mobileOS() && navigator.canShare) {
    try {
      const res = await fetch(story);
      const file = new File([await res.blob()], "ssaltech-story.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        void copyText(url);
        track("share", { net: "instagram_story", target: key });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = story;
  a.download = "ssaltech-story.png";
  a.click();
  if (await copyText(url)) toast("스토리 이미지를 저장했어요. 인스타그램에 올리고 링크를 붙여 주세요.");
  else toast("링크를 복사하지 못했어요. 스토리 이미지는 저장했어요.");
  track("share", { net: "instagram_story", target: key });
}

function facebookHref(url: string) {
  return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`;
}

function xHref(title: string, url: string) {
  return `https://x.com/intent/post?${new URLSearchParams({ text: title, url })}`;
}

// 공유 대상마다 브랜드 색 원형 아이콘. 휴대폰 공유 시트처럼 보이게 한다.
type Net = "kakao" | "facebook" | "x" | "instagram" | "dm" | "copy" | "more" | "back";
const GLYPH: Record<Net, ReactNode> = {
  kakao: <path fill="#191919" d="M12 4.5c-4.7 0-8.5 3-8.5 6.6 0 2.3 1.5 4.4 3.9 5.5l-.8 3c-.1.3.2.5.4.3l3.5-2.3c.5.1 1 .1 1.5.1 4.7 0 8.5-3 8.5-6.6S16.7 4.5 12 4.5Z" />,
  facebook: <path fill="#fff" d="M13.4 20v-6.8h2.3l.4-2.7h-2.7V8.8c0-.8.3-1.3 1.4-1.3h1.4V5.1c-.3 0-1.1-.1-2.1-.1-2.1 0-3.5 1.3-3.5 3.6v2h-2.3v2.7h2.3V20h2.8Z" />,
  x: <path fill="#fff" d="M16.2 5h2.4l-5.2 6 6.1 8h-4.8l-3.8-4.9L6.6 19H4.2l5.6-6.4L4 5h4.9l3.4 4.5L16.2 5Zm-.8 12.6h1.3L8.6 6.3H7.2l8.2 11.3Z" />,
  instagram: (
    <g fill="none" stroke="#fff" strokeWidth="1.8">
      <rect x="5" y="5" width="14" height="14" rx="4.2" />
      <circle cx="12" cy="12" r="3.3" />
      <circle cx="16.3" cy="7.7" r=".6" fill="#fff" stroke="none" />
    </g>
  ),
  dm: (
    <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M20 4.5 3.8 9.9l6.6 3 3 6.7L20 4.5Z" />
      <path d="m10.4 12.9 4.4-4.3" strokeLinecap="round" />
    </g>
  ),
  copy: (
    <g fill="none" stroke="#17191E" strokeWidth="1.9" strokeLinecap="round">
      <path d="M10.2 13.8a3.4 3.4 0 0 0 4.8 0l2.7-2.7a3.4 3.4 0 0 0-4.8-4.8l-.9.9" />
      <path d="M13.8 10.2a3.4 3.4 0 0 0-4.8 0l-2.7 2.7a3.4 3.4 0 0 0 4.8 4.8l.9-.9" />
    </g>
  ),
  more: (
    <g fill="#17191E">
      <circle cx="6.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="17.5" cy="12" r="1.7" />
    </g>
  ),
  back: <path fill="none" stroke="#17191E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M14.5 6.5 9 12l5.5 5.5" />,
};

function ShareIco({ net }: { net: Net }) {
  return (
    <span className={`sico sico-${net}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">{GLYPH[net]}</svg>
    </span>
  );
}

export function SharePanel({
  meal,
  toast,
  onDone,
  variant = "mobile",
}: {
  meal: ShareMeal;
  toast: (m: string) => void;
  onDone?: () => void;
  variant?: "mobile" | "desktop";
}) {
  const cls = variant === "mobile" ? "si press" : "si";
  const [ig, setIg] = useState(false);
  const done = () => onDone?.();
  const title = shareTitle(meal);
  const fb = shareUrl(meal, "facebook");
  const x = shareUrl(meal, "x");
  const body = (net: Net, label: string) => (
    <>
      <ShareIco net={net} />
      <span className="sl">{label}</span>
    </>
  );
  const list = variant === "mobile" ? "share-list" : "share-list desk";
  // 인스타그램은 DM(링크)과 스토리(세로 이미지)가 따로라 한 번 더 고르게 한다.
  if (ig) {
    return (
      <div className={list}>
        <button type="button" className={cls} onClick={() => { void shareInstagramDm(meal, toast).then(done); }}>{body("dm", "DM 보내기")}</button>
        <button type="button" className={cls} onClick={() => { void shareInstagramStory(meal, toast).then(done); }}>{body("instagram", "스토리")}</button>
        <button type="button" className={cls} onClick={() => setIg(false)}>{body("back", "뒤로")}</button>
      </div>
    );
  }
  return (
    <div className={list}>
      <button type="button" className={cls} onClick={() => { void shareKakao(meal, toast).then(done); }}>{body("kakao", "카카오톡")}</button>
      <a className={cls} href={facebookHref(fb)} target="_blank" rel="noopener noreferrer" onClick={() => { track("share", { net: "facebook", target: mealKey(meal) }); done(); }}>{body("facebook", "페이스북")}</a>
      <a className={cls} href={xHref(title, x)} target="_blank" rel="noopener noreferrer" onClick={() => { track("share", { net: "x", target: mealKey(meal) }); done(); }}>{body("x", "X")}</a>
      <button type="button" className={cls} onClick={() => setIg(true)}>{body("instagram", "인스타그램")}</button>
      <button type="button" className={cls} onClick={() => {
        void copyText(shareUrl(meal, "copy")).then((ok) => {
          toast(ok ? "링크를 복사했어요." : "링크를 복사하지 못했어요.");
          if (ok) track("share", { net: "copy", target: mealKey(meal) });
          done();
        });
      }}>{body("copy", "링크 복사")}</button>
      <button type="button" className={cls} onClick={() => { void fallbackShare(meal, toast).then((ok) => { if (!ok) toast("이 기기에서는 공유 시트를 열 수 없어요."); done(); }); }}>{body("more", "더보기")}</button>
    </div>
  );
}

export function ShareSheet({ meal, toast, onClose }: { meal: ShareMeal; toast: (m: string) => void; onClose: () => void }) {
  return (
    <>
      <h3>공유하기</h3>
      <p className="sd">{shareTitle(meal)}</p>
      <SharePanel meal={meal} toast={toast} onDone={onClose} />
    </>
  );
}

const SHARE_GLYPH = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13" />
  </svg>
);

export function ShareButton({ meal, toast, label = "공유", icon = false, small = true }: { meal: ShareMeal; toast: (m: string) => void; label?: string; icon?: boolean; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const below = r.bottom + 8 + 300 < window.innerHeight;
      setBox({ top: below ? r.bottom + 8 : Math.max(12, r.top - 308), left: Math.max(12, Math.min(icon ? r.right - 228 : r.left, window.innerWidth - 240)) });
    }
    setOpen((v) => !v);
  };
  const host = typeof document === "undefined" ? null : document.querySelector(".wld");
  const menu: ReactNode = open && box && host ? createPortal(
    <>
      <div className="share-back" onClick={() => setOpen(false)} />
      <div className="share-menu" style={{ top: box.top, left: box.left }} role="menu">
        <SharePanel meal={meal} toast={toast} variant="desktop" onDone={() => setOpen(false)} />
      </div>
    </>,
    host,
  ) : null;
  return (
    <>
      {icon ? (
        <button type="button" ref={btn} className="sharebtn" onClick={toggle} aria-expanded={open} aria-label={label} title={label}>{SHARE_GLYPH}</button>
      ) : (
        <button type="button" ref={btn} className={`ghost sharetxt${small ? " sm" : ""}`} onClick={toggle} aria-expanded={open}>{SHARE_GLYPH}{label}</button>
      )}
      {menu}
    </>
  );
}
