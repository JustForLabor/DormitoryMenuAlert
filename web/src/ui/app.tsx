"use client";

// SsalTech 앱 셸: 온보딩과 다섯 탭(오늘·식단·알림·알레르기·MY) 사이 이동, 바텀 시트, 토스트, 축하 효과, 스플래시.
// WasteLess v3.3 모바일 앱(Figma "v3.3 Mobile App")의 셸을 생활관 식단용으로 옮겼다.
//
// 이동 규칙
// - 화면은 view transition으로 바뀐다(motion.tsx/motion.css): 탭은 fade-through, 온보딩 단계는 X축, 앱 진입은 Z축.
// - 앱처럼 뒤로 가기: 어느 탭에서든 뒤로 가면 오늘로, 오늘에서 뒤로 가면 나간다. 브라우저/Android 뒤로 가기는
//   하나의 guard history 항목으로 받아 시트를 먼저 닫고 스택을 걷는다. 주소는 replaceState로 ?tab=… 를 유지한다.
// - 탭마다 스크롤 위치를 기억하고, 지금 탭을 다시 누르면 맨 위로 간다.
// - 알림을 눌러 열면 ?tab=menu&date=YYYY-MM-DD 로 그날 식단이 열린다.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { isDorm, isMeal, isYmd, kstToday, type Dorm, type Meal, type Ymd } from "@/lib/menu";
import { FAB_BELL, ICON_DEFS, TAB_ICON } from "./icons";
import { useInstall, type InstallState } from "./install";
import { haptic, motion, prefersReducedMotion, SCREEN_IN, SCREEN_OUT, type MotionType } from "./motion";
import { pushAlarms } from "./native";
import { hideSsrHome } from "./ssr";
import { syncPushAlarms } from "./webpush";
import { deliveredAlarms, loadState, saveState, type Alarm, type AppState } from "./store";
import { Svg } from "./kit";
import { HomeView } from "./views/HomeView";
import { MenuView } from "./views/MenuView";
import { AlarmView } from "./views/AlarmView";
import { AllergyView } from "./views/AllergyView";
import { MyView } from "./views/MyView";
import { OnboardingView } from "./views/OnboardingView";

export const TABS = ["home", "menu", "alarm", "allergy", "my"] as const;
export type Tab = (typeof TABS)[number];
export type Screen = Tab | "onb";

export interface Onboarding {
  step: number;
  dorm: Dorm | null;
  al: number[];
  /** 추천 알림(전날 21:00 내일 아침, 11:00 점심) 켜기 */
  preset: boolean;
}

export const EMPTY_OB: Onboarding = { step: 0, dorm: null, al: [], preset: true };

export interface GoOptions {
  /** 화면이 붙은 뒤 스크롤할 요소 id */
  anchor?: string;
  type?: MotionType;
}

export interface MobileCtx {
  /** 온보딩 전이면 null. 탭 화면은 `s`를 믿고 쓴다. */
  S: AppState | null;
  s: AppState;
  update: (fn: (s: AppState) => void) => void;
  replaceState: (s: AppState | null) => void;
  cur: Screen;
  go: (t: Screen, opts?: string | GoOptions) => void;
  back: (fallback?: () => void) => void;
  obStep: (step: number) => void;
  scrollToId: (id: string) => void;
  toast: (msg: string) => void;
  confetti: (x: number, y: number) => void;
  sheet: (node: ReactNode) => void;
  closeSheet: () => void;
  pwa: InstallState;
  /** 이 기기 기록을 지우고 처음 화면으로 */
  reset: () => void;
  ob: Onboarding;
  setOb: (ob: Onboarding) => void;
  /** 식단 탭에서 고른 날짜 */
  sel: Ymd;
  setSel: (d: Ymd) => void;
  mView: "w" | "m";
  setMView: (v: "w" | "m") => void;
  /** 식단 탭에서 보는 식당 (null = 내 식당) */
  dormSel: Dorm | null;
  setDormSel: (d: Dorm | null) => void;
}

const Ctx = createContext<MobileCtx | null>(null);

export function useMobile(): MobileCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMobile must be used inside <MobileApp>");
  return c;
}

const DEFAULT_STATE: AppState = { dorm: "kb", allergy: [], rates: {}, alarms: [] };
const CONFETTI = ["#FF8A3D", "#FF4F7B", "#7B61FF", "#FFB020", "#1FAE68", "#3B6CFF"];
const isTab = (x: Screen): x is Tab => (TABS as readonly string[]).includes(x);
const TAB_NAME: Record<Exclude<Tab, "alarm">, string> = { home: "오늘", menu: "식단", allergy: "알레르기", my: "MY" };

