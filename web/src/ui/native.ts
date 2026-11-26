"use client";

// Android 앱(android/)의 WebView가 넣어 주는 다리. 웹 브라우저에서는 없다.
// 알림은 앱이 AlarmManager로 예약하고, 울릴 때 /api/notify에서 그 시각의 메뉴를 받아 띄운다.
import { useSyncExternalStore } from "react";
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
}

declare global {
  interface Window {
    SsalTechNative?: Bridge;
  }
}

export const NATIVE_EVENT = "ssaltech-native";

export const bridge = (): Bridge | undefined => (typeof window === "undefined" ? undefined : window.SsalTechNative);

export function pushAlarms(alarms: readonly Alarm[]) {
  bridge()?.setAlarms(JSON.stringify(alarms));
}

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

/** Android 앱 내려받기 주소 (웹에서 안내) */
export const APK_URL = "/ssaltech.apk";
