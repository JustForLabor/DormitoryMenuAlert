// 허브 트래커(t.js)가 오기 전에 쌓아 두는 이벤트. 계약의 ybkq 큐.
export function track(name: string, props?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  const ybk = window.ybk;
  if (ybk) ybk.track(name, props);
  else (window.ybkq = window.ybkq || []).push(props ? [name, props] : [name]);
}

/** 별점 하나를 허브로 보낸다. 허브는 (방문자, 날짜, 메뉴)마다 마지막 점수만 남긴다. */
export function trackRate(r: { dorm: string; date: string; meal: string; dish: string; n: number }) {
  track("rate", { dorm: r.dorm, date: r.date, meal: r.meal, dish: r.dish, n: r.n });
}

declare global {
  interface Window {
    ybk?: { track: (name: string, props?: Record<string, string | number>) => void };
    ybkq?: Array<[string, Record<string, string | number>?]>;
  }
}
