import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // 서비스 워커는 늘 새로 받아야 새 배포가 바로 퍼진다.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/ssaltech.apk", headers: [{ key: "Content-Type", value: "application/vnd.android.package-archive" }] },
    ];
  },
};

export default nextConfig;
