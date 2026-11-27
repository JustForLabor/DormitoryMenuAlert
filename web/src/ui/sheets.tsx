"use client";

// 바텀 시트 모음: 검색, 소식 전체, 알림함, 운영시간, 식당 고르기, 앱 받기, 터미널 버전, 데이터 안내, 내 기록, 초기화.
import { useEffect, useRef, useState } from "react";
import {
  DORMS,
  MEALS,
  MEAL_NAME,
  SITE_URL,
  addDays,
  dormOf,
  kstToday,
  mainDish,
  mondayOf,
  shortDate,
  type Dorm,
  type Ymd,
} from "@/lib/menu";
import { useMobile } from "./app";
import type { IconName } from "./icons";
import { haptic } from "./motion";
import { APK_URL, bridge, nativeInbox } from "./native";
import { AL, dishes, favorites, hits, useWeeks, type AppState } from "./store";
import { Ico, Icon, Mascot, st, useBannerGo, type Banner } from "./kit";

export const REPO_URL = "https://github.com/JustForLabor/DormitoryMenuAlert";
const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** 이번 주 앞뒤 한 주씩 (검색·알레르기·소식이 보는 범위) */
export function nearMondays(today = kstToday()): Ymd[] {
  const m = mondayOf(today);
  return [addDays(m, -7), m, addDays(m, 7)];
}

// ---------- 검색 ----------

