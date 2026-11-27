"use client";

// v3.3 모바일 앱의 공용 블록. 마크업과 클래스 이름은 WasteLess 프로토타입(mobile.css, Figma 캡처)과 같다.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { MEAL_NAME, WD, dayNum, kstToday, weekday, type Meal, type Ymd } from "@/lib/menu";
import { useMobile, type Tab } from "./app";
import { I, STAR_OFF, STAR_ON, type IconName } from "./icons";
import { CountUp, haptic, motion, usePageVisible, useReducedMotion } from "./motion";
import { AL, hits, type Dish } from "./store";
import { BannersSheet, InboxSheet, SearchSheet } from "./sheets";

const ATTR = /([\w:-]+)="([^"]*)"/g;

/** `<svg …>…</svg>` 문자열을 svg 요소로 그린다(scoped CSS가 svg를 직접 자식으로 보도록). */
export function Svg({ html, className, style }: { html: string; className?: string; style?: CSSProperties }) {
  const open = html.slice(0, html.indexOf(">") + 1);
  const inner = html.slice(open.length, html.lastIndexOf("</svg>"));
  const props: Record<string, string> = {};
  for (const [, k, v] of open.matchAll(ATTR)) {
    if (k === "xmlns") continue;
    props[k === "class" ? "className" : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  if (className) props.className = className;
  return <svg {...props} style={style} dangerouslySetInnerHTML={{ __html: inner }} />;
}

export const innerOf = (k: IconName) => I[k].replace(/<svg[^>]*>|<\/svg>/g, "");

/** 3D 아이콘을 정한 크기로 */
export function Ico({ k, size, className, style }: { k: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 48 48" width={size} height={size} className={className} style={style} dangerouslySetInnerHTML={{ __html: innerOf(k) }} />;
}

/** 아이콘 원래 크기 그대로 (버튼 안 선 아이콘 등) */
export function Icon({ k }: { k: IconName }) {
  return <Svg html={I[k]} />;
}

export function Ill({ k, size = 116 }: { k: IconName; size?: number }) {
  return <Ico k={k} className="ill" style={{ width: size, height: size, right: 18, bottom: 16 }} />;
}

/** 마스코트 "모아" (밥그릇 캐릭터). `prop`은 위에 덧그릴 svg 마크업. */
export function Mascot({ className, wave = true, prop = "" }: { className?: string; wave?: boolean; prop?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="모아">
      <ellipse cx="60" cy="113" rx="27" ry="3.6" fill="#1A1D24" opacity=".10" />
      <g className={`moab${wave ? " wv" : ""}`}>
        <image href="/assets/moa.webp" x="6" y="9" width="108" height="102.4" />
      </g>
      {prop && <g dangerouslySetInnerHTML={{ __html: prop }} />}
    </svg>
  );
}

export function Mark() {
  return (
    <span className="mk">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/assets/logo-96.webp" alt="" width={30} height={30} />
    </span>
  );
}

export const st = (i: number) => ({ "--i": i }) as CSSProperties;

/** 요소를 가운데로 스크롤하고 강조를 다시 재생한다. */
export function focusId(id: string) {
  const e = document.getElementById(id);
  if (!e) return;
  e.scrollIntoView({ behavior: "smooth", block: "center" });
  e.classList.remove("hl");
  void e.offsetWidth;
  e.classList.add("hl");
}

// ---------- 메뉴 ----------

/** 메뉴 목록. 알레르기 짐작 번호와 별점 4점 이상 메뉴(♥)를 함께 보여 준다. */
export function MenuItems({ list, fav }: { list: readonly Dish[]; fav?: ReadonlySet<string> }) {
  const { s } = useMobile();
  return (
    <ul className="ml">
      {list.map(([name, nums], i) => (
        <li key={`${i}-${name}`} className={nums.some((n) => s.allergy.includes(n)) ? "hit" : ""}>
          <span>
            {name}
            {fav?.has(name) && (
              <em className="fav" aria-label="좋아하는 메뉴">
                <Icon k="heart" />
              </em>
            )}
          </span>
          <span className="n">
            {nums.map((n) => (
              <i key={n} className={s.allergy.includes(n) ? "h" : ""} title={AL[n]}>
                {n}
              </i>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 알레르기 주의 상자 (해당 없으면 비어 있음) */
export function HitBox({ list, size = 26 }: { list: readonly Dish[]; size?: number }) {
  const { s } = useMobile();
  const hl = hits(list, s.allergy);
  if (!hl.length) return null;
  const nums = [...new Set(hl.flatMap((d) => d[1].filter((n) => s.allergy.includes(n))))].sort((a, b) => a - b);
  return (
    <div className="alert">
      <Ico k="shield" size={size} />
      <div>
        {hl.map((x) => x[0]).join(", ")} 주의
        <small>메뉴 이름으로 짐작: {nums.map((n) => `${n} ${AL[n]}`).join(", ")}</small>
      </div>
    </div>
  );
}

/** 메뉴 한 줄 (홈 카드) */
export function CrRow({ meal, main, rest, time, tag }: { meal: Meal; main: string; rest: string; time: string; tag?: string }) {
  return (
    <div className="cr">
      <span className="cn">{MEAL_NAME[meal]}</span>
      <p>
        {main}
        <small>{rest}</small>
      </p>
      <span className="cp">
        <b>{tag ?? ""}</b>
        <small>{time}</small>
      </span>
    </div>
  );
}

/** 날짜 칩. `dot`은 알레르기 주의 날, `na`는 아직 올라오지 않은 날. */
export function WkChips({ days, dot, na }: { days: readonly Ymd[]; dot: (d: Ymd) => boolean; na: (d: Ymd) => boolean }) {
  const { sel, setSel } = useMobile();
  const ref = useRef<HTMLDivElement>(null);
  const today = kstToday();
  useEffect(() => {
    const el = ref.current;
    const b = el?.querySelector<HTMLElement>(".on");
    if (el && b) el.scrollTo({ left: b.offsetLeft - 16 - el.clientWidth / 2 + b.clientWidth / 2 + 16, behavior: "smooth" });
  }, [sel]);
  return (
    <div className="wk" id="wk" ref={ref}>
      {days.map((d) => (
        <button
          key={d}
          className={`${d === sel ? "on" : ""} ${d === today ? "td" : ""} ${na(d) ? "na" : ""}`}
          aria-pressed={d === sel}
          onClick={() => {
            if (d === sel) return;
            haptic("select");
            motion(d > sel ? "wl-swap-next" : "wl-swap-prev", () => setSel(d));
          }}
        >
          <small>{WD[weekday(d)]}</small>
          <b>{dayNum(d)}</b>
          {dot(d) && <i className="ad" />}
        </button>
      ))}
    </div>
  );
}

// ---------- 홈 ----------

export function Hdr() {
  const { go, sheet } = useMobile();
  return (
    <div className="hbar">
      <div className="logo">
        <Mark />
        <b>
          Ssal<em>Tech</em>
        </b>
      </div>
      <div className="hic">
        <button className="ib press" onClick={() => sheet(<InboxSheet key={Date.now()} />)} aria-label="알림함">
          <Icon k="bellL" />
        </button>
        <button className="ib press" onClick={() => go("my")} aria-label="설정">
          <Icon k="gearL" />
        </button>
      </div>
    </div>
  );
}

/** 행 n개(+첫 행 반복)를 굴리는 keyframes: 각 행에 머물다 마지막 2%에 22px 올라간다. */
function rollKeyframes(n: number): string {
  const seg = 100 / n;
  const holds = Array.from({ length: n }, (_, i) => {
    const a = +(i * seg).toFixed(2);
    const b = +((i + 1) * seg - 2).toFixed(2);
    return `${a}%,${b}%{transform:translateY(${-22 * i}px)}`;
  });
  return `@keyframes wl-roll-${n}{${holds.join("")}100%{transform:translateY(${-22 * n}px)}}`;
}

/** 굴러가는 메뉴 검색 알약. items: [메뉴, 설명]; 항목당 2초. */
export function Roll({ items }: { items: readonly (readonly [string, string])[] }) {
  const { sheet } = useMobile();
  const n = items.length;
  if (!n) {
    return (
      <button className="search press st" style={st(2)} onClick={() => sheet(<SearchSheet />)}>
        <span>
          <div className="roll">
            <p>메뉴 검색</p>
          </div>
          <Icon k="search" />
        </span>
      </button>
    );
  }
  return (
    <button className="search press st" style={st(2)} onClick={() => sheet(<SearchSheet />)}>
      <style href={`wl-roll-${n}`} precedence="wl">
        {rollKeyframes(n)}
      </style>
      <span>
        <div className="roll">
          <div style={{ animation: `wl-roll-${n} ${n * 2}s infinite` }}>
            {[...items, items[0]].map((k, i) => (
              <p key={i}>
                <b>{(i % items.length) + 1}</b>
                {k[0]}
                <i>{k[1]}</i>
              </p>
            ))}
          </div>
        </div>
        <Icon k="search" />
      </span>
    </button>
  );
}

export interface Banner {
  bg: string;
  t: readonly [string, string];
  d: string;
  ill: IconName | "moa";
  size: number;
  go: Tab | (() => void);
}

function BannerIll({ ill, size }: { ill: IconName | "moa"; size: number }) {
  if (ill === "moa") return <Mascot className="ill" wave />;
  return <Ill k={ill} size={size} />;
}

export function useBannerGo() {
  const { go } = useMobile();
  return (b: Banner) => (typeof b.go === "function" ? b.go() : go(b.go));
}

export function BanBlock({ list }: { list: readonly Banner[] }) {
  const { sheet } = useMobile();
  const trk = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const [held, setHeld] = useState(false);
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const banGo = useBannerGo();
  // 숨겨졌을 때, 손가락이 닿아 있을 때, 동작 줄이기 설정일 때는 자동 넘김을 멈춘다.
  useEffect(() => {
    const t = trk.current;
    if (!t || !visible || held || reduced) return;
    const timer = window.setInterval(() => {
      const n = (idxRef.current + 1) % list.length;
      t.scrollTo({ left: n * t.clientWidth, behavior: "smooth" });
    }, 4200);
    return () => window.clearInterval(timer);
  }, [list.length, visible, held, reduced]);
  return (
    <div className="bn st" style={st(3)}>
      <div
        className="trk"
        ref={trk}
        role="region"
        aria-roledescription="carousel"
        aria-label="소식"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onScroll={(e) => {
          const t = e.currentTarget;
          const i = Math.round(t.scrollLeft / t.clientWidth);
          if (i !== idxRef.current) {
            idxRef.current = i;
            setIdx(i);
          }
        }}
      >
        {list.map((b, i) => (
          <div key={i} className="sl" style={{ background: b.bg }} onClick={() => banGo(b)}>
            <h3>
              {b.t[0]}
              <br />
              {b.t[1]}
            </h3>
            <p>{b.d}</p>
            <BannerIll ill={b.ill} size={b.size} />
          </div>
        ))}
      </div>
      <div className="pg">
        <b aria-live="polite">{idx + 1}</b>
        <span>/ {list.length}</span>
        <button onClick={() => sheet(<BannersSheet list={list} />)} aria-label="전체 보기">
          +
        </button>
      </div>
    </div>
  );
}

export interface QuickIcon {
  icon: IconName;
  label: string;
  onClick: () => void;
  badge?: string;
  /** 배지 색: "" 파랑, "r" 분홍, "live" 깜빡이는 점 */
  tone?: string;
}

export function IgBlock({ items }: { items: readonly QuickIcon[] }) {
  return (
    <div className="ig">
      {items.map((x, i) => (
        <button key={x.label} className="st" style={st(i)} onClick={x.onClick}>
          {x.badge && <span className={`bdg ${x.tone ?? ""}`}>{x.badge}</span>}
          <span className="ic">
            <Icon k={x.icon} />
          </span>
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 알레르기 체크 타일. `count`는 이번 주·다음 주 주의 메뉴 수. */
export function AlTile({ count }: { count: number }) {
  const { s, go } = useMobile();
  return (
    <button className="qt press st" style={st(6)} onClick={() => go("allergy")}>
      <b>
        알레르기 체크 <Icon k="chev" />
      </b>
      <p>
        {s.allergy.length ? (
          <>
            앞으로 주의 메뉴
            <br />
            <em>
              <CountUp value={count} />개
            </em>{" "}
            있어요
          </>
        ) : (
          <>
            등록한 알레르기가
            <br />
            아직 없어요
          </>
        )}
      </p>
      <div className="ill">
        <Mascot wave={false} prop={`<g transform="translate(84 62) scale(.62)">${innerOf("shield")}</g>`} />
      </div>
    </button>
  );
}

/** 메뉴별 별점. 이 기기에만 남고, 4점 이상은 "좋아하는 메뉴"로 식단에 ♥ 표시된다. */
export function RateBlock({ date, names, title }: { date: Ymd; names: readonly string[]; title: string }) {
  const { s, update, toast, confetti } = useMobile();
  const day = s.rates[date] ?? {};
  // 누른 별을 다시 그려(key에 seq) 누를 때마다 pop 애니메이션이 다시 돈다.
  const [popped, setPopped] = useState<{ k: string; n: number; seq: number } | null>(null);
  const rate = (k: string, n: number, e: MouseEvent) => {
    const first = !day[k];
    update((x) => {
      x.rates[date] = { ...(x.rates[date] ?? {}), [k]: n };
    });
    setPopped((p) => ({ k, n, seq: (p?.seq ?? 0) + 1 }));
    haptic("select");
    if (n === 5 && day[k] !== 5) {
      confetti(e.clientX, e.clientY);
      toast(`${k}, 좋아하는 메뉴로 기억할게요`);
    } else if (first && Object.keys(day).length === names.length - 1) toast("별점 고마워요! MY → 내 기록에서 모아 볼 수 있어요");
  };
  return (
    <div className="rate" id="rate">
      <h4>{title}</h4>
      {names.map((x) => (
        <div className="rrow" key={x}>
          <span>{x}</span>
          <span className="stars">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = (day[x] ?? 0) >= n;
              const pop = popped?.k === x && popped.n === n;
              return (
                <button key={pop ? `p${popped.seq}` : n} className={`${on ? "on" : ""}${pop ? " pop" : ""}`} onClick={(e) => rate(x, n, e)} aria-label={`${x} ${n}점`}>
                  <Svg html={on ? STAR_ON : STAR_OFF} />
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
