"use client";

// 오늘 탭 (WasteLess 대학 홈 rHomeU를 생활관 식당용으로): 다음 밥 인사, 굴러가는 메뉴 검색, 내 식당, 소식,
// 바로가기, 오늘·내일 메뉴 카드와 별점.
import { Fragment, useState } from "react";
import { MEALS, MEAL_NAME, addDays, dormOf, hoursOf, kstMinute, kstToday, mainDish, menuItems, nextMeal, shortDate, type DayMenu, type Meal, type Ymd } from "@/lib/menu";
import { useMobile } from "../app";
import { PullToRefresh } from "../motion";
import { bridge } from "../native";
import { dishes, hits, refreshWeeks, useWeeks } from "../store";
import { AlTile, BanBlock, CrRow, HitBox, Hdr, Ico, Icon, IgBlock, Mascot, RateBlock, Roll, st, type Banner } from "../kit";
import { AppSheet, CliSheet, DORM_ICON, DormSheet, HoursSheet, InboxSheet, ReportSheet, SearchSheet, nearMondays, useNotices } from "../sheets";
import { ShareSheet, toShareMeal } from "../share";

const startMin = (range: string) => {
  const [h, m] = range.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

/** 메뉴 상태: 끝남 / 지금(입장 중) / 다음 */
function tagOf(date: Ymd, meal: Meal, next: { date: Ymd; meal: Meal }): string | undefined {
  if (date !== next.date) return date < next.date ? "끝" : undefined;
  const i = MEALS.indexOf(meal);
  const n = MEALS.indexOf(next.meal);
  if (i < n) return "끝";
  if (i > n) return undefined;
  return date === kstToday() && kstMinute() >= startMin(hoursOf(date, meal)) ? "지금" : "다음";
}

function MealRows({ day, next }: { day: DayMenu; next: { date: Ymd; meal: Meal } }) {
  if (!day.registered) {
    return (
      <div className="cr">
        <span className="cn">미등록</span>
        <p>
          아직 올라오지 않았어요<small>생활관 홈페이지에 올라오면 바로 보여요</small>
        </p>
      </div>
    );
  }
  return MEALS.map((m) => {
    const text = day.meals[m];
    const main = mainDish(text);
    const rest = menuItems(text)
      .filter((x) => x !== main && !x.startsWith("선택식"))
      .slice(0, 4)
      .join(" · ");
    return <CrRow key={m} meal={m} main={main || "운영 안 함"} rest={rest} time={hoursOf(day.date, m)} tag={tagOf(day.date, m, next)} />;
  });
}

export function HomeView() {
  const { s, go, sheet, closeSheet, setSel, setMView, setDormSel, toast } = useMobile();
  const [rev, setRev] = useState(0);
  const dorm = dormOf(s.dorm);
  const today = kstToday();
  const tomorrow = addDays(today, 1);
  const nm = nextMeal();
  const mondays = nearMondays(today);
  const entries = useWeeks(s.dorm, mondays);
  const days = entries.flatMap((e) => e.week?.days ?? []);
  const dayOf = (d: Ymd) => days.find((x) => x.date === d);
  const tday = dayOf(today);
  const tmr = dayOf(tomorrow);
  const nday = dayOf(nm.date);
  const curWeek = entries[1];
  const notices = useNotices(s.dorm);
  const inApp = !!bridge();
  const nmLabel = `${nm.date === today ? "오늘" : "내일"} ${MEAL_NAME[nm.meal]}`;
  const pick = nday?.registered ? mainDish(nday.meals[nm.meal]) : "";
  const upcoming = days.filter((d) => d.date >= today);
  const alCount = upcoming.reduce((a, d) => a + MEALS.reduce((b, m) => b + hits(dishes(d.meals[m]), s.allergy).length, 0), 0);
  const onAlarms = s.alarms.filter((a) => a.on).length;

  const openMenu = (d: Ymd, view: "w" | "m" = "w") => {
    setSel(d);
    setDormSel(null);
    setMView(view);
    go("menu");
  };

  const roll: [string, string][] = [];
  for (const [d, label] of [
    [tday, "오늘"],
    [tmr, "내일"],
  ] as const) {
    if (!d?.registered) continue;
    for (const m of MEALS) {
      const main = mainDish(d.meals[m]);
      if (main) roll.push([main, `${label} ${MEAL_NAME[m]}`]);
    }
  }

  const banners: Banner[] = [
    {
      bg: "linear-gradient(120deg,#FFE1EA,#FFD2DE)",
      t: ["정한 시각에", "메뉴를 알림으로"],
      d: onAlarms ? `알림 ${onAlarms}개 켜져 있어요` : "Android 앱에서 매일 받아요",
      ill: "bell",
      size: 116,
      go: "alarm",
    },
    {
      bg: "linear-gradient(120deg,#DDF6EA,#CDEFF0)",
      t: ["이번 달 식단을", "달력으로 한눈에"],
      d: "올라온 주까지 날짜별로 보여요",
      ill: "cal",
      size: 116,
      go: () => openMenu(today, "m"),
    },
    {
      bg: "linear-gradient(120deg,#E7E8FF,#E0D9FF)",
      t: ["알레르기 메뉴를", "미리 짚어 드려요"],
      d: "메뉴 이름으로 짐작해 빨갛게 표시해요",
      ill: "shield",
      size: 116,
      go: "allergy",
    },
    {
      bg: "linear-gradient(120deg,#FFF1C9,#FFE4B8)",
      t: ["좋아하는 메뉴가", "나오는 날을 기억해요"],
      d: "별점 4점 이상 준 메뉴에 ♥가 붙어요",
      ill: "moa",
      size: 116,
      go: () => sheet(<ReportSheet key={Date.now()} />),
    },
    {
      bg: "linear-gradient(120deg,#E3EEFF,#D6E4FF)",
      t: ["터미널에서도", "dorm-menu 한 줄이면"],
      d: "SsalTech의 원조, C로 만든 명령줄 버전",
      ill: "clip",
      size: 110,
      go: () => sheet(<CliSheet />),
    },
  ];

  const refresh = async () => {
    await refreshWeeks(s.dorm, mondays);
    setRev((r) => r + 1);
    toast("방금 새로 불러왔어요");
  };

  let greet;
  if (pick) {
    greet = (
      <>
        {nmLabel}은
        <br />
        <span className="hl">{pick}</span> 나와요
      </>
    );
  } else if (nday && !nday.registered) {
    greet = (
      <>
        {nmLabel} 식단은
        <br />
        <span className="hl">아직 미등록</span>이에요
      </>
    );
  } else if (curWeek.error && !curWeek.week) {
    greet = (
      <>
        식단을
        <br />
        <span className="hl">못 불러왔어요</span>
      </>
    );
  } else {
    greet = (
      <>
        {nmLabel} 식단을
        <br />
        불러오는 중이에요
      </>
    );
  }

  const fetched = curWeek.week ? new Date(curWeek.week.fetchedAt) : null;

  return (
    <PullToRefresh onRefresh={refresh}>
      <Fragment key={rev}>
        <header className="hhead">
          <Hdr />
          <h1 className="greet st">
            {greet}
            <small>
              {shortDate(nm.date)} · {dorm.label} · 입장 {hoursOf(nm.date, nm.meal)}
              {curWeek.stale ? " · 저장된 식단" : ""}
            </small>
          </h1>
          <button type="button" className="pbtn press" style={{ margin: "8px 18px 0", alignSelf: "flex-start" }} onClick={() => sheet(<ShareSheet meal={toShareMeal(s.dorm, nm.date, nm.meal, nday?.meals[nm.meal] ?? "")} toast={toast} onClose={closeSheet} />)}>
            이 메뉴 공유
          </button>
          <div className="peek">
            <Mascot />
          </div>
          <Roll items={roll} />
        </header>
        <button className="prow press" onClick={() => sheet(<DormSheet />)}>
          <span className="av">
            <Ico k={DORM_ICON[s.dorm]} size={30} />
          </span>
          <p>
            내 식당 · {dorm.sub} 학생 이용
            <b>{dorm.label}</b>
          </p>
          <Icon k="chev" />
        </button>
        <BanBlock list={banners} />
        {notices.length > 0 && (
          <button className="notice press" onClick={() => sheet(<InboxSheet key={Date.now()} />)}>
            <span className="pill">소식</span>
            <span>{notices[0][0]}</span>
          </button>
        )}
        <div className="qg">
          <div className="ql">
            <button className="qb press st" style={st(4)} onClick={() => openMenu(today)}>
              <b>오늘 메뉴</b>
              <Icon k="tray" />
            </button>
            <button className="qb press st" style={st(5)} onClick={() => openMenu(nm.date)}>
              <b>다음 밥</b>
              <Icon k="bowl" />
            </button>
            <button className="qs press st" style={st(6)} onClick={() => go("alarm")}>
              <span className="tile">
                <Icon k="bell" />
              </span>
              <span>알림</span>
            </button>
            <button className="qs press st" style={st(7)} onClick={() => sheet(<HoursSheet />)}>
              <span className="tile">
                <Icon k="clock" />
              </span>
              <span>운영시간</span>
            </button>
            <button className="qs press st" style={st(8)} onClick={() => sheet(<DormSheet />)}>
              <span className="tile">
                <Icon k="house" />
              </span>
              <span>식당</span>
            </button>
          </div>
          <AlTile count={alCount} />
        </div>
        <section className="sec">
          <div className="sech">
            <h2>생활관 식당</h2>
            <button className="pbtn press" onClick={() => sheet(<SearchSheet />)}>
              <Icon k="search" />
              메뉴 검색
            </button>
          </div>
          <IgBlock
            items={[
              { icon: "cal", label: "주간 식단", onClick: () => openMenu(today) },
              { icon: "chart", label: "월간 달력", onClick: () => openMenu(today, "m") },
              { icon: "bowl", label: "다음 밥", onClick: () => openMenu(nm.date) },
              { icon: "bell", label: "알림", onClick: () => go("alarm"), badge: onAlarms ? `${onAlarms}개` : undefined, tone: "r" },
              { icon: "clock", label: "운영시간", onClick: () => sheet(<HoursSheet />) },
              { icon: "shield", label: "알레르기", onClick: () => go("allergy") },
              { icon: "star", label: "내 기록", onClick: () => sheet(<ReportSheet key={Date.now()} />) },
              { icon: "mega", label: "소식", onClick: () => sheet(<InboxSheet key={Date.now()} />), badge: notices.length ? "NEW" : undefined, tone: "live" },
              { icon: "gift", label: inApp ? "터미널" : "앱 받기", onClick: () => sheet(inApp ? <CliSheet /> : <AppSheet />) },
              { icon: "uni", label: "식당 변경", onClick: () => sheet(<DormSheet />) },
            ]}
          />
        </section>
        <div className="card st" id="today" style={{ marginTop: 22 }}>
          <div className="ch">
            <div>
              <h3>
                <Ico k="tray" size={24} />
                오늘 {dorm.name}
              </h3>
              <p className="sub">{shortDate(today)} · 입장 시간</p>
            </div>
          </div>
          {tday ? (
            <>
              <HitBox list={MEALS.flatMap((m) => dishes(tday.meals[m]))} size={28} />
              <MealRows day={tday} next={nm} />
              {tday.registered && (
                <RateBlock
                  date={today}
                  names={[...new Set(MEALS.map((m) => mainDish(tday.meals[m])).filter(Boolean))]}
                  title="오늘 메뉴 어땠어요?"
                />
              )}
            </>
          ) : (
            <p className="sub" style={{ marginTop: 12 }}>
              {curWeek.error ? `식단을 못 불러왔어요 · ${curWeek.error}` : "불러오는 중이에요…"}
            </p>
          )}
        </div>
        {tmr && (
          <div className="card st" id="tomorrow">
            <div className="ch">
              <div>
                <h3>
                  <Ico k="bowl" size={24} />
                  내일 {dorm.name}
                </h3>
                <p className="sub">{shortDate(tomorrow)} · 입장 시간</p>
              </div>
              <button className="pbtn press" onClick={() => openMenu(tomorrow)}>
                전체 메뉴
              </button>
            </div>
            <MealRows day={tmr} next={nm} />
          </div>
        )}
        <div className="lc st">
          <h3>SsalTech 더 알차게</h3>
          <button className="lr press" onClick={() => go("alarm")}>
            <span className="sq">
              <Icon k="bell" />
            </span>
            <p>
              {onAlarms ? `알림 ${onAlarms}개 받는 중` : "다음 밥 알림 켜기"}
              <small>매일 정한 시각에 메뉴를 보내 드려요</small>
            </p>
            <Icon k="chev" />
          </button>
          {!inApp && (
            <button className="lr press" onClick={() => sheet(<AppSheet />)}>
              <span className="sq">
                {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
                <img src="/assets/icon-192.png" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
              </span>
              <p>
                앱으로 받기<small>Android 앱 · iPhone은 홈 화면에 추가</small>
              </p>
              <Icon k="chev" />
            </button>
          )}
          <button className="lr press" onClick={() => sheet(<CliSheet />)}>
            <span className="sq">
              <Icon k="clip" />
            </span>
            <p>
              터미널에서 보기<small>dorm-menu 명령 · Linux·macOS·Solaris</small>
            </p>
            <Icon k="chev" />
          </button>
        </div>
        <p className="foot">
          식단 출처: 서울과학기술대학교 생활관 홈페이지
          {fetched && ` · ${fetched.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 확인`}
          <br />
          SsalTech · 학생이 만든 비공식 앱
        </p>
      </Fragment>
    </PullToRefresh>
  );
}
