/* notify.c - 알림: utmpx로 내 터미널 찾기 -> open/write, (GUI면) notify-send */
#include <errno.h>
#include <signal.h>
#include <fcntl.h>
#include <pwd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#include <utmpx.h>

#include "menu.h"

/* 식당 퇴장 시각(분). 이 시각이 지나면 다음 밥을 보여 준다. 출처: 생활관 식당이용시간(학기) */
static const int meal_end_weekday[MEAL_COUNT] = { 9 * 60, 14 * 60, 18 * 60 + 50 };
static const int meal_end_weekend[MEAL_COUNT] = { 9 * 60, 13 * 60 + 30, 18 * 60 + 30 };

void next_meal(time_t now, time_t *day, enum meal *m)
{
    struct tm tm = *localtime(&now);
    int minute = tm.tm_hour * 60 + tm.tm_min;
    const int *end = (tm.tm_wday == 0 || tm.tm_wday == 6) ? meal_end_weekend
                                                          : meal_end_weekday;
    int i;

    for (i = 0; i < MEAL_COUNT; i++) {
        if (minute < end[i]) {
            *day = now;
            *m = (enum meal)i;
            return;
        }
    }
    *day = date_add_days(now, 1);
    *m = BREAKFAST;
}

int format_meal(const char *dorm, time_t day, enum meal m, int force,
                char *title, size_t title_size, char *body, size_t body_size)
{
    struct week_menu wk;
    time_t monday = date_monday(day);
    struct tm tm = *localtime(&day);
    const struct day_menu *d;

    snprintf(title, title_size, "%d/%d(%s) %s · %s", tm.tm_mon + 1, tm.tm_mday,
             weekday_name(tm.tm_wday), meal_name(m), dorm_label(dorm));
    if (week_get(dorm, monday, force, &wk) < 0) {
        snprintf(body, body_size, "식단을 가져오지 못했습니다");
        return -1;
    }
    d = &wk.day[(tm.tm_wday + 6) % 7];
    if (!d->registered)
        snprintf(body, body_size, "아직 식단이 올라오지 않았습니다 (미등록)");
    else
        snprintf(body, body_size, "%s", d->meal[m][0] ? d->meal[m] : "-");
    return 0;
}

static int write_all(int fd, const char *s, size_t len)
{
    ssize_t n;

    while (len > 0) {
        n = write(fd, s, len);
        if (n < 0 && errno == EINTR)
            continue;
        if (n <= 0)
            return -1;
        s += n;
        len -= (size_t)n;
    }
    return 0;
}

static int write_tty(const char *path, const char *msg)
{
    /* O_NOCTTY: 데몬이 이 터미널을 제어 터미널로 갖지 않게 한다
     * O_NONBLOCK: 멈춘 터미널 때문에 데몬이 막히지 않게 한다 */
    int fd = open(path, O_WRONLY | O_NOCTTY | O_NONBLOCK);
    int rc;

    if (fd < 0)
        return -1;
    rc = write_all(fd, msg, strlen(msg));
    close(fd);
    return rc;
}

/* who(1)처럼 utmpx를 훑어 내가 로그인한 모든 터미널(PuTTY 창)에 쓴다 */
static int write_my_terminals(const char *msg)
{
    struct passwd *pw = getpwuid(getuid());
    struct utmpx *ut;
    char path[64];
    int sent = 0;

    if (pw == NULL)
        return 0;
    setutxent();
    while ((ut = getutxent()) != NULL) {
        if (ut->ut_type != USER_PROCESS)
            continue;
        if (strncmp(ut->ut_user, pw->pw_name, sizeof ut->ut_user) != 0)
            continue;
        snprintf(path, sizeof path, "/dev/%.*s", (int)sizeof ut->ut_line, ut->ut_line);
        if (write_tty(path, msg) == 0)
            sent++;
    }
    endutxent();
    return sent;
}

static void desktop_notify(const char *title, const char *body)
{
    pid_t pid;
    int devnull;

    if (getenv("DISPLAY") == NULL && getenv("WAYLAND_DISPLAY") == NULL)
        return;
    if ((pid = fork()) < 0)
        return;
    if (pid == 0) {
        sigset_t none;

        sigemptyset(&none);
        sigprocmask(SIG_SETMASK, &none, NULL);
        if ((devnull = open("/dev/null", O_WRONLY)) >= 0) {
            dup2(devnull, STDOUT_FILENO);
            dup2(devnull, STDERR_FILENO);
            close(devnull);
        }
        execlp("notify-send", "notify-send", title, body, (char *)NULL);
        _exit(127);
    }
    while (waitpid(pid, NULL, 0) < 0 && errno == EINTR)
        ;
}

int notify_send(const struct config *cfg, const char *title, const char *body)
{
    char msg[MENU_MAX + 512];
    int sent;

    /* \a: 터미널 벨, \r\n: 사용자가 입력 중인 줄과 섞이지 않게 줄을 바꾼다 */
    snprintf(msg, sizeof msg,
             "\a\r\n\033[1;33m[식단 알리미] %s\033[0m\r\n  %s\r\n", title, body);

    if (cfg->tty[0] != '\0')
        sent = write_tty(cfg->tty, msg) == 0;
    else
        sent = write_my_terminals(msg);
    desktop_notify(title, body);

    if (sent == 0) {
        /* 열린 터미널이 없으면 표준 출력(데몬이면 로그 파일)에 남긴다 */
        printf("[식단 알리미] %s\n  %s\n", title, body);
        fflush(stdout);
    }
    return sent;
}
