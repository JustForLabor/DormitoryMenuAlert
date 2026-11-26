"use client";

// Installable web app (PWA): service worker registration and the "add to home screen" flow.
// Chrome/Edge/Samsung Internet fire `beforeinstallprompt`, which is kept and replayed from the
// in-app install button; iOS Safari has no prompt API, so the app explains the Share-sheet steps.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
  interface Navigator {
    /** iOS Safari: true when launched from the home screen. */
    standalone?: boolean;
  }
}

export type InstallResult = "accepted" | "dismissed" | "manual";

export interface InstallState {
  /** Running as the installed app (standalone window). */
  installed: boolean;
  /** iOS/iPadOS: install only through Share → 홈 화면에 추가. */
  ios: boolean;
  /** Shows the browser's install prompt when available; "manual" means the caller explains the steps. */
  install: () => Promise<InstallResult>;
}

const STANDALONE = "(display-mode: standalone)";

const isStandalone = () => window.matchMedia(STANDALONE).matches || navigator.standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstall(onInstalled: () => void): InstallState {
  const [installed, setInstalled] = useState(isStandalone);
  const [ios] = useState(isIos);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const onInstalledRef = useRef(onInstalled);
  useEffect(() => {
    onInstalledRef.current = onInstalled;
  }, [onInstalled]);

  useEffect(() => {
    // Production only: a dev-server worker would serve stale bundles while editing.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e: unknown) => console.warn("[ssaltech] service worker registration failed", e));
    }
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault(); // keep it for the in-app button instead of the browser's mini-infobar
      deferred.current = e;
    };
    const onAppInstalled = () => {
      deferred.current = null;
      setInstalled(true);
      onInstalledRef.current();
    };
    const mq = window.matchMedia(STANDALONE);
    const onMode = () => setInstalled(isStandalone());
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    mq.addEventListener("change", onMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mq.removeEventListener("change", onMode);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallResult> => {
    const e = deferred.current;
    if (!e) return "manual";
    deferred.current = null; // a prompt event can be used once
    await e.prompt();
    return (await e.userChoice).outcome;
  }, []);

  return useMemo(() => ({ installed, ios, install }), [installed, ios, install]);
}
