"use client";

import { useEffect } from "react";
import { BOT_UA, CARRY_PARAMS } from "@/lib/bots";

/** proxy.ts 가 넘기지 못한 사람(Sec-Fetch 헤더가 없는 옛 브라우저)을 앱으로 보낸다. 크롤러는 이 페이지의 메타와 본문을 보게 둔다. */
export function GoApp({ href }: { href: string }) {
  useEffect(() => {
    if (BOT_UA.test(navigator.userAgent)) return;
    const here = new URL(location.href);
    const next = new URL(href, location.origin);
    for (const k of CARRY_PARAMS) {
      const v = here.searchParams.get(k);
      if (v && !next.searchParams.has(k)) next.searchParams.set(k, v);
    }
    location.replace(next.href);
  }, [href]);
  return null;
}