interface Boot {
  s: AppState | null;
  screen: Screen;
  sel: Ymd;
  dormSel: Dorm | null;
  /** 알림을 눌러 들어온 메뉴: 식단 탭에서 그 카드로 스크롤 */
  meal: Meal | null;
}

/** 저장소와 주소에서 첫 상태를 정한다. 클라이언트 전용(page.tsx가 ssr:false로 띄운다). */
function boot(): Boot {
  const q = new URLSearchParams(location.search);
  const s = loadState();
  const tab = q.get("tab");
  const date = q.get("date");
  const dorm = q.get("dorm");
  const meal = q.get("meal");
  const sel = isYmd(date) ? date : kstToday();
  const dormSel = isDorm(dorm) ? dorm : null;
  const m = isMeal(meal) ? meal : null;
  // 처음 온 사람도 공유·알림 링크(?date=&meal=)면 그 메뉴부터 보여 준다. 기록은 남기지 않아 다음에 그냥 오면 첫 화면이 뜬다.
  if (!s && !(isYmd(date) && m)) return { s, screen: "onb", sel, dormSel, meal: null };
  // 알림·공유 링크(?date=&meal=)는 식단표에서 그 메뉴를 연다.
  const screen: Screen = tab && isTab(tab as Screen) ? (tab as Tab) : isYmd(date) ? "menu" : "home";
  return { s, screen, sel, dormSel, meal: m };
}

interface Entry {
  screen: Screen;
  step?: number;
}

function urlFor(screen: Screen, step: number): string {
  if (screen === "onb") return `${location.pathname}?screen=onb&step=${step}`;
  return screen === "home" ? location.pathname : `${location.pathname}?tab=${screen}`;
}

