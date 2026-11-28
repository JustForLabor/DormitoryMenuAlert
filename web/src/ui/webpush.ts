"use client";

// 이 브라우저 웹 푸시. 엔드포인트는 이 기기에만 두고, 허브가 죽어도 화면은 토스트만 띄운다.
// Android 앱(window.SsalTechNative)은 자체 알림을 쓰므로 이 흐름을 타지 않는다.
import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/track";
import { bridge } from "./native";
import type { Alarm } from "./store";

const HUB = "https://hub.ybkim.pe.kr";
const KEY = "ssaltech_push";
const HUB_MS = 8000;

export type PushPhase = "unsupported" | "ios-install" | "ios-old" | "default" | "denied" | "granted" | "subscribed";

interface Stored {
  endpoint: string;
}

const readStored = (): Stored | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed.endpoint ? parsed : null;
  } catch {
    return null;
  }
};

const saveStored = (endpoint: string) => localStorage.setItem(KEY, JSON.stringify({ endpoint }));
const clearStored = () => localStorage.removeItem(KEY);

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function iosVersion(): number | null {
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 10 : null;
}

export function pushPlatform(): "android-app" | "pwa" | "web" {
  if (typeof navigator === "undefined") return "web";
  if (/ SsalTech\//.test(navigator.userAgent) || bridge()) return "android-app";
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return "pwa";
  return "web";
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function hub(path: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), HUB_MS);
  try {
    return await fetch(`${HUB}${path}`, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function detectPhase(): Promise<PushPhase> {
  if (typeof window === "undefined") return "default";
  if (isIos() && !standalone()) return "ios-install";
  if (isIos()) {
    const v = iosVersion();
    if (v !== null && v < 16.4) return "ios-old";
  }
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      saveStored(sub.endpoint);
      return "subscribed";
    }
  } catch {
    /* 구독 조회 실패는 권한 상태로 떨어진다 */
  }
  clearStored();
  return Notification.permission === "granted" ? "granted" : "default";
}

let lastSyncFail = 0;

/** 구독 중일 때만 규칙을 허브에 반영한다. 실패 토스트는 20초에 한 번. */
export async function syncPushAlarms(alarms: readonly Alarm[], toast?: (m: string) => void): Promise<void> {
  if (typeof window === "undefined" || bridge()) return;
  const saved = readStored();
  if (!saved) return;
  try {
    const res = await hub("/push/alarms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: saved.endpoint, alarms }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    if (toast && Date.now() - lastSyncFail > 20_000) {
      lastSyncFail = Date.now();
      toast("알림 규칙을 서버에 반영하지 못했어요.");
    }
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const { promise, resolve, reject } = Promise.withResolvers<ServiceWorkerRegistration>();
  const t = setTimeout(() => reject(new Error("ready")), 8000);
  navigator.serviceWorker.ready.then(
    (reg) => {
      clearTimeout(t);
      resolve(reg);
    },
    (err: unknown) => {
      clearTimeout(t);
      reject(err instanceof Error ? err : new Error("ready"));
    },
  );
  return promise;
}

export async function subscribePush(alarms: readonly Alarm[]): Promise<void> {
  if (!supported()) throw new Error("unsupported");
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "denied" : "default");
  const reg = await readyRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const res = await hub("/push/vapid");
    if (!res.ok) throw new Error("hub");
    const body = (await res.json()) as { publicKey?: string };
    if (!body.publicKey) throw new Error("hub");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(body.publicKey) as BufferSource,
    });
  }
  const posted = await hub("/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), alarms, platform: pushPlatform(), ua: navigator.userAgent }),
  });
  if (!posted.ok) throw new Error("hub");
  saveStored(sub.endpoint);
  track("push_subscribe", { platform: pushPlatform() });
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  const endpoint = sub?.endpoint ?? readStored()?.endpoint;
  if (endpoint) {
    await hub("/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  }
  await sub?.unsubscribe();
  clearStored();
  track("push_unsubscribe", { platform: pushPlatform() });
}

export async function testPush(): Promise<void> {
  const endpoint = readStored()?.endpoint;
  if (!endpoint) throw new Error("none");
  const res = await hub("/push/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error("hub");
}

const FAIL: Record<string, string> = {
  denied: "알림이 차단돼 있어요. 주소창의 자물쇠에서 허용해 주세요.",
  default: "알림 허용이 필요해요.",
  hub: "알림 서버에 닿지 못했어요. 잠시 후 다시 시도해 주세요.",
  ready: "서비스 워커를 준비하지 못했어요. 새로고침 후 다시 시도해 주세요.",
  unsupported: "이 브라우저는 알림을 지원하지 않아요.",
  none: "먼저 알림을 구독해 주세요.",
};

export function pushError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return FAIL[msg] ?? "알림을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function useWebPush() {
  const [phase, setPhase] = useState<PushPhase>("default");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    void detectPhase().then(setPhase);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const run = useCallback(async (fn: () => Promise<void>, ok: string, toast: (m: string) => void) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (err) {
      toast(pushError(err));
    } finally {
      setBusy(false);
      refresh();
    }
  }, [refresh]);
  return { phase, busy, refresh, run };
}
