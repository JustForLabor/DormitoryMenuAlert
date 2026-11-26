"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

// 클라이언트 전용: 앱 상태가 localStorage(이 기기)와 주소(?tab, ?date)에서 시작한다.
const MobileApp = dynamic(() => import("@/ui/app").then((m) => m.MobileApp), { ssr: false });
const DesktopApp = dynamic(() => import("@/ui/desktop/DesktopApp").then((m) => m.DesktopApp), { ssr: false });

/** 넓은 화면은 데스크톱 화면. ?ui=mobile|desktop 으로 고를 수 있고, Android 앱 안(WebView)은 늘 모바일. */
const WIDE = "(min-width: 1024px)";
// 모바일 화면은 주소를 ?tab=... 으로 바꾸므로 처음 주소에서 한 번만 읽는다.
const FORCED = typeof window === "undefined" ? null : new URLSearchParams(location.search).get("ui");

function subscribe(cb: () => void) {
  const m = matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

const desktop = () => FORCED === "desktop" || (FORCED !== "mobile" && !window.SsalTechNative && matchMedia(WIDE).matches);

export function ClientPage() {
  const wide = useSyncExternalStore(subscribe, desktop, () => false);
  return wide ? <DesktopApp /> : <MobileApp />;
}