export function SearchSheet() {
  const { s, cur, dormSel, setDormSel, closeSheet, setSel, setMView, go } = useMobile();
  // 식단 탭에서 연 검색만 그 탭에서 보던 식당을 쓴다. 홈에서는 내 식당.
  const dorm = cur === "menu" ? (dormSel ?? s.dorm) : s.dorm;
  const entries = useWeeks(dorm, nearMondays());
  const [v, setV] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => input.current?.focus(), 350);
    return () => window.clearTimeout(id);
  }, []);
  const days = entries.flatMap((e) => e.week?.days ?? []).filter((d) => d.registered);
  const q = v.trim();
  const out: { date: Ymd; meal: (typeof MEALS)[number]; name: string; nums: readonly number[] }[] = [];
  if (q) {
    for (const d of days)
      for (const m of MEALS)
        for (const [name, nums] of dishes(d.meals[m])) if (name.includes(q) || nums.some((n) => AL[n].includes(q))) out.push({ date: d.date, meal: m, name, nums });
  }
  const today = kstToday();
  const popular = [...new Set(days.filter((d) => d.date >= today).map((d) => mainDish(d.meals.lunch)).filter(Boolean))].slice(0, 6);
  return (
    <>
      <h3>메뉴·알레르기 검색</h3>
      <p className="sd">{dormOf(dorm).label} · 지난 주부터 다음 주까지</p>
      <label className="sbox" style={{ marginTop: 14 }}>
        <Icon k="search" />
        <input ref={input} value={v} placeholder="예) 돈까스, 새우" onChange={(e) => setV(e.target.value)} />
      </label>
      <div style={{ marginTop: 8 }}>
        {q ? (
          out.length ? (
            out.slice(0, 30).map((x, i) => (
              <button
                key={i}
                className="lr press"
                onClick={() => {
                  closeSheet();
                  setSel(x.date);
                  setDormSel(dorm === s.dorm ? null : dorm);
                  setMView("w");
                  go("menu");
                }}
              >
                <span className="sq" style={{ fontWeight: 800, fontSize: 15 }}>
                  {Number(x.date.slice(8))}
                </span>
                <p>
                  {x.name}
                  <small>
                    {shortDate(x.date)} {MEAL_NAME[x.meal]}
                    {x.nums.length ? ` · ${x.nums.join(".")}` : ""}
                  </small>
                </p>
                <Icon k="chev" />
              </button>
            ))
          ) : (
            <p className="sub" style={{ padding: "16px 4px" }}>
              지난 주~다음 주 식단에 없어요
            </p>
          )
        ) : (
          popular.length > 0 && (
            <>
              <p className="sub" style={{ padding: "6px 4px" }}>
                앞으로 나오는 점심
              </p>
              <div className="chips" style={{ marginTop: 6 }}>
                {popular.map((k) => (
                  <button key={k} className="chip" onClick={() => setV(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </>
          )
        )}
      </div>
    </>
  );
}

// ---------- 소식 ----------

export function BannersSheet({ list }: { list: readonly Banner[] }) {
  const { closeSheet } = useMobile();
  const banGo = useBannerGo();
  return (
    <>
      <h3>소식 {list.length}</h3>
      {list.map((b, i) => (
        <button
          key={i}
          className="sl press"
          style={{ display: "block", width: "100%", textAlign: "left", marginTop: 10, borderRadius: 18, padding: 18, background: b.bg }}
          onClick={() => {
            closeSheet();
            banGo(b);
          }}
        >
          <b style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35, display: "block" }}>
            {b.t[0]}
            <br />
            {b.t[1]}
          </b>
          <span className="sub" style={{ color: "var(--ink2)" }}>
            {b.d}
          </span>
        </button>
      ))}
    </>
  );
}

/** 식단 등록 상태로 만든 소식 (식당 홈페이지에 올라온 것만 말한다) */
export function useNotices(dorm: Dorm): (readonly [string, string])[] {
  const mondays = nearMondays();
  const [, cur, next] = useWeeks(dorm, mondays);
  const label = dormOf(dorm).label;
  const out: (readonly [string, string])[] = [];
  const today = kstToday();
  if (next.week) {
    const n = next.week.days.filter((d) => d.registered).length;
    out.push(
      n === 7
        ? [`다음 주 ${label} 식단이 올라왔어요`, `${shortDate(mondays[2])}부터 7일 모두 볼 수 있어요`]
        : n === 0
          ? [`다음 주 ${label} 식단은 아직이에요`, "올라오면 식단 탭에 바로 보여요. 보통 주 후반에 올라와요"]
          : [`다음 주 ${label} 식단이 ${n}일치 올라왔어요`, "나머지 날은 아직 미등록이에요"],
    );
  }
  const todayRow = cur.week?.days.find((d) => d.date === today);
  if (todayRow && !todayRow.registered) out.push([`오늘 ${label} 식단이 미등록이에요`, "식당 홈페이지에 아직 올라오지 않았어요"]);
  return out;
}

export function InboxSheet() {
  const { s } = useMobile();
  const notices = useNotices(s.dorm);
  const inApp = !!bridge();
  const pushed = inApp ? nativeInbox() : [];
  return (
    <>
      <h3>알림함</h3>
      <p className="sd">이 기기에 온 알림과 {dormOf(s.dorm).label} 소식</p>
      {pushed.length > 0 && (
        <>
          <p className="kid-h">받은 알림</p>
          {pushed.map((p) => (
            <div className="lr" key={`${p.at}-${p.title}`}>
              <span className="sq">
                <Icon k="bell" />
              </span>
              <p>
                {p.title}
                <small>
                  {p.body} · {KST_TIME.format(new Date(p.at))}
                </small>
              </p>
            </div>
          ))}
        </>
      )}
      <p className="kid-h">소식</p>
      {notices.length ? (
        notices.map(([t, d]) => (
          <div className="lr" key={t}>
            <span className="sq">
              <Icon k="mega" />
            </span>
            <p>
              {t}
              <small>{d}</small>
            </p>
          </div>
        ))
      ) : (
        <p className="sub mt">새 소식이 없어요.</p>
      )}
      {!inApp && <p className="sub mt">Android 앱에서 알림을 켜면 받은 알림도 여기에 모여요.</p>}
    </>
  );
}

// ---------- 운영시간 ----------

/** 생활관 홈페이지 식당이용안내의 식당이용시간 표 (입장 / 퇴장) */
const HOURS_TABLE = [
  ["학기", [["조식", "07:30~08:50", "09:00", "08:00~08:50", "09:00"], ["중식", "11:30~13:30", "14:00", "12:30~13:20", "13:30"], ["석식", "17:30~18:40", "18:50", "17:30~18:20", "18:30"]]],
  ["방학", [["조식", "08:00~08:50", "09:00", "08:00~08:50", "09:00"], ["중식", "12:00~13:20", "13:30", "12:30~13:20", "13:30"], ["석식", "17:30~18:20", "18:30", "17:30~18:20", "18:30"]]],
] as const;

export function HoursSheet() {
  return (
    <>
      <h3>식당 이용시간</h3>
      <p className="sd">생활관 홈페이지 식당이용안내 · 입장 시간 (퇴장)</p>
      {HOURS_TABLE.map(([term, rows]) => (
        <div key={term}>
          <p className="kid-h">{term}</p>
          {rows.map(([n, wIn, wOut, eIn, eOut]) => (
            <div className="lr" key={n}>
              <span className="sq">
                <Icon k="clock" />
              </span>
              <p>
                {n}
                <small>
                  평일 {wIn} ({wOut}) · 주말·공휴일 {eIn} ({eOut})
                </small>
              </p>
            </div>
          ))}
        </div>
      ))}
      <p className="sub" style={{ marginTop: 10 }}>
        앱의 &quot;지금·다음 밥&quot;은 학기 퇴장 시각을 기준으로 넘어가요.
      </p>
    </>
  );
}

// ---------- 식당 ----------

export const DORM_ICON: Record<Dorm, IconName> = { kb: "uni", sunglim: "house", surim: "school" };

export function DormSheet() {
  const { s, update, closeSheet, toast, setDormSel } = useMobile();
  return (
    <>
      <h3>내 식당 고르기</h3>
      <p className="sd">홈과 알림 기본값이 이 식당으로 바뀌어요</p>
      <div style={{ marginTop: 8 }}>
        {DORMS.map((d) => (
          <button
            key={d.id}
            className={`sch press${s.dorm === d.id ? " on" : ""}`}
            onClick={() => {
              haptic("select");
              update((x) => {
                x.dorm = d.id;
              });
              setDormSel(null);
              closeSheet();
              toast(`${d.label}으로 바꿨어요`);
            }}
          >
            <span className="sq">
              <Ico k={DORM_ICON[d.id]} size={30} />
            </span>
            <p>
              {d.label}
              <small>{d.sub} 학생 이용</small>
            </p>
            <span className="ck">
              <Icon k="check" />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- 앱 받기 ----------

/** 설치 안내: Android는 APK, 그 밖은 홈 화면에 추가 */
export function AppSheet() {
  const { pwa } = useMobile();
  const steps = pwa.ios
    ? [
        ["공유 버튼 누르기", "Safari 아래쪽(아이패드는 위쪽)의 공유 버튼을 눌러요"],
        ["홈 화면에 추가", "목록을 내려 [홈 화면에 추가]를 골라요"],
        ["추가", "오른쪽 위 [추가]를 누르면 홈 화면에 SsalTech가 생겨요"],
      ]
    : [
        ["APK 내려받기", "아래 버튼으로 SsalTech 앱 파일을 받아요"],
        ["설치 허용", "처음이면 [이 출처 허용]을 켜고 설치를 눌러요"],
        ["알림 켜기", "앱을 열고 가운데 알림 탭에서 알림을 허용해요"],
      ];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
        <img src="/assets/icon-192.png" alt="SsalTech 앱 아이콘" width={56} height={56} style={{ borderRadius: 14 }} />
        <div>
          <h3>{pwa.ios ? "홈 화면에 SsalTech 추가" : "Android 앱 받기"}</h3>
          <p className="sd" style={{ marginTop: 2 }}>
            {pwa.ios ? "주소창 없이 앱처럼 열리고, 본 식단은 오프라인에서도 보여요" : "정한 시각에 메뉴를 알림으로 받아요"}
          </p>
        </div>
      </div>
      {steps.map(([t, d], i) => (
        <div className="lr" key={t}>
          <span className="sq" style={{ fontWeight: 800, color: "var(--brand)" }}>
            {i + 1}
          </span>
          <p>
            {t}
            <small>{d}</small>
          </p>
        </div>
      ))}
      {pwa.ios ? (
        <p className="sub" style={{ marginTop: 12, fontSize: 13, color: "var(--ink2)" }}>
          iOS 16.4 이상에서 홈 화면에 추가하면 이 브라우저 알림을 받을 수 있어요. 앱을 꺼도 정확한 시각에 울리게 하려면 Android 앱을 써 주세요.
        </p>
      ) : (
        <a className="cta press" href={APK_URL} download style={{ display: "grid", placeItems: "center", marginTop: 16, textDecoration: "none" }}>
          SsalTech.apk 내려받기
        </a>
      )}
    </>
  );
}

// ---------- 터미널 버전 ----------

export function CliSheet() {
  const rows = [
    ["dorm-menu", "오늘 식단"],
    ["dorm-menu next", "다음 밥"],
    ["dorm-menu week", "이번 주 식단"],
    ["dorm-menu alarm add 내일 아침 21:00 kb", "매일 21:00에 내일 아침 메뉴를 터미널로 알림"],
  ] as const;
  return (
    <>
      <h3>터미널에서도 보기</h3>
      <p className="sd">SsalTech의 원조, C로 만든 dorm-menu 명령 (Linux·macOS·Solaris)</p>
      {rows.map(([c, d]) => (
        <div className="lr" key={c}>
          <span className="sq">
            <Icon k="clip" />
          </span>
          <p>
            <code style={{ fontSize: 14 }}>{c}</code>
            <small>{d}</small>
          </p>
        </div>
      ))}
      <a className="cta press" href={REPO_URL} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", marginTop: 16, textDecoration: "none" }}>
        GitHub에서 보기
      </a>
    </>
  );
}

// ---------- 데이터 ----------

export function DataSheet() {
  const rows: (readonly [IconName, string, string])[] = [
    ["cal", "식단", "생활관 홈페이지 식단표를 그대로 옮겨요. 서버는 식당·주만 받아 3~12시간 캐시해요"],
    ["lock", "알레르기·별점·알림 규칙", "이 기기에만 저장하고 서버로 보내지 않아요"],
    ["shield", "알레르기 표시", "식단표에 번호가 없어서 메뉴 이름으로 짐작해요. 소스·반죽 재료는 못 잡아요"],
    ["bell", "알림", "Android 앱이 정한 시각에 메뉴를 받아 이 기기에서 띄워요"],
  ];
  return (
    <>
      <h3>데이터는 이렇게 다뤄요</h3>
      {rows.map(([ic, t, d], i) => (
        <div className="lr st dsr" key={t} style={st(i)}>
          <span className="sq">
            <Icon k={ic} />
          </span>
          <p>
            {t}
            <small>{d}</small>
          </p>
        </div>
      ))}
      <p className="sub" style={{ marginTop: 8 }}>
        SsalTech는 학생이 만든 비공식 앱이에요. 정확한 식단은{" "}
        <a href={SITE_URL} target="_blank" rel="noreferrer">
          생활관 홈페이지
        </a>
        를 확인해 주세요.
      </p>
    </>
  );
}

// ---------- 내 기록 ----------

type Period = "w" | "m";

function periodDays(s: AppState, p: Period): Ymd[] {
  const today = kstToday();
  const from = p === "w" ? mondayOf(today) : today.slice(0, 8) + "01";
  return Object.keys(s.rates).filter((d) => d >= from && d <= today).sort();
}

export function ReportSheet() {
  const { s, go, closeSheet } = useMobile();
  const [p, setP] = useState<Period>("w");
  const days = periodDays(s, p);
  const list = days.flatMap((d) => Object.entries(s.rates[d]).map(([name, n]) => ({ d, name, n })));
  const avg = list.length ? list.reduce((a, x) => a + x.n, 0) / list.length : 0;
  const best = [...list].sort((a, b) => b.n - a.n || b.d.localeCompare(a.d)).slice(0, 5);
  const fav = favorites(s);
  const entries = useWeeks(s.dorm, nearMondays());
  const today = kstToday();
  const upcoming = entries
    .flatMap((e) => e.week?.days ?? [])
    .filter((d) => d.date >= today && d.registered)
    .flatMap((d) => MEALS.flatMap((m) => dishes(d.meals[m]).filter(([n]) => fav.has(n)).map(([n]) => ({ d: d.date, m, n }))));
  const alDays = entries
    .flatMap((e) => e.week?.days ?? [])
    .filter((d) => d.date >= today && MEALS.some((m) => hits(dishes(d.meals[m]), s.allergy).length)).length;
  return (
    <>
      <h3>내 기록</h3>
      <p className="sd">이 기기에 남긴 별점 · 서버로 보내지 않아요</p>
      <div className="seg3" role="tablist" aria-label="기간" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
        {(["w", "m"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={p === k} className={p === k ? "on" : ""} onClick={() => setP(k)}>
            {k === "w" ? "이번 주" : "이번 달"}
          </button>
        ))}
      </div>
      <div className="kc" style={{ marginTop: 14 }}>
        <span>별점 {list.length}개</span>
        <span>평균 {avg ? avg.toFixed(1) : "-"}점</span>
        <span>좋아하는 메뉴 {fav.size}개</span>
        {s.allergy.length > 0 && <span>앞으로 알레르기 주의 {alDays}일</span>}
      </div>
      <p className="kid-h">높게 준 메뉴</p>
      {best.length ? (
        best.map((x) => (
          <div className="lr" key={`${x.d}-${x.name}`}>
            <span className="sq" style={{ fontWeight: 800, color: "#FFB020" }}>
              {x.n}★
            </span>
            <p>
              {x.name}
              <small>{shortDate(x.d)}</small>
            </p>
          </div>
        ))
      ) : (
        <div className="lr">
          <span className="sq">
            <Mascot wave={false} />
          </span>
          <p>
            아직 별점이 없어요<small>오늘 탭 아래에서 메뉴마다 별점을 남길 수 있어요</small>
          </p>
        </div>
      )}
      <p className="kid-h">좋아하는 메뉴가 나오는 날</p>
      {upcoming.length ? (
        upcoming.slice(0, 8).map((x) => (
          <div className="lr" key={`${x.d}-${x.m}-${x.n}`}>
            <span className="sq">
              <Icon k="heart" />
            </span>
            <p>
              {x.n}
              <small>
                {shortDate(x.d)} {MEAL_NAME[x.m]}
              </small>
            </p>
          </div>
        ))
      ) : (
        <p className="sub mt">다음 주까지는 없어요. 4점 이상 준 메뉴가 다시 나오면 여기에 떠요.</p>
      )}
      <button
        className="more"
        onClick={() => {
          closeSheet();
          go("home", "rate");
        }}
      >
        오늘 메뉴 별점 남기러 가기
      </button>
    </>
  );
}

// ---------- 초기화 ----------

export function ResetSheet() {
  const { closeSheet, reset } = useMobile();
  return (
    <>
      <h3>기록을 지울까요?</h3>
      <p className="sd">이 기기의 식당·알레르기·별점·알림 규칙이 모두 지워져요</p>
      <div className="my-lo">
        <button className="my-cn press" onClick={closeSheet}>
          취소
        </button>
        <button
          className="cta press"
          onClick={() => {
            haptic("warn");
            reset();
          }}
        >
          지우기
        </button>
      </div>
    </>
  );
}
