"use client";

// MY 탭 (WasteLess rMy): 모아 프로필과 기록 수, 알림·내 식당·알레르기·데이터·설치·초기화.
import { dormOf, nextMeal, MEAL_NAME } from "@/lib/menu";
import { useDay } from "../store";
import { ShareSheet, toShareMeal } from "../share";
import { useMobile } from "../app";
import { CountUp, haptic } from "../motion";
import { THEME_CHOICES } from "../theme";
import { APK_URL, bridge, useAppUpdate, type AppUpdate } from "../native";
import { AL, favorites, ratingCount } from "../store";
import { Ico, Icon, Mascot, st } from "../kit";
import { AppSheet, DORM_ICON, DataSheet, DormSheet, HoursSheet, InboxSheet, REPO_URL, ReportSheet, ResetSheet } from "../sheets";
import { AllergySheet } from "./AllergyView";

export function MyView() {
  const { s, sheet, closeSheet, go, pwa, toast, update } = useMobile();
  const dorm = dormOf(s.dorm);
  const nm = nextMeal();
  const { day: nday } = useDay(s.dorm, nm.date);
  const shareMeal = toShareMeal(dorm.id, nm.date, nm.meal, nday?.meals[nm.meal] ?? "");
  const app = bridge();
  const upd = useAppUpdate();
  const on = s.alarms.filter((a) => a.on).length;
  const installApp = async () => {
    if (!pwa.ios && /Android/i.test(navigator.userAgent)) {
      sheet(<AppSheet />);
      return;
    }
    const r = await pwa.install();
    if (r === "manual") sheet(<AppSheet />);
    else if (r === "dismissed") toast("설치는 나중에 MY에서 다시 할 수 있어요");
  };

  return (
    <>
      <div className="tbar">
        <h1>MY</h1>
        <button className="ib" onClick={() => sheet(<InboxSheet key={Date.now()} />)} aria-label="알림함">
          <Icon k="bellL" />
        </button>
      </div>
      <div className="prof st">
        <div className="row">
          <span className="av avin">
            <Mascot wave />
          </span>
          <div>
            <h2>
              {dorm.label}
              <span className="rl">{dorm.sub}</span>
            </h2>
            <p>서울과학기술대학교 생활관 · {s.allergy.length ? `알레르기 ${s.allergy.length}개` : "알레르기 없음"}</p>
          </div>
        </div>
        <div className="stat">
          <div>
            <b>
              <CountUp value={ratingCount(s)} />
            </b>
            <small>남긴 별점</small>
          </div>
          <div>
            <b>
              <CountUp value={on} />
            </b>
            <small>켜 둔 알림</small>
          </div>
          <div>
            <b>
              <CountUp value={favorites(s).size} />
            </b>
            <small>좋아하는 메뉴</small>
          </div>
        </div>
      </div>
      <div className="lc st" style={st(1)}>
        <h3>알림</h3>
        <button className="lr press" onClick={() => go("alarm")}>
          <span className="sq">
            <Icon k="bell" />
          </span>
          <p>
            {on ? `메뉴 알림 ${on}개 받는 중` : "메뉴 알림 받기"}
            <small>{app ? "앱을 닫아도 정한 시각에 메뉴가 와요" : "Android 앱에서 정한 시각에 울려요"}</small>
          </p>
          <Icon k="chev" />
        </button>
        <div style={{ height: 10 }}></div>
      </div>
      <div className="lc st" style={st(2)}>
        <h3>화면</h3>
        <div className="seg3" style={{ margin: "4px 0 14px" }} role="radiogroup" aria-label="화면 테마">
          {THEME_CHOICES.map(([t, name]) => (
            <button
              key={name}
              role="radio"
              aria-checked={s.theme === t}
              className={s.theme === t ? "on" : ""}
              onClick={() => {
                haptic("select");
                update((x) => {
                  if (t) x.theme = t;
                  else delete x.theme;
                });
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="lc st" style={st(2)}>
        <h3>내 정보</h3>
        <button className="lr press" onClick={() => sheet(<DormSheet />)}>
          <span className="sq">
            <Ico k={DORM_ICON[s.dorm]} size={28} />
          </span>
          <p>
            내 식당 변경
            <small>
              지금은 {dorm.label} · {dorm.sub}
            </small>
          </p>
          <Icon k="chev" />
        </button>
        <button className="lr press" onClick={() => sheet(<AllergySheet />)}>
          <span className="sq">
            <Icon k="shield" />
          </span>
          <p>
            알레르기 수정<small>{s.allergy.length ? s.allergy.map((n) => AL[n]).join(", ") : "없음"}</small>
          </p>
          <Icon k="chev" />
        </button>
        <button className="lr press" onClick={() => sheet(<HoursSheet />)}>
          <span className="sq">
            <Icon k="clock" />
          </span>
          <p>
            식당 이용시간<small>학기·방학, 평일·주말</small>
          </p>
          <Icon k="chev" />
        </button>
        <button className="lr press" onClick={() => sheet(<DataSheet key={Date.now()} />)}>
          <span className="sq">
            <Icon k="lock" />
          </span>
          <p>데이터는 이렇게 다뤄요</p>
          <Icon k="chev" />
        </button>
        <button className="lr press" onClick={() => sheet(<ShareSheet meal={shareMeal} toast={toast} onClose={closeSheet} />)}>
          <span className="sq"><Icon k="clip" /></span>
          <p>식단 공유하기<small>{nday?.registered ? `${MEAL_NAME[nm.meal]} · ${shareMeal.dish}` : "내 식당의 다음 밥"}</small></p>
          <Icon k="chev" />
        </button>
        {!app && !pwa.hasApp && (
          <button className="lr press" onClick={installApp}>
            <span className="sq">
              {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
              <img src="/assets/icon-192.png" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
            </span>
            <p>
              앱 설치<small>Android는 알림 되는 앱, iPhone·PC는 홈 화면에 추가</small>
            </p>
            <Icon k="chev" />
          </button>
        )}
        {app && upd && (
          <button
            className="lr press"
            disabled={upd.state === "downloading" || upd.state === "checking"}
            onClick={() => {
              if (upd.state === "available" || upd.state === "ready") app.startUpdate?.();
              else {
                app.checkUpdate?.();
                toast("새 버전이 있는지 확인할게요");
              }
            }}
          >
            <span className="sq">
              {/* eslint-disable-next-line @next/next/no-img-element -- static app icon */}
              <img src="/assets/icon-192.png" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
            </span>
            <p>
              {updTitle(upd)}
              <small>{updSub(upd)}</small>
            </p>
            {upd.state === "available" ? <span className="badge">NEW</span> : <Icon k="chev" />}
          </button>
        )}
        <button className="more" onClick={() => sheet(<ResetSheet />)}>
          이 기기 기록 지우기
        </button>
      </div>
      <div className="lc st" style={st(3)}>
        <h3>기록</h3>
        <button className="lr press" onClick={() => sheet(<ReportSheet key={Date.now()} />)}>
          <span className="sq">
            <Icon k="star" />
          </span>
          <p>
            주간·월간 내 기록<small>별점·좋아하는 메뉴·다가오는 날</small>
          </p>
          <Icon k="chev" />
        </button>
      </div>
      <p className="foot">
        SsalTech {app ? `Android ${app.version()}` : "웹"} · 학생이 만든 비공식 앱
        <br />
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          소스 코드
        </a>
        {!app && !pwa.hasApp && (
          <>
            {" · "}
            <a href={APK_URL} download>
              Android APK
            </a>
          </>
        )}
      </p>
    </>
  );
}

function updTitle(u: AppUpdate): string {
  switch (u.state) {
    case "available":
      return `새 버전 ${u.latest?.name ?? ""} 받기`;
    case "downloading":
      return `새 버전 받는 중 ${Math.round(u.progress * 100)}%`;
    case "ready":
    case "installing":
      return "설치 창에서 업데이트를 눌러 주세요";
    case "checking":
      return "새 버전 확인 중…";
    case "error":
      return u.error ?? "업데이트를 확인하지 못했어요";
    default:
      return "앱 업데이트";
  }
}

function updSub(u: AppUpdate): string {
  if (u.state === "available" && u.latest) {
    const kb = u.latest.size / 1024;
    const mb = u.latest.size ? ` · ${kb < 1024 ? `${Math.round(kb)}KB` : `${(kb / 1024).toFixed(1)}MB`}` : "";
    return `지금 ${u.current.name}${mb} · 앱 안에서 받아 설치해요`;
  }
  if (u.state === "downloading") return "다 받으면 설치 창이 떠요";
  if (u.state === "error") return "눌러서 다시 확인";
  return `지금 ${u.current.name} · 눌러서 새 버전 확인`;
}
