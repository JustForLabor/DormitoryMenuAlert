/** 서버가 그린 첫 화면을 앱이 올라온 뒤 치운다. 크롤러는 그 내용을 본다. */
export function hideSsrHome() {
  if (typeof document === "undefined") return;
  document.getElementById("ssr-home")?.remove();
}
