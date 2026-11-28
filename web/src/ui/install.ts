"use client";

// 설치형 웹 앱: 서비스 워커 등록, 홈 화면 추가, 새 버전 토스트.
// Chrome 은 beforeinstallprompt 를 잡아 두었다가 앱 안 버튼으로 다시 띄운다.
// iOS Safari 는 그 이벤트가 없어 공유 시트 단계를 안내한다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/track";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
  interface Navigator {
    /** iOS Safari: 홈 화면에서 열었으면 true. */
    standalone?: boolean;
    /** Chrome(Android 80+, 데스크톱 140+): manifest related_applications 중 이 기기에 설치된 것. */
    getInstalledRelatedApps?: () => Promise<{ platform: string; id?: string; url?: string; version?: string }[]>;
  }
}

export type InstallResult = "accepted" | "dismissed" | "manual";

export interface InstallState {
  /** 설치한 앱(standalone)으로 실행 중. */
  installed: boolean;
  /**
   * 이 기기에 앱이 있다: standalone 으로 실행 중이거나, 브라우저 탭이어도 Chrome 이 설치된
   * Android 앱(asset_statements 로 이 사이트와 묶인 1.2.5+)이나 홈 화면 앱을 찾았다. 앱 받기 안내를 숨기는 기준.
   */
  hasApp: boolean;
  /** iOS/iPadOS 는 공유 → 홈 화면에 추가로만 설치된다. */
  ios: boolean;
  /** 브라우저 설치 창이 있으면 띄우고, 없으면 "manual". */
  install: () => Promise<InstallResult>;
  /** 새 서비스 워커가 기다리고 있다. */
  updateReady: boolean;
  /** 기다리는 워커를 켜고 새로고침한다. */
  applyUpdate: () => void;
}

const STANDALONE = "(display-mode: standalone)";
/** 이 기기에서 홈 화면 앱으로 처음 연 적이 있는지. */
const PWA_SEEN = "ssaltech_pwa_seen";

const isStandalone = () => window.matchMedia(STANDALONE).matches || navigator.standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstall(onInstalled: () => void): InstallState {
  const [installed, setInstalled] = useState(isStandalone);
  const [ios] = useState(isIos);
  const [updateReady, setUpdateReady] = useState(false);
  const [related, setRelated] = useState(false);

  useEffect(() => {
    navigator
      .getInstalledRelatedApps?.()
      .then((apps) => setRelated(apps.length > 0))
      .catch(() => {});
  }, []);

  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const onInstalledRef = useRef(onInstalled);
  const reloadOnControl = useRef(false);
  useEffect(() => {
    onInstalledRef.current = onInstalled;
  }, [onInstalled]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === "navigate" && data.url) location.assign(data.url);
    };
    const onControl = () => {
      if (reloadOnControl.current) location.reload();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    navigator.serviceWorker?.addEventListener("controllerchange", onControl);

    // 개발 서버 워커는 고치는 동안 낡은 번들을 주므로 프로덕션에서만 등록한다.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const arm = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const done = () => {
          if (worker.state !== "installed") return;
          // 처음 방문은 제어권이 없다. 바로 넘겨 페이지가 워커 아래 있게 한다.
          // 이미 제어 중이면 사용자가 새로고침을 고를 때까지 기다린다.
          if (navigator.serviceWorker.controller) setUpdateReady(true);
          else worker.postMessage({ type: "skipWaiting" });
        };
        if (worker.state === "installed") done();
        else worker.addEventListener("statechange", done);
      };
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          arm(reg.installing);
          arm(reg.waiting);
          reg.addEventListener("updatefound", () => arm(reg.installing));
        })
        .catch((e: unknown) => console.warn("[ssaltech] service worker registration failed", e));
    }

    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      deferred.current = e;
    };
    const onAppInstalled = () => {
      deferred.current = null;
      setInstalled(true);
      track("install_pwa");
      onInstalledRef.current();
    };
    const mq = window.matchMedia(STANDALONE);
    const onMode = () => setInstalled(isStandalone());
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    mq.addEventListener("change", onMode);
    // 홈 화면 앱으로 처음 연 기기를 한 번 센다. iOS 는 설치 이벤트가 없어 이것만 잡힌다.
    // 이 이벤트가 생기기 전에 설치한 기기는 다음 실행 때 한 번 잡힌다.
    if (isStandalone() && !window.SsalTechNative) {
      try {
        if (!localStorage.getItem(PWA_SEEN)) {
          localStorage.setItem(PWA_SEEN, "1");
          track("pwa_first_open", { os: isIos() ? "ios" : "other" });
        }
      } catch {}
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mq.removeEventListener("change", onMode);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControl);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallResult> => {
    const e = deferred.current;
    if (!e) return "manual";
    deferred.current = null;
    await e.prompt();
    return (await e.userChoice).outcome;
  }, []);

  const applyUpdate = useCallback(() => {
    reloadOnControl.current = true;
    setUpdateReady(false);
    void navigator.serviceWorker.getRegistration().then((reg) => reg?.waiting?.postMessage({ type: "skipWaiting" }));
  }, []);

  const hasApp = installed || related;
  return useMemo(
    () => ({ installed, hasApp, ios, install, updateReady, applyUpdate }),
    [installed, hasApp, ios, install, updateReady, applyUpdate],
  );
}
