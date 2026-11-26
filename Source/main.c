/* main.c - dorm-menu: 서울과기대 생활관 식단 알리미 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "menu.h"

static void usage(void)
{
    fprintf(stderr, "사용법은 dorm-menu help 로 볼 수 있습니다\n");
}

/* dorm-menu help : 사용 설명서 */
static void manual(void)
{
    printf(
        "dorm-menu : 서울과기대 생활관 식단 알리미\n"
        "\n"
        "사용법: dorm-menu [옵션] [명령]\n"
        "\n"
        "식단 보기\n"
        "  today              오늘 식단 (명령을 안 쓰면 이것)\n"
        "  week               이번 주 식단 (월~일)\n"
        "  month              이번 달 식단 (올라온 주까지)\n"
        "  next               지금 기준 다음 끼니 메뉴\n"
        "  show 날 끼니       한 끼니만 보기.  날: 오늘|내일  끼니: 아침|점심|저녁\n"
        "                     예) dorm-menu show 내일 점심\n"
        "\n"
        "알림 규칙 (매일 반복. 학사는 반드시 적는다)\n"
        "  alarm add 날 끼니 HH:MM 학사\n"
        "                     매일 HH:MM에 (오늘|내일)의 그 끼니 메뉴를 알림\n"
        "                     예) dorm-menu alarm add 내일 아침 21:00 surim\n"
        "                         = 매일 밤 9시에 수림 내일 아침 메뉴를 알림\n"
        "  alarm list         규칙 목록 (번호 포함)\n"
        "  alarm del 번호     규칙 지우기\n"
        "\n"
        "상주 모드 (규칙 시각에 맞춰 이 서버의 내 터미널에 알림)\n"
        "  daemon [-f]        시작 (-f: 터미널에서 실행, Ctrl+C로 끝)\n"
        "  stop               끝내기\n"
        "\n"
        "옵션\n"
        "  -d, --dorm 학사    kb (불암·KB·창명) | sunglim (성림·누리) | surim (수림)\n"
        "                     식단 보기 명령에서 학사를 고른다 (기본: dorm_menurc의 dorm)\n"
        "  -D, --date 날짜    YYYY-MM-DD 기준으로 보기\n"
        "  -r, --refresh      저장된 식단을 무시하고 새로 받기\n"
        "  -t, --tty 경로     알림 보낼 터미널 (예: /dev/pts/3)\n"
        "  -h, --help         이 설명서\n"
        "\n"
        "파일\n"
        "  dorm_menurc            실행 파일과 같은 폴더의 설정 (dorm = kb)\n"
        "  ~/.dorm_menu/alarms    알림 규칙\n"
        "  ~/.dorm_menu/          저장한 식단, 상주 모드 pid와 로그\n"
        "\n"
        "내 PC로 알림 받기: Local\\dorm.ps1 (README 참고)\n");
}

static int same_day(const struct day_menu *d, time_t t)
{
    struct tm tm = *localtime(&t);

    return d->year == tm.tm_year + 1900 && d->month == tm.tm_mon + 1 &&
           d->day == tm.tm_mday;
}

static int cmd_today(const char *dorm, time_t date, int force)
{
    struct week_menu wk;
    struct tm tm = *localtime(&date);

    if (week_get(dorm, date_monday(date), force, &wk) < 0)
        return 1;
    printf("%s\n\n", dorm_label(dorm));
    print_day(&wk.day[(tm.tm_wday + 6) % 7], 0);
    return 0;
}

static int cmd_week(const char *dorm, time_t date, int force)
{
    struct week_menu wk;
    time_t now = time(NULL);
    int i;

    if (week_get(dorm, date_monday(date), force, &wk) < 0)
        return 1;
    printf("%s\n", dorm_label(dorm));
    for (i = 0; i < 7; i++) {
        putchar('\n');
        print_day(&wk.day[i], same_day(&wk.day[i], now));
    }
    return 0;
}

static int cmd_month(const char *dorm, time_t date, int force)
{
    struct tm tm = *localtime(&date);
    int year = tm.tm_year + 1900, month = tm.tm_mon + 1;
    time_t first = date_make(year, month, 1, 12, 0);
    time_t monday, now = time(NULL);
    struct week_menu wk;
    int i, missing = 0;

    printf("%s · %d년 %d월\n", dorm_label(dorm), year, month);
    for (monday = date_monday(first);; monday = date_add_days(monday, 7)) {
        struct tm mt = *localtime(&monday);

        if (mt.tm_year + 1900 > year || (mt.tm_year + 1900 == year && mt.tm_mon + 1 > month))
            break;
        if (week_get(dorm, monday, force, &wk) < 0)
            return 1;
        for (i = 0; i < 7; i++) {
            const struct day_menu *d = &wk.day[i];

            if (d->month != month)
                continue;
            if (!d->registered) {
                missing++;
                continue;
            }
            putchar('\n');
            print_day(d, same_day(d, now));
        }
    }
    if (missing > 0)
        printf("\n(아직 올라오지 않은 날 %d일은 생략했습니다. 식단은 한 주씩 게시됩니다.)\n",
               missing);
    return 0;
}

