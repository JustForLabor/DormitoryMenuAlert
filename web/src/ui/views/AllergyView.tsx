"use client";

// 알레르기 탭 (WasteLess rAllergy)과 고르기 시트. 생활관 식단표에는 알레르기 번호가 없어서
// 메뉴 이름으로 짐작한 번호(store.ts AL_WORDS)를 쓴다. 번호는 이 기기에만 저장한다.
import { useState } from "react";
import { MEALS, MEAL_NAME, WD, dayNum, dormOf, kstToday, shortDate, weekday, type Meal, type Ymd } from "@/lib/menu";
import { useMobile } from "../app";
import { CountUp, haptic, motion, Morph, vtName } from "../motion";
import { AL, dishes, hits, useWeeks, type Dish } from "../store";
import { Ico, Icon, Mascot, innerOf, st } from "../kit";
import { nearMondays } from "../sheets";

const SHIELD_PROP = `<g transform="translate(80 58) scale(.66)">${innerOf("shield")}</g>`;

export function AllergySheet({ onSave }: { onSave?: (al: number[]) => void }) {
  const { s, update, closeSheet, toast } = useMobile();
  const [tmp, setTmp] = useState<number[]>(() => [...s.allergy]);
  const [pop, setPop] = useState<{ n: number; k: number } | null>(null);
  return (
    <>
      <h3>알레르기 번호 고르기</h3>
      <p className="sd">이 기기에만 저장돼요 · 서버 전송 없음</p>
      <div className="chips" id="alc">
        {AL.slice(1).map((a, i) => (
          <button
            key={a}
            className={`chip ${tmp.includes(i + 1) ? "on" : ""}${pop?.n === i + 1 ? ` pop${pop.k % 2}` : ""}`}
            onClick={() => {
              haptic("select");
              setPop((p) => ({ n: i + 1, k: (p?.k ?? 0) + 1 }));
              setTmp((t) => (t.includes(i + 1) ? t.filter((x) => x !== i + 1) : [...t, i + 1]));
            }}
          >
            <i>{i + 1}</i>
            {a}
          </button>
        ))}
      </div>
      <button
        className="cta press"
        style={{ marginTop: 22 }}
        onClick={() => {
          const al = [...tmp].sort((a, b) => a - b);
          closeSheet();
          if (onSave) onSave(al);
          else
            motion("wl-swap-fade", () =>
              update((x) => {
                x.allergy = al;
              }),
            );
          toast("알레르기를 저장했어요");
        }}
      >
        저장하기
      </button>
    </>
  );
}

export function AllergyView() {
  const { s, sheet } = useMobile();
  const today = kstToday();
  const entries = useWeeks(s.dorm, nearMondays(today));
  const rows: [Ymd, Meal, Dish][] = [];
  for (const e of entries)
    for (const d of e.week?.days ?? []) {
      if (d.date < today || !d.registered) continue;
      for (const m of MEALS) for (const x of hits(dishes(d.meals[m]), s.allergy)) rows.push([d.date, m, x]);
    }
  const last = entries[2].week?.days.some((d) => d.registered) ? entries[2].week!.days[6].date : entries[1].week?.days[6].date;
  const seen = new Map<string, number>();
  const rowName = ([d, k, x]: (typeof rows)[number]) => {
    const id = `${d}-${k}-${x[0]}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return vtName("risk", n > 1 ? `${id}-${n}` : id);
  };

  return (
    <>
      <div className="tbar">
        <h1>알레르기</h1>
        <button className="pbtn press" onClick={() => sheet(<AllergySheet />)}>
          수정
        </button>
      </div>
      <div className="ahero st">
        <h2>
          {s.allergy.length ? (
            <>
              올라온 식단 중에
              <br />
              <em>
                <CountUp value={rows.length} />건
              </em>{" "}
              주의가 필요해요
            </>
          ) : (
            <>
              등록한 알레르기가
              <br />
              아직 없어요
            </>
          )}
        </h2>
        <p>메뉴 이름에 든 재료 낱말로 이 기기 안에서 짐작해요.</p>
        <div className="ill">
          <Mascot wave={false} prop={SHIELD_PROP} />
        </div>
      </div>
      <div className="card st" style={st(1)}>
        <div className="ch">
          <h3>
            <Ico k="shield" size={24} />내 알레르기
          </h3>
          <button className="pbtn press" onClick={() => sheet(<AllergySheet />)}>
            <Icon k="plus" />
            추가
          </button>
        </div>
        <div className="chips">
          {s.allergy.length ? (
            s.allergy.map((n) => (
              <Morph key={n} name={vtName("al", n)}>
                <span className="chip mine">
                  <i>{n}</i>
                  {AL[n]}
                </span>
              </Morph>
            ))
          ) : (
            <p className="sub">수정을 눌러 번호를 골라 주세요.</p>
          )}
        </div>
      </div>
      <div className="card st" style={st(2)}>
        <h3>
          <Ico k="cal" size={24} />
          앞으로 주의할 메뉴
        </h3>
        <p className="sub">
          {shortDate(today)} ~ {last ? shortDate(last) : "…"} · {dormOf(s.dorm).label} · 메뉴 이름으로 짐작
        </p>
        <div style={{ marginTop: 6 }}>
          {rows.length ? (
            rows.map((r) => {
              const [d, k, x] = r;
              const name = rowName(r);
              return (
                <Morph key={name} name={name}>
                  <div className="risk">
                    <span className="d">
                      <small>{WD[weekday(d)]}</small>
                      <b>{dayNum(d)}</b>
                    </span>
                    <p>
                      {x[0]}
                      <small>
                        {MEAL_NAME[k]} ·{" "}
                        {x[1]
                          .filter((n) => s.allergy.includes(n))
                          .map((n) => `${n} ${AL[n]}`)
                          .join(", ")}
                      </small>
                    </p>
                    <span className="alt no">확인 필요</span>
                  </div>
                </Morph>
              );
            })
          ) : (
            <p className="sub" style={{ padding: "14px 0" }}>
              {s.allergy.length ? "이름으로 짐작되는 주의 메뉴가 없어요." : "알레르기를 고르면 여기에 주의 메뉴가 떠요."}
            </p>
          )}
        </div>
      </div>
      <div className="lock st" style={st(3)}>
        <Icon k="lock" />
        <div>
          <b>짐작일 뿐이에요</b>생활관 식단표에는 알레르기 번호가 없어요. 소스·반죽·육수 재료는 이름에 안 드러나니, 심한
          알레르기는 식당에 꼭 물어보세요. 번호는 이 기기에만 저장돼요.
        </div>
      </div>
      <div className="card st" style={st(4)}>
        <div className="ch">
          <h3>알레르기 유발 식품 번호</h3>
        </div>
        <p className="sub">식단 옆 숫자는 아래 번호를 뜻해요</p>
        <div className="nt">
          {AL.slice(1).map((a, i) => (
            <span key={a} className={s.allergy.includes(i + 1) ? "on" : ""}>
              <b>{i + 1}</b>
              {a}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
