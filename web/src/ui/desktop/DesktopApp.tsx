"use client";

// 데스크톱 화면: 휴대폰 화면의 탭(오늘·식단표·알림·알레르기·MY)을 왼쪽 메뉴로 옮기고, 넓은 화면에 맞게 다시 짰다.
// 모양은 휴대폰 화면(WasteLess v3.3)의 인사말 머리글·3D 아이콘·그라데이션을 따르고, 상태(내 식당·알레르기·별점·
// 알림 규칙)는 휴대폰 화면과 같은 localStorage(store.ts)를 쓴다.
//
// 주소: ?tab=home|menu|alarm|allergy|my, 알림·공유 링크의 ?dorm=&date=&meal= (식단표 탭으로 연다)
// 키보드(식단표 탭): ←/→ 하루, ↑/↓ 아침·점심·저녁
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MEALS, addDays, isDorm, isMeal, isYmd, kstToday, nextMeal, type Dorm, type Meal, type Ymd } from "@/lib/menu";
import { I, ICON_DEFS, TAB_ICON } from "../icons";
import { useInstall } from "../install";
import { Mascot, Svg } from "../kit";
import { APK_URL, pushAlarms } from "../native";
import { hideSsrHome } from "../ssr";
import { syncPushAlarms } from "../webpush";
import { deliveredAlarms, loadState, saveState, type Alarm, type AppState } from "../store";
import { AlarmPage } from "./AlarmPage";
import { AllergyPage } from "./AllergyPage";
import { HomePage } from "./HomePage";
import { MenuPage } from "./MenuPage";
import { MyPage } from "./MyPage";
import { useTheme } from "../theme";
import { DeskCtx, useNow, useThumb, type Desk, type DTab, type Mode, type Sel } from "./shared";

const DEFAULT_STATE: AppState = { dorm: "kb", allergy: [], rates: {}, alarms: [] };

const TABS: readonly (readonly [DTab, string, string, string])[] = [
  ["home", "오늘", TAB_ICON.home[0], TAB_ICON.home[1]],
  ["menu", "식단표", TAB_ICON.menu[0], TAB_ICON.menu[1]],
  ["alarm", "알림", I.bellL, I.bellL],
  ["allergy", "알레르기", TAB_ICON.allergy[0], TAB_ICON.allergy[1]],
  ["my", "MY", TAB_ICON.my[0], TAB_ICON.my[1]],
];
const isTab = (x: unknown): x is DTab => TABS.some((t) => t[0] === x);

function bootFromUrl(): { tab: DTab; dorm: Dorm | null; sel: Sel | null } {
  const q = new URLSearchParams(location.search);
  const dorm = q.get("dorm");
  const date = q.get("date");
  const meal = q.get("meal");
  const tab = q.get("tab");
  const sel = isYmd(date) ? { date, meal: isMeal(meal) ? meal : "lunch" } : null;
  return { tab: isTab(tab) ? tab : sel ? "menu" : "home", dorm: isDorm(dorm) ? dorm : null, sel };
}

const BURST = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 46 + (i % 3) * 18;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r - 20), rot: (i * 47) % 360, c: ["#FF6A45", "#FFB020", "#FF5C80", "#7B61FF", "#1FAE68"][i % 5] };
});

