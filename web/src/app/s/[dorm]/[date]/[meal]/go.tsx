"use client";

import { useEffect } from "react";

// 카카오톡·다음 앱 안 브라우저(UA 에 KAKAOTALK, DaumApps)는 사람이므로 스크래퍼 이름(kakaotalk-scrap, Daumoa)만 거른다.
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|kakaotalk-scrap|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|Googlebot|bingbot|Yeti|Daumoa|preview/i;

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
