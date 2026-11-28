"use client";

// Android 앱(android/)의 WebView가 넣어 주는 다리. 웹 브라우저에서는 없다.
// 알림은 앱이 AlarmManager로 예약하고, 울릴 때 /api/notify에서 그 시각의 메뉴를 받아 띄운다.
import { useEffect, useSyncExternalStore } from "react";
import type { Alarm } from "./store";

interface Bridge {
  /** 알림 규칙 전체(JSON 배열)를 넘기면 앱이 다시 예약한다. */
  setAlarms(json: string): void;
  /** "granted" | "denied" | "ask" — 알림 권한 */
  permission(): string;
  /** 권한 요청 창을 띄운다. 결과는 "ssaltech-native" 이벤트로 알려 준다. */
  requestPermission(): void;
  /** 이 기기에 띄운 최근 알림(JSON 배열: {title, body, at}) */
  inbox(): string;
  /** 정확한 시각 알림이 막혀 있으면 false (Android 12+) */
  exactAlarms(): boolean;
  openExactAlarmSettings(): void;
  version(): string;
  /** 규칙 하나(JSON)를 지금 바로 한 번 울린다. */
  test(json: string): void;
  /** Android 공유 시트. 아직 없는 빌드도 있어 호출 전에 함수인지 본다. */
  share?(title: string, text: string, url: string): void;
  /** 글과 링크를 한 앱(pkg)으로 바로 보낸다. 그 앱이 없으면 false. 1.2.0 부터. */
  shareTo?(pkg: string, title: string, text: string, url: string): boolean;
  /** 이 사이트 이미지(path, /s/… 만)를 받아 한 앱(pkg)으로 보낸다. 그 앱이 없으면 false. 1.2.0 부터. */
  shareImageTo?(pkg: string, path: string): boolean;
  /** 앱 업데이트 상태 JSON(AppUpdate). 1.1.0 이전 빌드에는 없다. */
  update?(): string;
  /** version.json을 지금 다시 받아 본다. 결과는 "ssaltech-native" 이벤트로 온다. */
  checkUpdate?(): void;
  /** 새 APK를 받아 설치 창까지 띄운다. */
  startUpdate?(): void;
  /** 즐겨찾기 알림(kind "fav" 규칙)을 이해하면 있다. 1.2.0 부터. */
  favAlarms?(): boolean;
  /** "light" | "dark": 상태 표시줄·내비게이션 바 색을 웹 테마에 맞춘다. 1.2.3 부터. */
  setTheme?(mode: string): void;
}

declare global {
  interface Window {
    SsalTechNative?: Bridge;
  }
}

export const NATIVE_EVENT = "ssaltech-native";

export const bridge = (): Bridge | undefined => (typeof window === "undefined" ? undefined : window.SsalTechNative);

/** 알림 규칙을 앱에 넘긴다. 즐겨찾기 규칙은 이해하는 앱에만 넘긴다(예전 앱은 점심 메뉴 알림으로 울린다). */
export function pushAlarms(alarms: readonly Alarm[]) {
  const b = bridge();
  if (!b) return;
  b.setAlarms(JSON.stringify(typeof b.favAlarms === "function" ? alarms : alarms.filter((a) => a.kind !== "fav")));
}

/** 이 앱(또는 웹 푸시)이 즐겨찾기 알림을 보낼 수 있는지. 예전 Android 앱이면 false. */
export const favAlarmsSupported = () => {
  const b = bridge();
  return !b || typeof b.favAlarms === "function";
};

export interface Pushed {
  title: string;
  body: string;
  at: number;
}

export function nativeInbox(): Pushed[] {
  try {
    const j: unknown = JSON.parse(bridge()?.inbox() ?? "[]");
    return Array.isArray(j) ? (j as Pushed[]) : [];
  } catch {
    return [];
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(NATIVE_EVENT, cb);
  window.addEventListener("focus", cb);
  return () => {
    window.removeEventListener(NATIVE_EVENT, cb);
    window.removeEventListener("focus", cb);
  };
}

/** 앱 안이면 알림 권한 상태, 웹이면 "web" */
export function useNativeState(): { permission: string; exact: boolean } | "web" {
  const snap = useSyncExternalStore(
    subscribe,
    () => {
      const b = bridge();
      return b ? `${b.permission()}|${b.exactAlarms()}` : "web";
    },
    () => "web",
  );
  if (snap === "web") return "web";
  const [permission, exact] = snap.split("|");
  return { permission, exact: exact === "true" };
}

export type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";
export interface AppUpdate {
  current: { code: number; name: string };
  latest: { code: number; name: string; notes: string[]; size: number } | null;
  state: UpdateState;
  progress: number;
  error?: string;
}

/** 앱 안 업데이트 상태. 웹이거나 업데이트 기능이 없는 옛 빌드면 null */
export function useAppUpdate(): AppUpdate | null {
  const snap = useSyncExternalStore(subscribe, () => bridge()?.update?.() ?? "", () => "");
  if (!snap) return null;
  try {
    return JSON.parse(snap) as AppUpdate;
  } catch {
    return null;
  }
}

/** 웹이 이미 띄워 준 새 버전 코드. 버전마다 한 번만 대화상자를 연다. */
const UPD_PROMPTED = "ssaltech_upd_prompted";
const NUDGE_EVERY_MS = 10 * 60 * 1000;

/**
 * 앱은 켜질 때 6시간에 한 번만 version.json 을 본다. 그 사이 새 버전이 나오면 대화상자가 늦게 뜨므로,
 * 웹이 켜질 때와 앱으로 돌아올 때(10분 간격) 직접 보고, 더 새 버전이면 checkUpdate() 로 앱 대화상자를 연다.
 * 웹은 배포 즉시 바뀌므로 이미 깔린 옛 빌드에도 바로 적용된다.
 */
export function useUpdateNudge(): void {
  useEffect(() => {
    const app = bridge();
    const status = app?.update;
    const check = app?.checkUpdate;
    if (!app || !status || !check) return;
    let last = 0;
    const run = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < NUDGE_EVERY_MS) return;
      last = Date.now();
      try {
        const res = await fetch("/app/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const { versionCode } = (await res.json()) as { versionCode?: number };
        const current = (JSON.parse(status.call(app)) as AppUpdate).current.code;
        if (!versionCode || versionCode <= current || localStorage.getItem(UPD_PROMPTED) === String(versionCode)) return;
        localStorage.setItem(UPD_PROMPTED, String(versionCode));
        check.call(app);
      } catch (e) {
        console.warn("[ssaltech] update nudge failed", e);
      }
    };
    void run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, []);
}

/** Android 앱 내려받기 주소 (웹에서 안내) */
export const APK_URL = "/download/android?src=web";
