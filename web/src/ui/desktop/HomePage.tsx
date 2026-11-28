"use client";

// 오늘 탭: 다음 밥 인사말, 메뉴 검색, 오늘 세 끼, 세 식당 비교, 알림·알레르기 안내.
import { DORMS, MEALS, MEAL_NAME, addDays, dormOf, hoursOf, kstMinute, mainDish, mondayOf, nextMeal, type Dorm, type Meal, type Ymd } from "@/lib/menu";
import { Ico, Mascot } from "../kit";
import { ShareButton, toShareMeal } from "../share";
import { APK_URL } from "../native";
import { DORM_ICON } from "../sheets";
import { favorites, hits, useDay, useWeeks } from "../store";
import { MEAL_ICO, Search, dayLabel, dur, fixedDishes, restOf, spanOf, st, useDesk } from "./shared";

/** 입장까지 남은 시간, 입장 중, 입장 마감 */
function countdown(date: Ymd, meal: Meal, today: Ymd, now: number): string {
  const hours = hoursOf(date, meal);
  const [a, b] = spanOf(hours);
  const m = kstMinute(now) - (date === today ? 0 : 1440);
  if (m < a) return `입장까지 ${dur(a - m)}`;
  if (m <= b) return `지금 입장 중 · ${hours.slice(6)}까지`;
  return "입장 마감 · 식사 중";
}

export function HomePage() {
  return (
    <>
      <Hello />
      <div className="st" style={st(2)}>
        <Search big />
      </div>
      <TodayMeals />
      <div className="duo">
        <Compare />
        <div className="stack">
          <AlarmBanner />
          <AllergyBanner />
        </div>
      </div>
    </>
  );
}

function Hello() {
  const { s, today, now, open, go, toast } = useDesk();
  const nm = nextMeal(now);
  const { day, loading, error } = useDay(s.dorm, nm.date);
  const text = day?.meals[nm.meal] ?? "";
  const main = mainDish(text);
  const hl = hits(fixedDishes(text), s.allergy);
  const fav = favorites(s);
  const label = `${dayLabel(nm.date, today)} ${MEAL_NAME[nm.meal]}`;
  const na = day && !day.registered;
  return (
    <section className="hello">
      <div className="txt">
        <p className="eyebrow st" style={st(0)}>
          <span className="live" />
          {countdown(nm.date, nm.meal, today, now)}
          <span className="sep" />
          {dormOf(s.dorm).label} · 입장 {hoursOf(nm.date, nm.meal)}
        </p>
        {main && !na ? (
          <h1 className="st" style={st(1)}>
            {label}은
            <br />
            <span className="hl">{main}</span> 나와요
            {fav.has(main) && (
              <em className="fav" aria-label="좋아하는 메뉴">
                ♥
              </em>
            )}
          </h1>
        ) : loading && !day ? (
          <h1 className="st sk" style={st(1)} aria-label="불러오는 중">
            <span />
            <span />
          </h1>
        ) : (
          <h1 className="st" style={st(1)}>
            {label}
            {na ? " 식단이" : "은"}
            <br />
            {na ? "아직 안 올라왔어요" : error ? "식단을 못 불러왔어요" : "밥이 안 나와요"}
          </h1>
        )}
        {main && !na && (
          <p className="rest st" style={st(2)}>
            {restOf(text, main)}
          </p>
        )}
        {hl.length > 0 && (
          <p className="warn st" style={st(3)}>
            <Ico k="shield" size={22} />
            {hl.map((x) => x[0]).join(", ")} · 알레르기 주의
          </p>
        )}
        <div className="acts st" style={st(3)}>
          <button className="cta" onClick={() => open(nm.date, nm.meal, s.dorm)}>
            식단표에서 보기
          </button>
          <ShareButton meal={toShareMeal(s.dorm, nm.date, nm.meal, text)} toast={toast} label="이 메뉴 공유" small={false} />
          <button className="ghost" onClick={() => go("my")}>
            내 식당 바꾸기
          </button>
        </div>
      </div>
      <div className="stage" aria-hidden="true">
        <span className="glow" />
        <Ico k="star" size={54} className="fl f1" />
        <Ico k="clock" size={50} className="fl f2" />
        <Ico k={MEAL_ICO[nm.meal]} size={64} className="fl f3" />
        <span className="steam">
          <i />
          <i />
          <i />
        </span>
        <Mascot className="moa" />
      </div>
    </section>
  );
}

function TodayMeals() {
  const { s, today, open, go } = useDesk();
  return (
    <section className="sec st" style={st(3)}>
      <div className="sh">
        <h2>오늘 세 끼</h2>
        <span>
          {dormOf(s.dorm).label} · {dayLabel(today, today)} {today.slice(5).replace("-", "/")}
        </span>
        <span className="sp" />
        <button className="link" onClick={() => go("menu")}>
          주간 식단표 →
        </button>
      </div>
      <div className="meals">
        {MEALS.map((m, i) => (
          <MealTile key={m} meal={m} i={i} onOpen={() => open(today, m, s.dorm)} />
        ))}
      </div>
    </section>
  );
}

