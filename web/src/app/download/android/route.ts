// APK 다운로드 집계. 허브가 죽어도 파일은 바로 보낸다. 접속 IP 헤더는 넘기지 않는다.
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";

const HUB = "https://hub.ybkim.pe.kr";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("src");
  const src = raw === "update" ? "update" : "web";
  after(async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    try {
      await fetch(`${HUB}/c`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "dorm",
          type: "event",
          name: "download",
          path: "/download/android",
          props: { app: "ssaltech-android", src },
        }),
        signal: ac.signal,
      });
    } catch {
      /* 집계 실패는 다운로드를 막지 않는다 */
    } finally {
      clearTimeout(t);
    }
  });
  const res = NextResponse.redirect(new URL("/ssaltech.apk", req.url), 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
