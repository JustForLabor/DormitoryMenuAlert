/*
 * SsalTech 서비스 워커: 설치한 웹 앱이 오프라인에서도 열리게 하는 앱 셸 캐시.
 *
 * - / 탐색: 네트워크 먼저(4초), 안 되면 마지막에 받은 앱 셸.
 * - /_next/static/*: 캐시 먼저 (내용 해시가 붙은 빌드 파일).
 * - /assets/*, manifest: stale-while-revalidate.
 * - /api/* 등 나머지는 손대지 않는다. 식단은 앱이 localStorage에 마지막 결과를 따로 남긴다(store.ts).
 */
const VERSION = "ssaltech-v1";
const SHELL = "/";
const PRECACHE = [SHELL, "/manifest.webmanifest", "/assets/icon-192.png", "/assets/logo-96.webp", "/assets/logo-256.webp", "/assets/moa.webp"];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ssaltech-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    if (url.pathname === SHELL) event.respondWith(appShell(req));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest") event.respondWith(staleWhileRevalidate(event, req));
});

/** 페이지는 클라이언트에서 그리므로 셸 하나가 ?tab=…·?date=… 주소를 모두 맡는다. */
async function appShell(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS))]);
    if (res.ok) await cache.put(SHELL, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const update = fetch(req)
    .then((res) => (res.ok ? cache.put(req, res.clone()).then(() => res) : res))
    .catch(() => cached);
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return update;
}
