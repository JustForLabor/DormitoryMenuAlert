"use client";

// Motion primitives of the v3.3 mobile app. Screen and in-screen transitions use React's
// <ViewTransition> on top of the browser View Transitions API (types map to CSS classes in
// motion.css); browsers without it fall back to the CSS entrance animations in mobile.css.
// Everything here honours prefers-reduced-motion.
import {
  addTransitionType,
  startTransition,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  ViewTransition,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Transition types (Material motion): `wl-tab` fade-through for the bottom tabs, `wl-push`/`wl-pop`
 * shared-axis X for deeper/shallower screens and steps, `wl-enter-app` shared-axis Z when entering
 * the app, `wl-org` fade-through with zoom on org switch, `wl-swap-*` for in-screen content.
 * Enter/exit roles get `-in`/`-out` CSS classes in motion.css.
 */
export type MotionType =
  | "wl-tab"
  | "wl-push"
  | "wl-pop"
  | "wl-enter-app"
  | "wl-org"
  | "wl-swap-next"
  | "wl-swap-prev"
  | "wl-swap-fade";

/**
 * Runs a state update as a typed view transition (instant swap when unsupported).
 * `inner` marks a change inside the current screen (content swaps, onboarding steps): the
 * `wl-inner` type makes motion.css clip the moving content to the screen and keep the bars on top.
 * Inner changes made while a sheet is open (or closing) happen behind the dim, so they skip the
 * transition: its snapshots would cover the sheet sliding away.
 */
export function motion(type: MotionType, update: () => void, inner = type.startsWith("wl-swap")) {
  if (inner && document.querySelector(".wlm .sheet.on")) {
    update();
    return;
  }
  startTransition(() => {
    addTransitionType(type);
    if (inner) addTransitionType("wl-inner");
    update();
  });
}

const REDUCED = "(prefers-reduced-motion: reduce)";

export const prefersReducedMotion = () => window.matchMedia(REDUCED).matches;

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

function subscribeVisible(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** False while the tab is hidden (pause autoplay, timers). */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVisible, () => document.visibilityState === "visible", () => true);
}

const PATTERN: Record<"tap" | "select" | "success" | "warn", VibratePattern> = { tap: 6, select: 10, success: [12, 40, 18], warn: [20, 30, 20] };

/** Light vibration feedback on supporting devices (Android); silent elsewhere and under reduced motion. */
export function haptic(kind: keyof typeof PATTERN = "tap") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator) || prefersReducedMotion()) return;
  navigator.vibrate(PATTERN[kind]);
}

const roleMap = (role: "in" | "out", types: readonly MotionType[]) => ({
  ...Object.fromEntries(types.map((t) => [t, `${t}-${role}`])),
  default: "none",
});

const SWAP_TYPES: readonly MotionType[] = ["wl-swap-next", "wl-swap-prev", "wl-swap-fade", "wl-push", "wl-pop"];
const SWAP_IN = roleMap("in", SWAP_TYPES);
const SWAP_OUT = roleMap("out", SWAP_TYPES);

const SCREEN_TYPES: readonly MotionType[] = ["wl-tab", "wl-push", "wl-pop", "wl-enter-app", "wl-org"];
export const SCREEN_IN = roleMap("in", SCREEN_TYPES);
export const SCREEN_OUT = roleMap("out", SCREEN_TYPES);

/**
 * Keyed in-screen content swap (day change, week/month toggle, onboarding step, cafeteria…).
 * Change `k` inside `motion("wl-swap-next" | …, () => …)` to animate; plain updates swap instantly.
 */
export function Swap({ k, children }: { k: string | number; children: ReactNode }) {
  return (
    <ViewTransition key={k} enter={SWAP_IN} exit={SWAP_OUT} default="none">
      {children}
    </ViewTransition>
  );
}

/** Builds a valid, unique `view-transition-name` from free text (Korean allowed; spaces/punctuation replaced). */
export function vtName(prefix: string, text: string | number): string {
  return `${prefix}-${String(text).replace(/[^\p{L}\p{N}_-]/gu, "_")}`;
}

/**
 * Item that keeps its identity across renders, so insertions, removals and reorders inside a
 * `motion(...)` update morph instead of jumping. `name` must be unique among mounted elements.
 */
export function Morph({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="wl-morph" enter="wl-pop-in" exit="wl-pop-out" default="none">
      {children}
    </ViewTransition>
  );
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Animated number (counts from the previous value; from `from` on first mount). */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("ko-KR"),
  duration = 700,
  from = 0,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  from?: number;
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : from));
  const last = useRef(shown);
  useEffect(() => {
    const start = last.current;
    if (start === value || prefersReducedMotion()) {
      last.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // The frame timestamp can precede t0, which would briefly count below the start ("-0").
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const v = start + (value - start) * easeOut(p);
      last.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/**
 * Pull-to-refresh for a tab screen. Attaches to the enclosing `.scr` scroller; pulling past the
 * threshold at the top runs `onRefresh` while the mascot spinner shows.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const scr = host.current?.closest<HTMLElement>(".scr");
    if (!scr) return;
    const MAX = 110;
    const TRIGGER = 72;
    let y0: number | null = null;
    let dist = 0;
    let running = false;
    const onStart = (e: TouchEvent) => {
      if (running || scr.scrollTop > 0) return;
      y0 = e.touches[0].clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0 || scr.scrollTop > 0) {
        if (dist) setPull(0);
        if (dy <= 0) y0 = null;
        dist = 0;
        return;
      }
      dist = Math.min(MAX, dy * 0.5);
      setPull(dist);
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = async () => {
      if (y0 === null) return;
      y0 = null;
      if (dist >= TRIGGER) {
        running = true;
        setBusy(true);
        setPull(56);
        haptic("select");
        const minSpin = Promise.withResolvers<void>();
        window.setTimeout(minSpin.resolve, 900);
        await Promise.all([refreshRef.current(), minSpin.promise]);
        running = false;
        setBusy(false);
      }
      dist = 0;
      setPull(0);
    };
    scr.addEventListener("touchstart", onStart, { passive: true });
    scr.addEventListener("touchmove", onMove, { passive: false });
    scr.addEventListener("touchend", onEnd);
    scr.addEventListener("touchcancel", onEnd);
    return () => {
      scr.removeEventListener("touchstart", onStart);
      scr.removeEventListener("touchmove", onMove);
      scr.removeEventListener("touchend", onEnd);
      scr.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div ref={host} className={`ptr${pull ? " pulling" : ""}${busy ? " busy" : ""}`} style={{ "--pull": `${pull}px` } as CSSProperties}>
      <div className="ptr-ind" role="status" aria-label={busy ? "새로고침 중" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/assets/moa.webp" alt="" width={34} height={32} style={{ transform: `rotate(${pull * 3}deg)` }} />
      </div>
      <div className="ptr-body">{children}</div>
    </div>
  );
}
