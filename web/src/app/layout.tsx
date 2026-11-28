import type { Metadata, Viewport } from "next";
import "@/ui/mobile.css";
import "@/ui/motion.css";
import "@/ui/views.css";
import "@/ui/desktop/desktop.css";

const DESCRIPTION = "서울과학기술대학교 생활관(KB·성림·수림학사) 식단을 주간·월간으로 보고, 알레르기 메뉴를 짚고, 정한 시각에 메뉴 알림을 받는 비공식 앱.";

export const metadata: Metadata = {
  metadataBase: new URL("https://dorm.ybkim.pe.kr"),
  title: { default: "SsalTech · 서울과기대 생활관 식단", template: "%s · SsalTech" },
  description: DESCRIPTION,
  keywords: ["서울과기대 기숙사 식단", "생활관 식단", "KB학사", "성림학사", "수림학사", "과기대 학식", "서울과학기술대학교 학식", "SsalTech"],
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/assets/favicon-32.png", sizes: "32x32" }, { url: "/assets/favicon.ico" }], apple: "/assets/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SsalTech", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "SsalTech",
    title: "SsalTech · 서울과기대 생활관 식단",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "SsalTech · 서울과기대 생활관 식단",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "SsalTech", url: "https://dorm.ybkim.pe.kr/", inLanguage: "ko" },
    {
      "@type": "WebApplication",
      name: "SsalTech",
      url: "https://dorm.ybkim.pe.kr/",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web, Android",
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      description: DESCRIPTION,
    },
  ],
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
        <script defer src="https://hub.ybkim.pe.kr/t.js" data-site="dorm" />
      </head>
      <body style={{ margin: 0 }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {children}
      </body>
    </html>
  );
}
