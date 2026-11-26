import type { Metadata, Viewport } from "next";
import "@/ui/mobile.css";
import "@/ui/motion.css";
import "@/ui/views.css";
import "@/ui/desktop/desktop.css";

export const metadata: Metadata = {
  title: "SsalTech · 서울과기대 생활관 식단",
  description: "서울과학기술대학교 생활관(KB·성림·수림학사) 식단을 주간·월간으로 보고, 알레르기 메뉴를 짚고, 정한 시각에 메뉴 알림을 받는 비공식 앱.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/assets/favicon-32.png", sizes: "32x32" }, { url: "/assets/favicon.ico" }], apple: "/assets/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SsalTech", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F3F4F7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