export function MobileApp() {
  const [init] = useState(boot);
  const [S, setS] = useState<AppState | null>(init.s);
  const [cur, setCur] = useState<Screen>(init.screen);
  const [ob, setOb] = useState<Onboarding>(EMPTY_OB);
  const [sel, setSel] = useState<Ymd>(init.sel);
  const [mView, setMView] = useState<"w" | "m">("w");
  const [dormSel, setDormSel] = useState<Dorm | null>(init.dormSel);
  const [sheetNode, setSheetNode] = useState<ReactNode>(null);
  const [sheetOn, setSheetOn] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const [toastSeq, setToastSeq] = useState(0);
  const [splash, setSplash] = useState<"on" | "out" | "off">(() =>
    sessionStorage.getItem("ssaltech_splash") || prefersReducedMotion() ? "off" : "on",
  );

  const scrRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number>(undefined);
  const pendingAnchor = useRef<string | null>(null);
  const pendingScroll = useRef(0);
  const scrollPos = useRef(new Map<Screen, number>());
  const stack = useRef<Entry[]>(init.s && isTab(init.screen) && init.screen !== "home" ? [{ screen: "home" }] : []);
  const guard = useRef(false);
  const ignorePop = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  // 다시 구독하면 안 되는 이벤트 처리기가 읽는 상태 사본
  const live = useRef({ S: init.s, cur: init.screen, ob: EMPTY_OB, sheetOn: false });
  useEffect(() => {
    live.current = { S, cur, ob, sheetOn };
  }, [S, cur, ob, sheetOn]);

  const setObLive = useCallback((o: Onboarding) => {
    live.current.ob = o;
    setOb(o);
  }, []);

  // ---------- feedback ----------

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastOn(true);
    setToastSeq((n) => n + 1);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastOn(false), 2200);
  }, []);

  const confetti = useCallback((x: number, y: number) => {
    const ph = phoneRef.current;
    if (!ph || prefersReducedMotion()) return;
    haptic("success");
    const r = ph.getBoundingClientRect();
    for (let i = 0; i < 26; i++) {
      const d = document.createElement("i");
      d.className = "cf";
      d.style.left = `${x - r.left}px`;
      d.style.top = `${y - r.top}px`;
      d.style.background = CONFETTI[i % 6];
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 120;
      d.style.setProperty("--x", `${Math.cos(a) * v}px`);
      d.style.setProperty("--y", `${Math.sin(a) * v - 60 + Math.random() * 160}px`);
      d.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      ph.appendChild(d);
      window.setTimeout(() => d.remove(), 1300);
    }
  }, []);

  const scrollToId = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  // ---------- history guard ----------

  const ensureGuard = useCallback(() => {
    if (guard.current || (!stack.current.length && !live.current.sheetOn)) return;
    const { cur: screen, ob: draft } = live.current;
    history.pushState({ ssGuard: 1 }, "", urlFor(screen, draft.step));
    guard.current = true;
  }, []);

  const syncUrl = useCallback((screen: Screen, step: number) => {
    history.replaceState(guard.current ? { ssGuard: 1 } : null, "", urlFor(screen, step));
  }, []);

  // ---------- navigation ----------

  const show = useCallback(
    (target: Screen, type: MotionType, opts: { anchor?: string; scroll?: number } = {}) => {
      const el = scrRef.current;
      if (el) scrollPos.current.set(live.current.cur, el.scrollTop);
      pendingAnchor.current = opts.anchor ?? null;
      pendingScroll.current = opts.scroll ?? 0;
      live.current.cur = target;
      if (live.current.sheetOn) {
        live.current.sheetOn = false;
        setSheetOn(false);
      }
      motion(type, () => setCur(target));
      syncUrl(target, live.current.ob.step);
    },
    [syncUrl],
  );

  const go = useCallback(
    (t: Screen, o?: string | GoOptions) => {
      const opts: GoOptions = typeof o === "string" ? { anchor: o } : (o ?? {});
      const { S: s, cur: from, ob: draft } = live.current;
      const target: Screen = !s && isTab(t) ? "onb" : t;
      if (target === from && isTab(target) && !opts.anchor && !opts.type) {
        scrRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        return;
      }
      let type: MotionType = opts.type ?? "wl-tab";
      if (!opts.type) {
        if (isTab(target) && !isTab(from)) type = "wl-enter-app";
        else if (target === "onb") type = "wl-push";
      }
      if (isTab(target)) stack.current = target === "home" ? [] : [{ screen: "home" }];
      else if (target === "onb" && s) stack.current.push(from === "onb" ? { screen: "onb", step: draft.step } : { screen: from });
      if (isTab(target) && isTab(from)) haptic("tap");
      const remembered = isTab(target) && type === "wl-tab" ? scrollPos.current.get(target) : 0;
      show(target, type, { anchor: opts.anchor, scroll: remembered ?? 0 });
      ensureGuard();
    },
    [show, ensureGuard],
  );

  /** 뒤로 한 걸음. 앱 안에서 더 갈 곳이 없으면 false. */
  const backStep = useCallback((): boolean => {
    if (live.current.sheetOn) {
      setSheetOn(false);
      return true;
    }
    const e = stack.current.pop();
    if (!e) return false;
    const { cur: from, ob: draft } = live.current;
    if (e.screen === "onb" && from === "onb" && e.step !== undefined) {
      const next = { ...draft, step: e.step };
      live.current.ob = next;
      motion("wl-pop", () => setOb(next), true);
      syncUrl("onb", e.step);
      return true;
    }
    const target = e.screen;
    if (isTab(target) && target !== "home" && !stack.current.length) stack.current = [{ screen: "home" }];
    show(target, isTab(target) && isTab(from) ? "wl-tab" : "wl-pop", { scroll: scrollPos.current.get(target) ?? 0 });
    return true;
  }, [show, syncUrl]);

  useEffect(() => {
    const onPop = () => {
      guard.current = false;
      if (ignorePop.current) {
        ignorePop.current = false;
        ensureGuard();
        return;
      }
      if (backStep()) ensureGuard();
      else history.back();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [backStep, ensureGuard]);

  const back = useCallback(
    (fallback?: () => void) => {
      if (guard.current && (stack.current.length || live.current.sheetOn)) {
        history.back();
        return;
      }
      if (!backStep()) fallback?.();
    },
    [backStep],
  );

  const obStep = useCallback(
    (step: number) => {
      const draft = live.current.ob;
      if (step === draft.step) return;
      const forward = step > draft.step;
      if (forward) stack.current.push({ screen: "onb", step: draft.step });
      const next = { ...draft, step };
      live.current.ob = next;
      scrRef.current?.scrollTo({ top: 0 });
      motion(forward ? "wl-push" : "wl-pop", () => setOb(next), true);
      syncUrl("onb", step);
      setToastOn(false);
      ensureGuard();
    },
    [syncUrl, ensureGuard],
  );

  // 새 화면이 DOM에 붙은 뒤 스크롤 위치를 되살리거나 anchor로 간다.
  useLayoutEffect(() => {
    const el = scrRef.current;
    if (!el) return;
    const a = pendingAnchor.current;
    pendingAnchor.current = null;
    el.scrollTop = a ? 0 : pendingScroll.current;
    el.classList.toggle("scrolled", el.scrollTop > 4);
    if (!a) return;
    const id = window.setTimeout(() => scrollToId(a), 60);
    return () => window.clearTimeout(id);
  }, [cur, scrollToId]);

  // 알림에서 들어오면(?tab=menu&date&dorm&meal) 그 주 식단이 그려진 뒤 그 메뉴 카드로 간다.
  // 앱이 뒤에 있다가 알림으로 열리면 부드러운 스크롤이 멈출 수 있어 바로 옮긴다.
  useEffect(() => {
    if (init.screen !== "menu" || !init.meal) return;
    const id = `meal-${init.meal}`;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 40) {
        window.clearInterval(t);
        el?.scrollIntoView({ block: "start" });
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [init]);

  // ---------- state ----------

  const update = useCallback((fn: (s: AppState) => void) => {
    setS((prev) => {
      const next = structuredClone(prev ?? DEFAULT_STATE);
      fn(next);
      saveState(next);
      return next;
    });
  }, []);

  const replaceState = useCallback((s: AppState | null) => {
    live.current.S = s;
    saveState(s);
    setS(s);
  }, []);

  // 알림 규칙(즐겨찾기 알림 포함)이 바뀔 때마다 Android 앱과, 구독 중이면 웹 푸시 서버에 넘긴다.
  const delivered = S ? JSON.stringify(deliveredAlarms(S)) : null;
  useEffect(() => {
    if (!delivered) return;
    const list = JSON.parse(delivered) as Alarm[];
    pushAlarms(list);
    void syncPushAlarms(list, toast);
  }, [delivered, toast]);

  // ---------- sheet ----------

  const sheet = useCallback(
    (node: ReactNode) => {
      if (!live.current.sheetOn) returnFocus.current = document.activeElement as HTMLElement | null;
      setSheetNode(node);
      setSheetOn(true);
      live.current.sheetOn = true;
      sheetRef.current?.scrollTo({ top: 0 });
      ensureGuard();
    },
    [ensureGuard],
  );

  const closeSheet = useCallback(() => {
    if (!live.current.sheetOn) return;
    setSheetOn(false);
    live.current.sheetOn = false;
    if (guard.current && !stack.current.length) {
      ignorePop.current = true;
      history.back();
    }
  }, []);

  useEffect(() => {
    if (!sheetOn) {
      returnFocus.current?.focus({ preventScroll: true });
      returnFocus.current = null;
      return;
    }
    const id = window.setTimeout(() => sheetRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOn, closeSheet]);

  // 시트를 아래로 끌어 닫기 (손잡이, 또는 맨 위까지 올린 내용에서)
  const drag = useRef<{ y0: number; t0: number; dy: number; id: number } | null>(null);
  const onSheetDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = sheetRef.current;
    if (!el || (e.pointerType === "mouse" && !(e.target as HTMLElement).classList.contains("gr"))) return;
    if (el.scrollTop > 0 && !(e.target as HTMLElement).classList.contains("gr")) return;
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
  };
  const onSheetMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dy = Math.max(0, e.clientY - d.y0);
    if (!d.dy && dy < 6) return;
    if (!d.dy) {
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      dimRef.current?.classList.add("dragging");
    }
    d.dy = dy;
    el.style.transform = `translateY(${dy}px)`;
    if (dimRef.current) dimRef.current.style.opacity = String(Math.max(0, 1 - dy / 420));
  };
  const onSheetUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !el || !d.dy) return;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    el.classList.remove("dragging");
    dimRef.current?.classList.remove("dragging");
    el.style.transform = "";
    if (dimRef.current) dimRef.current.style.opacity = "";
    if (d.dy > 110 || v > 0.6) {
      haptic("tap");
      closeSheet();
    }
  };

  // ---------- session ----------

  const reset = useCallback(() => {
    replaceState(null);
    pushAlarms([]);
    void syncPushAlarms([], toast);
    stack.current = [];
    scrollPos.current.clear();
    setObLive(EMPTY_OB);
    show("onb", "wl-pop");
    toast("이 기기의 기록을 지웠어요");
  }, [replaceState, setObLive, show, toast]);

  // 스크롤하면 [data-reveal] 안의 애니메이션을 그때 재생한다(motion.css).
  useEffect(() => {
    const root = scrRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { root, threshold: 0.25 },
    );
    const watch = (n: ParentNode) => n.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => io.observe(el));
    watch(root);
    const mo = new MutationObserver(() => watch(root));
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [cur]);

  // 스플래시는 세션마다 한 번
  useEffect(() => {
    if (splash !== "on") return;
    sessionStorage.setItem("ssaltech_splash", "1");
    const a = window.setTimeout(() => setSplash("out"), 750);
    const b = window.setTimeout(() => setSplash("off"), 1150);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [splash]);

  useEffect(() => {
    ensureGuard();
  }, [ensureGuard]);

  const onInstalled = useCallback(() => toast("홈 화면에 SsalTech를 설치했어요"), [toast]);
  useLayoutEffect(() => {
    hideSsrHome();
  }, []);

  const pwa = useInstall(onInstalled);

  const ctx = useMemo<MobileCtx>(
    () => ({
      S,
      s: S ?? DEFAULT_STATE,
      update,
      replaceState,
      cur,
      go,
      back,
      obStep,
      scrollToId,
      toast,
      confetti,
      sheet,
      closeSheet,
      pwa,
      reset,
      ob,
      setOb: setObLive,
      sel,
      setSel,
      mView,
      setMView,
      dormSel,
      setDormSel,
    }),
    [S, update, replaceState, cur, go, back, obStep, scrollToId, toast, confetti, sheet, closeSheet, pwa, reset, ob, setObLive, sel, mView, dormSel],
  );

  const tabScreen = isTab(cur);

  return (
    <Ctx.Provider value={ctx}>
      <div className="wlm">
        <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_DEFS }} />
        <div className="stage">
          <main className="phone" ref={phoneRef}>
            <ViewTransition key={cur} enter={SCREEN_IN} exit={SCREEN_OUT} default="none">
              <div
                className={`scr on${tabScreen ? "" : " noTab"}`}
                ref={scrRef}
                inert={sheetOn}
                onScroll={(e) => e.currentTarget.classList.toggle("scrolled", e.currentTarget.scrollTop > 4)}
              >
                <CurrentScreen />
              </div>
            </ViewTransition>
            <nav className={`tabs${tabScreen ? "" : " off"}`} aria-label="주요 메뉴" inert={sheetOn || !tabScreen}>
              {TABS.map((k) =>
                k === "alarm" ? (
                  <button key={k} className={`ctr${cur === k ? " on" : ""}`} onClick={() => go("alarm")} aria-label="알림" aria-current={cur === k ? "page" : undefined}>
                    <span className="fab">
                      <Svg html={FAB_BELL} />
                    </span>
                    <span>알림</span>
                  </button>
                ) : (
                  <button key={k} className={cur === k ? "on" : ""} onClick={() => go(k)} aria-current={cur === k ? "page" : undefined}>
                    <i key={cur === k ? "on" : "off"}>
                      <Svg html={TAB_ICON[k][cur === k ? 1 : 0]} />
                    </i>
                    {TAB_NAME[k]}
                  </button>
                ),
              )}
            </nav>
            <div className={`dim${sheetOn ? " on" : ""}`} ref={dimRef} onClick={closeSheet} aria-hidden="true" />
            <div
              className={`sheet${sheetOn ? " on" : ""}`}
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-hidden={!sheetOn}
              inert={!sheetOn}
              tabIndex={-1}
              onPointerDown={onSheetDown}
              onPointerMove={onSheetMove}
              onPointerUp={onSheetUp}
              onPointerCancel={onSheetUp}
            >
              <div className="gr" aria-hidden="true" />
              {sheetNode}
            </div>
            <div key={toastSeq} className={`toast${toastOn ? " on" : ""}${toastOn && toastSeq > 1 ? " again" : ""}`} role="status" aria-live="polite">
              {toastMsg}
            </div>
            {pwa.updateReady && (
              <button type="button" className="upd" onClick={pwa.applyUpdate}>
                새 버전이 있어요 · 새로고침
              </button>
            )}
            {splash !== "off" && (
              <div className={`splash${splash === "out" ? " out" : ""}`} aria-hidden="true">
                <div className="mkb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
                  <img src="/assets/logo-256.webp" alt="" width={88} height={88} />
                </div>
                <div className="wm">
                  Ssal<em>Tech</em>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function CurrentScreen() {
  const { cur } = useMobile();
  switch (cur) {
    case "onb":
      return <OnboardingView />;
    case "home":
      return <HomeView />;
    case "menu":
      return <MenuView />;
    case "alarm":
      return <AlarmView />;
    case "allergy":
      return <AllergyView />;
    case "my":
      return <MyView />;
  }
}
