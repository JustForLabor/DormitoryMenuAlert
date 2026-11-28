import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://dorm.ybkim.pe.kr/", changeFrequency: "hourly", priority: 1 }];
}
