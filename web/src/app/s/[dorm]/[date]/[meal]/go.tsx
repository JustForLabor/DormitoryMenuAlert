"use client";

import { useEffect } from "react";

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|kakaotalk|kakao|Twitterbot|Slackbot|Discordbot|WhatsApp|Telegram|Googlebot|bingbot|Yeti|Daum|preview/i;

/** 사람은 앱으로 보내고, 크롤러는 이 페이지의 메타와 본문을 보게 둔다. utm·ui 는 유지한다. */
export function GoApp({ href }: { href: string }) {
  useEffect(() => {
    if (BOT.test(navigator.userAgent)) return;
    const here = new URL(location.href);
    const next = new URL(href, location.origin);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "ui"]) {
      const v = here.searchParams.get(k);
      if (v && !next.searchParams.has(k)) next.searchParams.set(k, v);
    }
    location.replace(next.href);
  }, [href]);
  return null;
}
