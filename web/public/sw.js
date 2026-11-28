/*
 * SsalTech 서비스 워커: 설치한 웹 앱이 오프라인에서도 열리게 하는 앱 셸 캐시, 웹 푸시.
 *
 * - / 탐색: 네트워크 먼저(4초), 안 되면 마지막에 받은 앱 셸.
 * - /_next/static/*: 캐시 먼저 (내용 해시가 붙은 빌드 파일).
 * - /assets/*, manifest: stale-while-revalidate.
 * - /api/* 등 나머지는 손대지 않는다. 식단은 앱이 localStorage에 마지막 결과를 따로 남긴다(store.ts).
 * - 설치 직후 skipWaiting 하지 않는다. 페이지가 기다리는 워커를 보고 새로고침을 고른 뒤에만 바꾼다.
 */
const VERSION = "ssaltech-v2";
const SHELL = "/";
const PRECACHE = [SHELL, "/manifest.webmanifest", "/assets/icon-192.png", "/assets/badge-96.png", "/assets/logo-96.webp", "/assets/logo-256.webp", "/assets/moa.webp"];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ssaltech-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skipWaiting") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "SsalTech", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "SsalTech";
  const body = typeof data.body === "string" ? data.body : "";
  const url = typeof data.url === "string" && data.url ? data.url : "/";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "ssaltech";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/assets/icon-192.png",
      badge: "/assets/badge-96.png",
      tag,
      renotify: true,
      timestamp: Date.now(),
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const url = new URL(typeof raw === "string" ? raw : "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if (typeof client.navigate === "function") {
        try {
          await client.navigate(url);
          return;
        } catch {
          /* 아래 메시지로 넘긴다 */
        }
      }
      client.postMessage({ type: "navigate", url });
      return;
    }
    await self.clients.openWindow(url);
  })());
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