static int cmd_next(const struct config *cfg, time_t now, int force)
{
    char title[256], body[MENU_MAX];
    time_t day;
    enum meal m;

    next_meal(now, &day, &m);
    if (format_meal(cfg->dorm, day, m, force, title, sizeof title, body, sizeof body) < 0)
        return 1;
    printf("%s\n  %s\n", title, body);
    return 0;
}

static int cmd_show(const struct config *cfg, const char *day_word, const char *meal_word,
                    int force)
{
    char title[256], body[MENU_MAX];
    int offset;
    enum meal m;

    if (alarm_parse_day(day_word, &offset) < 0 || alarm_parse_meal(meal_word, &m) < 0) {
        fprintf(stderr, "사용법: dorm-menu show <오늘|내일> <아침|점심|저녁>\n");
        return 2;
    }
    if (format_meal(cfg->dorm, date_add_days(time(NULL), offset), m, force, title,
                    sizeof title, body, sizeof body) < 0)
        return 1;
    printf("%s\n  %s\n", title, body);
    return 0;
}

int main(int argc, char *argv[])
{
    struct config cfg;
    const char *pos[16], *cmd;
    int npos = 0;
    time_t date = time(NULL);
    int force = 0, foreground = 0, date_given = 0, i;

    if (program_locate(argv[0]) < 0 || config_load(&cfg) < 0)
        return 2;

    for (i = 1; i < argc; i++) {
        const char *a = argv[i];

        if (strcmp(a, "-h") == 0 || strcmp(a, "--help") == 0) {
            manual();
            return 0;
        } else if (strcmp(a, "-r") == 0 || strcmp(a, "--refresh") == 0) {
            force = 1;
        } else if (strcmp(a, "-f") == 0 || strcmp(a, "--foreground") == 0) {
            foreground = 1;
        } else if (strcmp(a, "-d") == 0 || strcmp(a, "--dorm") == 0 ||
                   strcmp(a, "-D") == 0 || strcmp(a, "--date") == 0 ||
                   strcmp(a, "-t") == 0 || strcmp(a, "--tty") == 0) {
            const char *v;

            if (i + 1 >= argc) {
                fprintf(stderr, "%s 뒤에 값이 필요합니다\n", a);
                return 2;
            }
            v = argv[++i];
            if (a[1] == 'd' || strcmp(a, "--dorm") == 0) {
                if (!dorm_valid(v)) {
                    fprintf(stderr, "알 수 없는 학사: %s (kb, sunglim, surim)\n", v);
                    return 2;
                }
                snprintf(cfg.dorm, sizeof cfg.dorm, "%s", v);
            } else if (a[1] == 'D' || strcmp(a, "--date") == 0) {
                if (date_parse(v, &date) < 0) {
                    fprintf(stderr, "날짜 형식은 YYYY-MM-DD 입니다: %s\n", v);
                    return 2;
                }
                date_given = 1;
            } else {
                snprintf(cfg.tty, sizeof cfg.tty, "%s", v);
            }
        } else if (a[0] == '-') {
            fprintf(stderr, "알 수 없는 옵션: %s\n", a);
            usage();
            return 2;
        } else if (npos < 16) {
            pos[npos++] = a;
        }
    }
    cmd = npos > 0 ? pos[0] : "today";

    if (strcmp(cmd, "today") == 0)
        return cmd_today(cfg.dorm, date, force);
    if (strcmp(cmd, "week") == 0)
        return cmd_week(cfg.dorm, date, force);
    if (strcmp(cmd, "month") == 0)
        return cmd_month(cfg.dorm, date, force);
    if (strcmp(cmd, "next") == 0) {
        if (date_given) {
            fprintf(stderr, "next는 현재 시각 기준이라 --date를 쓸 수 없습니다\n");
            return 2;
        }
        return cmd_next(&cfg, date, force);
    }
    if (strcmp(cmd, "show") == 0)
        return npos == 3 ? cmd_show(&cfg, pos[1], pos[2], force) : cmd_show(&cfg, "", "", 0);
    if (strcmp(cmd, "help") == 0) {
        manual();
        return 0;
    }
    if (strcmp(cmd, "alarm") == 0)
        return alarm_command(npos - 1, (char **)pos + 1);
    if (strcmp(cmd, "daemon") == 0)
        return daemon_run(&cfg, foreground) < 0 ? 1 : 0;
    if (strcmp(cmd, "stop") == 0)
        return daemon_stop() < 0 ? 1 : 0;
    /* cron 명령은 없앴다: 알림 예약은 alarm 규칙과 daemon 이 맡는다 */

    fprintf(stderr, "알 수 없는 명령: %s\n", cmd);
    usage();
    return 2;
}