export function DesktopApp() {
  const [boot] = useState(bootFromUrl);
  const [s, setS] = useState<AppState>(() => loadState() ?? DEFAULT_STATE);
  useTheme(s.theme);
  const update = useCallback((fn: (x: AppState) => void) => {
    setS((prev) => {
      const x: AppState = structuredClone(prev);
      fn(x);
      saveState(x);
      return x;
    });
  }, []);

  const now = useNow() || Date.now();
  const today = kstToday(now);
  const [tab, setTab] = useState<DTab>(boot.tab);
  const [view, setView] = useState<Dorm>(boot.dorm ?? s.dorm);
  const [sel, setSel] = useState<Sel>(boot.sel ?? nextMeal());
  const [mode, setMode] = useState<Mode>("week");
  const [toastMsg, setToastMsg] = useState<{ id: number; msg: string } | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const seq = useRef(0);

  const go = useCallback((t: DTab) => {
    setTab(t);
    const q = new URLSearchParams(location.search);
    const keep = new URLSearchParams();
    if (q.get("ui")) keep.set("ui", q.get("ui")!);
    if (t !== "home") keep.set("tab", t);
    const qs = keep.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
    window.scrollTo({ top: 0 });
  }, []);

  const open = useCallback(
    (date: Ymd, meal: Meal, dorm?: Dorm) => {
      if (dorm) setView(dorm);
      setSel({ date, meal });
      setMode("week");
      go("menu");
    },
    [go],
  );

  const toast = useCallback((msg: string) => {
    const id = ++seq.current;
    setToastMsg({ id, msg });
    setTimeout(() => setToastMsg((t) => (t?.id === id ? null : t)), 2400);
  }, []);

  const burst = useCallback((x: number, y: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = ++seq.current;
    setBursts((b) => [...b, { id, x, y }]);
    setTimeout(() => setBursts((b) => b.filter((z) => z.id !== id)), 950);
  }, []);

  useEffect(() => {
    if (tab !== "menu") return;
    const moveMeal = (n: number) =>
      setSel((x) => {
        const i = MEALS.indexOf(x.meal) + n;
        if (i < 0) return { date: addDays(x.date, -1), meal: "dinner" };
        if (i >= MEALS.length) return { date: addDays(x.date, 1), meal: "breakfast" };
        return { ...x, meal: MEALS[i] };
      });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const k = {
        ArrowLeft: () => setSel((x) => ({ ...x, date: addDays(x.date, -1) })),
        ArrowRight: () => setSel((x) => ({ ...x, date: addDays(x.date, 1) })),
        ArrowUp: () => moveMeal(-1),
        ArrowDown: () => moveMeal(1),
      }[e.key];
      if (!k) return;
      e.preventDefault();
      k();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  const reset = useCallback(() => {
    saveState(null);
    setS(structuredClone(DEFAULT_STATE));
  }, []);
  const onInstalled = useCallback(() => toast("홈 화면에 SsalTech를 설치했어요"), [toast]);
  const pwa = useInstall(onInstalled);
  useLayoutEffect(() => {
    hideSsrHome();
  }, []);
  const delivered = JSON.stringify(deliveredAlarms(s));
  useEffect(() => {
    const list = JSON.parse(delivered) as Alarm[];
    pushAlarms(list);
    void syncPushAlarms(list, toast);
  }, [delivered, toast]);
  const installApp = async () => {
    const r = await pwa.install();
    if (r === "manual") toast(pwa.ios ? "Safari 공유 → 홈 화면에 추가를 눌러 주세요" : "브라우저 메뉴에서 앱 설치를 눌러 주세요");
    else if (r === "dismissed") toast("설치를 나중에 할 수 있어요");
  };
  const desk: Desk = { s, update, today, now, view, setView, sel, setSel, mode, setMode, tab, go, open, toast, burst, reset, pwa };
  const navHost = useRef<HTMLElement>(null);
  const thumb = useThumb(navHost, tab, "y");
  const alarmsOn = s.alarms.filter((a) => a.on).length;

  return (
    <DeskCtx.Provider value={desk}>
      <div className="wld">
        <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_DEFS }} />
        <aside className="side">
          <button className="logo" onClick={() => go("home")} aria-label="SsalTech 오늘">
            <span className="mk">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/assets/logo-96.webp" alt="" width={36} height={36} />
            </span>
            <b>
              Ssal<em>Tech</em>
            </b>
          </button>
          <nav ref={navHost} className="nav" aria-label="메뉴">
            {thumb && <span className="thumb" style={thumb} aria-hidden="true" />}
            {TABS.map(([t, label, off, on]) => (
              <button key={t} data-k={t} className={tab === t ? "on" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>
                <Svg html={tab === t ? on : off} className="ni" />
                <span>{label}</span>
                {t === "alarm" && alarmsOn > 0 && <i className="badge">{alarmsOn}</i>}
                {t === "allergy" && s.allergy.length > 0 && <i className="badge soft">{s.allergy.length}</i>}
              </button>
            ))}
          </nav>
          <span className="sp" />
          <div className="promo">
            <Mascot className="pm" />
            <b>{pwa.installed ? "앱으로 보고 있어요" : "홈 화면에 추가하기"}</b>
            <p>{pwa.installed ? "이 브라우저로 알림도 받을 수 있어요" : "앱처럼 열고, 알림도 이 브라우저로"}</p>
            <div className="stack">
              {!pwa.installed && (
                <>
                  <button type="button" className="cta sm" onClick={() => void installApp()}>
                    {pwa.ios ? "홈 화면에 추가" : "앱으로 설치"}
                  </button>
                  <a className="cta sm apk" href={APK_URL} download>
                    Android 앱 받기
                  </a>
                </>
              )}
            </div>
          </div>
          <a className="tiny" href="/?ui=mobile">
            휴대폰 화면으로 보기
          </a>
        </aside>

        <main key={tab} className={`page p-${tab}`}>
          {tab === "home" && <HomePage />}
          {tab === "menu" && <MenuPage />}
          {tab === "alarm" && <AlarmPage />}
          {tab === "allergy" && <AllergyPage />}
          {tab === "my" && <MyPage />}
        </main>

        <div className="toasts" aria-live="polite">
          {toastMsg && (
            <p key={toastMsg.id} className="toast">
              {toastMsg.msg}
            </p>
          )}
        </div>
        {pwa.updateReady && (
          <button type="button" className="upd" onClick={pwa.applyUpdate}>
            새 버전이 있어요 · 새로고침
          </button>
        )}
        {bursts.map((b) => (
          <span key={b.id} className="burst" style={{ left: b.x, top: b.y }} aria-hidden="true">
            {BURST.map((p, i) => (
              <i key={i} style={{ "--x": `${p.x}px`, "--y": `${p.y}px`, "--r": `${p.rot}deg`, background: p.c } as CSSProperties} />
            ))}
          </span>
        ))}
      </div>
    </DeskCtx.Provider>
  );
}
