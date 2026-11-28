"use client";

// 화면 테마를 <html>에 걸고, 기기 설정을 따를 때는 설정이 바뀌면 바로 따라간다.
// Android 앱(1.2.3+)에는 상태 표시줄·내비게이션 바 색도 맞추라고 알린다.
import { useEffect, useSyncExternalStore } from "react";
import { THEME_BG } from "@/lib/theme";
import { bridge } from "./native";
import type { AppState } from "./store";

const DARK = "(prefers-color-scheme: dark)";

function apply(dark: boolean) {
  const mode = dark ? "dark" : "light";
  const e = document.documentElement;
  e.dataset.theme = mode;
  e.style.colorScheme = mode;
  // layout.tsx 가 기기 설정별 theme-color 두 개를 넣는다. 직접 고른 테마면 둘 다 그 색으로 맞춘다.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_BG[mode]));
  bridge()?.setTheme?.(mode);
}

export function useTheme(theme: AppState["theme"]) {
  useEffect(() => {
    const mq = matchMedia(DARK);
    const run = () => apply(theme === "dark" || (theme !== "light" && mq.matches));
    run();
    if (theme) return;
    mq.addEventListener("change", run);
    return () => mq.removeEventListener("change", run);
  }, [theme]);
}

const subscribeDark = (cb: () => void) => {
  const mq = matchMedia(DARK);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** 지금 다크로 보이는지: 직접 고른 테마, 아니면 기기 설정. */
export function useDark(theme: AppState["theme"]): boolean {
  const system = useSyncExternalStore(subscribeDark, () => matchMedia(DARK).matches, () => false);
  return theme ? theme === "dark" : system;
}

export const THEME_CHOICES = [
  [undefined, "기기 설정"],
  ["light", "라이트"],
  ["dark", "다크"],
] as const satisfies readonly (readonly [AppState["theme"], string])[];
