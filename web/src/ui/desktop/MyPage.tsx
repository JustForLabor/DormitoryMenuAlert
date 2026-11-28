"use client";

// MY 탭: 내 식당, 내 기록(별점·좋아하는 메뉴), 이용 시간, 앱·정보, 이 기기 기록 지우기.
import { DORMS, HOURS, MEALS, MEAL_NAME, SITE_URL, dormOf, nextMeal, shortDate } from "@/lib/menu";
import { ShareButton, toShareMeal } from "../share";
import { useDay } from "../store";
import { STAR_OFF, STAR_ON } from "../icons";
import { Ico, Svg } from "../kit";
import { CountUp } from "../motion";
import { APK_URL } from "../native";
import { DORM_ICON, REPO_URL } from "../sheets";
import { favorites, ratingCount } from "../store";
import { THEME_CHOICES } from "../theme";
import { Seg, st, useDesk } from "./shared";

export function MyPage() {
  const { s, update, setView, toast, reset, pwa } = useDesk();
  const nm = nextMeal();
  const { day } = useDay(s.dorm, nm.date);
  const installApp = async () => {
    const r = await pwa.install();
    if (r === "manual") toast(pwa.ios ? "Safari 공유 → 홈 화면에 추가를 눌러 주세요" : "브라우저 메뉴에서 앱 설치를 눌러 주세요");
    else if (r === "dismissed") toast("설치를 나중에 할 수 있어요");
  };
  const fav = [...favorites(s)];
  const recent = Object.entries(s.rates)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .flatMap(([date, r]) => Object.entries(r).map(([name, n]) => ({ date, name, n })))
    .slice(0, 10);
  return (
    <>
      <header className="ph st" style={st(0)}>
        <div>
          <h1>MY</h1>
          <p>설정과 기록은 이 브라우저(localStorage)에만 저장돼요. 로그인은 없어요.</p>
        </div>
      </header>
      <section className="sec st" style={st(1)}>
        <div className="sh">
          <h2>{pwa.installed ? "공유" : "공유 · 설치"}</h2>
          <span>{pwa.installed ? "다음 메뉴를 친구에게 보내요" : "식단을 보내고, 홈 화면에 둘 수 있어요"}</span>
        </div>
        <div className="acts">
          <ShareButton meal={toShareMeal(s.dorm, nm.date, nm.meal, day?.meals[nm.meal] ?? "")} toast={toast} label="다음 메뉴 공유" />
          {!pwa.installed && (
            <>
              <button type="button" className="cta sm" onClick={() => void installApp()}>
                {pwa.ios ? "홈 화면에 추가" : "앱으로 설치"}
              </button>
              <a className="cta sm" href={APK_URL} download>Android 앱 받기</a>
            </>
          )}
        </div>
      </section>

      <section className="sec st" style={st(1)}>
        <div className="sh">
          <h2>화면</h2>
          <span>기기 설정을 따르거나 라이트·다크를 고를 수 있어요</span>
        </div>
        <Seg
          label="화면 테마"
          value={s.theme ?? "system"}
          onChange={(v: string) =>
            update((x) => {
              if (v === "light" || v === "dark") x.theme = v;
              else delete x.theme;
            })
          }
          items={THEME_CHOICES.map(([t, name]) => [t ?? "system", name])}
        />
      </section>

      <section className="sec st" style={st(1)}>
        <div className="sh">
          <h2>내 식당</h2>
          <span>오늘 화면과 알림 추천에 쓰여요</span>
        </div>
        <div className="dormpick">
          {DORMS.map((d, i) => (
            <button
              key={d.id}
              className={s.dorm === d.id ? "on" : ""}
              style={st(i)}
              aria-pressed={s.dorm === d.id}
              onClick={() => {
                update((x) => void (x.dorm = d.id));
                setView(d.id);
                toast(`${d.name}을 내 식당으로 정했어요`);
              }}
            >
              <Ico k={DORM_ICON[d.id]} size={64} />
              <b>{d.label}</b>
              <small>{d.sub} 학생 이용</small>
              <span className="ck" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <div className="stats st" style={st(2)}>
        <div>
          <Ico k="star" size={48} />
          <b>
            <CountUp value={ratingCount(s)} />
          </b>
          <small>남긴 별점</small>
        </div>
        <div>
          <Ico k="trophy" size={48} />
          <b>
            <CountUp value={fav.length} />
          </b>
          <small>좋아하는 메뉴</small>
        </div>
        <div>
          <Ico k="bell" size={48} />
          <b>
            <CountUp value={s.alarms.filter((a) => a.on).length} />
          </b>
          <small>켜진 알림 규칙</small>
        </div>
        <div>
          <Ico k="shield" size={48} />
          <b>
            <CountUp value={s.allergy.length} />
          </b>
          <small>고른 알레르기</small>
        </div>
      </div>

      <div className="duo">
        <section className="sec st" style={st(3)}>
          <div className="sh">
            <h2>내 기록</h2>
            <span>식단표에서 지난 메뉴를 고르면 별점을 남길 수 있어요</span>
          </div>
          {fav.length > 0 && (
            <div className="favs">
              {fav.map((x, i) => (
                <span key={x} style={st(i)}>
                  ♥ {x}
                </span>
              ))}
            </div>
          )}
          {recent.length ? (
            <ul className="recent">
              {recent.map((r, i) => (
                <li key={`${r.date}-${r.name}`} style={st(i)}>
                  <small>{shortDate(r.date)}</small>
                  <b>{r.name}</b>
                  <span className="stars ro" aria-label={`${r.n}점`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Svg key={n} html={r.n >= n ? STAR_ON : STAR_OFF} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="none">아직 남긴 별점이 없어요.</p>
          )}
        </section>

        <div className="stack">
          <section className="sec st" style={st(4)}>
            <div className="sh">
              <h2>이용 시간</h2>
              <span>입장 기준</span>
            </div>
            <table className="hours">
              <thead>
                <tr>
                  <th />
                  <th>평일</th>
                  <th>주말</th>
                </tr>
              </thead>
              <tbody>
                {MEALS.map((m) => (
                  <tr key={m}>
                    <th>{MEAL_NAME[m]}</th>
                    <td>{HOURS.weekday[m]}</td>
                    <td>{HOURS.weekend[m]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="sec st" style={st(5)}>
            <div className="sh">
              <h2>앱·정보</h2>
            </div>
            <ul className="links">
              {!pwa.installed && (
                <li>
                  <a href={APK_URL} download>
                    Android 앱 받기 (APK)<span>→</span>
                  </a>
                </li>
              )}
              <li>
                <a href="/?ui=mobile">
                  휴대폰 화면으로 보기<span>→</span>
                </a>
              </li>
              <li>
                <a href={SITE_URL} target="_blank" rel="noreferrer">
                  서울과기대 생활관 식단 원문<span>↗</span>
                </a>
              </li>
              <li>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  GitHub 소스<span>↗</span>
                </a>
              </li>
              <li>
                <button
                  className="danger"
                  onClick={() => {
                    if (!window.confirm("이 브라우저에 남은 내 식당·알레르기·별점·알림 규칙을 모두 지울까요?")) return;
                    reset();
                    toast("이 기기 기록을 지웠어요");
                  }}
                >
                  이 기기 기록 지우기<span>×</span>
                </button>
              </li>
            </ul>
            <p className="fine">식단을 그대로 옮겨 보여 주는 비공식 앱이에요. 알레르기는 메뉴 이름으로 짐작해요.</p>
          </section>
        </div>
      </div>
    </>
  );
}
