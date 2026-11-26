// 허브 트래커(t.js)가 오기 전에 쌓아 두는 이벤트. 계약의 ybkq 큐.
export function track(name: string, props?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  const ybk = window.ybk;
  if (ybk) ybk.track(name, props);
  else (window.ybkq = window.ybkq || []).push(props ? [name, props] : [name]);
}

declare global {
  interface Window {
    ybk?: { track: (name: string, props?: Record<string, string | number>) => void };
    ybkq?: Array<[string, Record<string, string | number>?]>;
  }
}
