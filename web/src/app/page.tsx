"use client";

import dynamic from "next/dynamic";

// 클라이언트 전용: 앱 상태가 localStorage(이 기기)와 주소(?tab, ?date)에서 시작한다.
const MobileApp = dynamic(() => import("@/ui/app").then((m) => m.MobileApp), { ssr: false });

export default function Page() {
  return <MobileApp />;
}
