// 화면 테마(라이트·다크). 서버 레이아웃도 읽으므로 React 없이 둔다. 바꾸는 훅은 ui/theme.ts.
// <html data-theme="light|dark"> 와 color-scheme 을 정하고, CSS 는 html[data-theme="dark"] 아래에 다크 값을 둔다.

export const THEME_BG = { light: "#F3F4F7", dark: "#0F1115" } as const;

/** 첫 화면을 그리기 전에 <head>에서 돈다. 저장한 테마(ssaltech_v1.theme)가 없으면 기기 설정을 따른다. */
export const THEME_SCRIPT = `(function(){try{var t=(JSON.parse(localStorage.getItem("ssaltech_v1")||"{}")||{}).theme;var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.style.colorScheme=d?"dark":"light"}catch(x){}})()`;
