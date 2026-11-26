/* menu.h - 기숙사 식단 알리미 공용 선언 */
#ifndef MENU_H
#define MENU_H

#include <stddef.h>
#include <time.h>

#define SITE_HOST "housing.seoultech.ac.kr"
#define SITE_PATH "/livng/dining"

enum meal { BREAKFAST, LUNCH, DINNER, MEAL_COUNT };

#define MENU_MAX 512

struct day_menu {
    int year, month, day; /* 달력 날짜 */
    int wday;             /* 0=일 ... 6=토 */
    int registered;       /* 0이면 사이트에 "미등록" */
    char meal[MEAL_COUNT][MENU_MAX];
};

/* 사이트는 POST로 보낸 날짜부터 7일을 보여 준다. 항상 월요일 기준으로 요청한다. */
struct week_menu {
    struct day_menu day[7];
};

/* 알림 규칙 하나: 매일 minute 시각에, (그날 + day_offset)의 meal 메뉴를 알린다.
 * 예) 내일 아침 21:00 -> day_offset 1, BREAKFAST, 1260 */
struct alarm_rule {
    int day_offset;  /* 0=오늘, 1=내일 */
    enum meal meal;
    int minute;      /* 자정 기준 분: 21:00 -> 1260 */
    char dorm[16];   /* kb | sunglim | surim (필수) */
};

#define ALARM_MAX 32
struct alarm_set {
    int n;
    struct alarm_rule r[ALARM_MAX];
};

struct config {
    char dorm[16];                 /* kb | sunglim | surim */
    char tty[64];                  /* 비어 있으면 utmpx에서 내 터미널을 모두 찾는다 */
};

/* date.c */
time_t date_make(int year, int month, int day, int hour, int min);
time_t date_monday(time_t t);               /* t가 속한 주의 월요일 00:00 */
time_t date_add_days(time_t t, int days);
int date_parse(const char *s, time_t *out); /* YYYY-MM-DD */
const char *weekday_name(int wday);
const char *meal_name(enum meal m);

/* config.c */
const char *home_dir(void);
int program_locate(const char *argv0);   /* main 시작 때 한 번 */
const char *program_path(void);
void config_path(char *buf, size_t size); /* 실행 파일 폴더/dorm_menurc */
int dorm_valid(const char *dorm);
const char *dorm_label(const char *dorm);
int config_load(struct config *cfg);

/* alarm.c */
int alarm_parse_day(const char *s, int *day_offset);
int alarm_parse_meal(const char *s, enum meal *m);
int alarm_load(struct alarm_set *set);
int alarm_command(int argc, char *argv[]); /* add | list | del */

/* fetch.c */
int fetch_week_html(const char *dorm, time_t monday, char **out, size_t *len);

/* https.c */
int https_post(const char *host, const char *path, const char *form, int out_fd);

/* cache.c */
int cache_dir(char *buf, size_t size);
int week_get(const char *dorm, time_t monday, int force, struct week_menu *wk);

/* parse.c */
int parse_week(const char *html, time_t monday, struct week_menu *wk);
int week_any_registered(const struct week_menu *wk);
int week_all_registered(const struct week_menu *wk);

/* display.c */
void print_day(const struct day_menu *d, int today);

/* notify.c */
void next_meal(time_t now, time_t *day, enum meal *m);
int format_meal(const char *dorm, time_t day, enum meal m, int force,
                char *title, size_t title_size, char *body, size_t body_size);
int notify_send(const struct config *cfg, const char *title, const char *body);

/* daemon.c */
int daemon_run(const struct config *cfg, int foreground);
int daemon_stop(void);
int daemon_reload(void); /* 실행 중인 상주 모드에 SIGHUP. 1이면 보냄 */

#endif