function MealTile({ meal, i, onOpen }: { meal: Meal; i: number; onOpen: () => void }) {
  const { s, today, now } = useDesk();
  const { day, loading } = useDay(s.dorm, today);
  const text = day?.meals[meal] ?? "";
  const main = mainDish(text);
  const hit = hits(fixedDishes(text), s.allergy).length > 0;
  const fav = favorites(s);
  const hours = hoursOf(today, meal);
  const [a, b] = spanOf(hours);
  const m = kstMinute(now);
  const state = m > b ? "done" : m >= a ? "now" : "next";
  const chip = state === "done" ? "입장 마감" : state === "now" ? "지금 입장 중" : `${dur(a - m)} 뒤 입장`;
  return (
    <button className={`meal ${state}`} style={st(i + 4)} onClick={onOpen}>
      <span className="mt">
        <Ico k={MEAL_ICO[meal]} size={52} className="mi" />
        <b>{MEAL_NAME[meal]}</b>
        <em className="chip">{chip}</em>
      </span>
      {day && !day.registered ? (
        <h3 className="mute">미등록</h3>
      ) : main ? (
        <h3>
          {main}
          {fav.has(main) && <i className="heart"> ♥</i>}
        </h3>
      ) : (
        <h3 className="mute">{loading ? <span className="skl" /> : "메뉴 없음"}</h3>
      )}
      <p>{main ? restOf(text, main) : ""}</p>
      <span className="mf">
        <span>{hours}</span>
        {hit && <i className="warn">알레르기 주의</i>}
      </span>
    </button>
  );
}

function Compare() {
  const { today, now } = useDesk();
  const nm = nextMeal(now);
  return (
    <section className="sec cmpsec st" style={st(5)}>
      <div className="sh">
        <h2>세 식당 {dayLabel(nm.date, today)} {MEAL_NAME[nm.meal]}</h2>
        <span>식당별 메뉴 비교</span>
      </div>
      <div className="cmp">
        {DORMS.map((d, i) => (
          <CompareCol key={d.id} dorm={d.id} date={nm.date} meal={nm.meal} i={i} />
        ))}
      </div>
    </section>
  );
}

function CompareCol({ dorm, date, meal, i }: { dorm: Dorm; date: Ymd; meal: Meal; i: number }) {
  const { s, open } = useDesk();
  const { day, loading } = useDay(dorm, date);
  const text = day?.meals[meal] ?? "";
  const main = mainDish(text);
  const hit = hits(fixedDishes(text), s.allergy).length > 0;
  return (
    <button className={`col${s.dorm === dorm ? " mine" : ""}`} style={st(i + 6)} onClick={() => open(date, meal, dorm)}>
      <Ico k={DORM_ICON[dorm]} size={48} className="di" />
      <span className="dn">
        {dormOf(dorm).name}
        {s.dorm === dorm && <em>내 식당</em>}
      </span>
      <b>{day && !day.registered ? "미등록" : main || (loading ? "불러오는 중…" : "메뉴 없음")}</b>
      <p>{main ? restOf(text, main) : ""}</p>
      {hit && <i className="warn">알레르기 주의</i>}
    </button>
  );
}

function AlarmBanner() {
  const { s, go, pwa } = useDesk();
  const on = s.alarms.filter((a) => a.on).length;
  return (
    <section className="banner pink st" style={st(6)}>
      <div>
        <h3>
          정한 시각에
          <br />메뉴를 알림으로
        </h3>
        <p>{on ? `알림 규칙 ${on}개 · 이 브라우저나 Android 앱이 울려요` : "이 브라우저로도, Android 앱으로도 알림을 받을 수 있어요"}</p>
        <div className="acts">
          {!pwa.installed && (
            <a className="cta sm" href={APK_URL} download>
              Android 앱 받기
            </a>
          )}
          <button className="ghost sm" onClick={() => go("alarm")}>
            알림 규칙
          </button>
        </div>
      </div>
      <span className="bell" aria-hidden="true">
        <span className="ring" />
        <Ico k="bell" size={112} />
      </span>
    </section>
  );
}

function AllergyBanner() {
  const { s, today, go } = useDesk();
  const m = mondayOf(today);
  const entries = useWeeks(s.dorm, [m, addDays(m, 7)]);
  let count = 0;
  for (const e of entries)
    for (const d of e.week?.days ?? [])
      if (d.date >= today) for (const meal of MEALS) count += hits(fixedDishes(d.meals[meal]), s.allergy).length > 0 ? 1 : 0;
  return (
    <button className="banner lilac st" style={st(7)} onClick={() => go("allergy")}>
      <div>
        <h3>알레르기 체크</h3>
        <p>
          {s.allergy.length ? (
            <>
              앞으로 주의 메뉴 <b>{count}개</b> · {dormOf(s.dorm).name}
            </>
          ) : (
            "알레르기를 고르면 식단표에 빨갛게 표시해요"
          )}
        </p>
      </div>
      <Ico k="shield" size={84} className="sh3" />
    </button>
  );
}
