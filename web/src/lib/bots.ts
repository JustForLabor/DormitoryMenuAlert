// 링크 미리보기를 만드는 크롤러. 카카오톡·다음 앱 안 브라우저(UA 에 KAKAOTALK, DaumApps)는 사람이므로 스크래퍼 이름(kakaotalk-scrap, Daumoa)만 거른다.
export const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|kakaotalk-scrap|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|Googlebot|bingbot|Yeti|Daumoa|preview/i;

/** 공유 페이지(/s/…)에서 앱 주소로 넘길 때 함께 넘기는 쿼리. */
export const CARRY_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "ui"] as const;
