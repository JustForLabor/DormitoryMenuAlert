/* daemon.c - 상주 모드: fork/setsid, sigaction, alarm + sigsuspend, atexit
 *
 * 다음 알림 시각까지 alarm()을 걸고 sigsuspend()로 잠든다.
 *   SIGALRM        : 알림 시각 -> 그 메뉴를 터미널에 보낸다
 *   SIGHUP         : 설정 파일(실행 파일 폴더의 dorm_menurc) 다시 읽기
 *   SIGINT/SIGTERM : pid 파일을 지우고 끝낸다 (atexit)
 */
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#include "menu.h"

static volatile sig_atomic_t got_alarm, got_quit, got_reload;
static char pid_path[1100];

static void on_signal(int sig)
{
    if (sig == SIGALRM)
        got_alarm = 1;
    else if (sig == SIGHUP)
        got_reload = 1;
    else
        got_quit = sig;
}

static void remove_pidfile(void)
{
    unlink(pid_path);
}

static void logmsg(const char *fmt, ...)
{
    char stamp[32];
    time_t now = time(NULL);
    va_list ap;

    strftime(stamp, sizeof stamp, "%Y-%m-%d %H:%M:%S", localtime(&now));
    printf("[%s] ", stamp);
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    putchar('\n');
    fflush(stdout);
}

static int set_pid_path(void)
{
    char dir[1024];

    if (cache_dir(dir, sizeof dir) < 0)
        return -1;
    snprintf(pid_path, sizeof pid_path, "%s/daemon.pid", dir);
    return 0;
}

/* pid 파일의 프로세스가 살아 있으면 그 pid, 아니면 0 */
static pid_t running_pid(void)
{
    char buf[32];
    ssize_t n;
    long pid;
    int fd = open(pid_path, O_RDONLY);

    if (fd < 0)
        return 0;
    n = read(fd, buf, sizeof buf - 1);
    close(fd);
    if (n <= 0)
        return 0;
    buf[n] = '\0';
    pid = strtol(buf, NULL, 10);
    if (pid <= 0)
        return 0;
    if (kill((pid_t)pid, 0) == 0 || errno == EPERM)
        return (pid_t)pid;
    return 0;
}

static int write_pidfile(void)
{
    char buf[32];
    int fd, len;

    unlink(pid_path); /* 호출 전에 살아 있는 데몬이 없음을 확인했다: 남은 파일은 낡은 것 */
    if ((fd = open(pid_path, O_WRONLY | O_CREAT | O_EXCL, 0600)) < 0) {
        perror(pid_path);
        return -1;
    }
    len = snprintf(buf, sizeof buf, "%ld\n", (long)getpid());
    if (write(fd, buf, (size_t)len) != len) {
        perror(pid_path);
        close(fd);
        return -1;
    }
    close(fd);
    return atexit(remove_pidfile);
}

static int detach(void)
{
    char log_path[1100], dir[1024];
    pid_t pid;
    int fd;

    if ((pid = fork()) < 0) {
        perror("fork");
        return -1;
    }
    if (pid > 0) {
        printf("상주 모드 시작 (pid %ld). 끝내려면: dorm-menu stop\n", (long)pid);
        exit(0);
    }
    setsid(); /* 로그아웃해도 SIGHUP을 받지 않게 터미널에서 떨어진다 */
    umask(077);
    if (chdir("/") < 0)
        perror("chdir");

    cache_dir(dir, sizeof dir);
    snprintf(log_path, sizeof log_path, "%s/daemon.log", dir);
    if ((fd = open("/dev/null", O_RDONLY)) >= 0) {
        dup2(fd, STDIN_FILENO);
        close(fd);
    }
    if ((fd = open(log_path, O_WRONLY | O_CREAT | O_APPEND, 0600)) >= 0) {
        dup2(fd, STDOUT_FILENO);
        dup2(fd, STDERR_FILENO);
        close(fd);
    }
    return 0;
}

/* now 이후 가장 가까운 규칙 시각. 규칙이 없으면 0 */
static time_t next_target(const struct alarm_set *set, time_t now)
{
    struct tm tm = *localtime(&now);
    time_t best = 0;
    int i, day;

    for (i = 0; i < set->n; i++) {
        int min = set->r[i].minute;

        for (day = 0; day <= 1; day++) {
            time_t t = date_make(tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday + day,
                                 min / 60, min % 60);

            if (t > now) {
                if (best == 0 || t < best)
                    best = t;
                break;
            }
        }
    }
    return best;
}

/* target 시각이 알림 시각인 규칙을 모두 보낸다 (같은 시각 규칙이 여럿일 수 있다) */
static void fire(const struct config *cfg, const struct alarm_set *set, time_t target)
{
    struct tm tm = *localtime(&target);
    int minute = tm.tm_hour * 60 + tm.tm_min, i;
    struct week_menu next_week;

    for (i = 0; i < set->n; i++) {
        char title[256], body[MENU_MAX];
        int sent;

        if (set->r[i].minute != minute)
            continue;
        format_meal(set->r[i].dorm, date_add_days(target, set->r[i].day_offset),
                    set->r[i].meal, 0, title, sizeof title, body, sizeof body);
        sent = notify_send(cfg, title, body);
        logmsg("알림: %s (터미널 %d곳)", title, sent);
        /* 다음 주 식단이 올라왔는지도 확인해 둔다 (캐시 정책상 3시간에 한 번까지) */
        week_get(set->r[i].dorm, date_add_days(date_monday(target), 7), 0, &next_week);
    }
}

int daemon_run(const struct config *initial, int foreground)
{
    struct config cfg = *initial;
    struct alarm_set set;
    struct sigaction sa;
    sigset_t block, old;
    pid_t pid;

    if (set_pid_path() < 0 || alarm_load(&set) < 0)
        return -1;
    if ((pid = running_pid()) != 0) {
        fprintf(stderr, "이미 실행 중입니다 (pid %ld)\n", (long)pid);
        return -1;
    }
    if (!foreground && detach() < 0)
        return -1;
    if (write_pidfile() < 0)
        return -1;

    memset(&sa, 0, sizeof sa);
    sa.sa_handler = on_signal;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0; /* SA_RESTART 없이: sigsuspend가 바로 깨어나야 한다 */
    sigaction(SIGALRM, &sa, NULL);
    sigaction(SIGINT, &sa, NULL);
    sigaction(SIGTERM, &sa, NULL);
    sigaction(SIGHUP, &sa, NULL);

    /* 시그널을 막아 둔 상태에서 플래그를 검사하고, sigsuspend가 풀면서 잠든다.
     * 검사와 잠들기 사이에 시그널이 와서 놓치는 경쟁 상태를 막는다. */
    sigemptyset(&block);
    sigaddset(&block, SIGALRM);
    sigaddset(&block, SIGINT);
    sigaddset(&block, SIGTERM);
    sigaddset(&block, SIGHUP);
    sigprocmask(SIG_BLOCK, &block, &old);

    logmsg("시작 (pid %ld, %s, 알림 규칙 %d개)", (long)getpid(), dorm_label(cfg.dorm), set.n);
    while (!got_quit) {
        time_t now = time(NULL), target = next_target(&set, now);

        got_alarm = 0;
        if (target != 0) {
            char when[32];

            strftime(when, sizeof when, "%m/%d %H:%M", localtime(&target));
            logmsg("다음 알림: %s (%ld초 뒤)", when, (long)(target - now));
            alarm((unsigned)(target - now));
        } else {
            logmsg("알림 규칙이 없습니다. alarm add 로 추가하면 바로 반영됩니다");
        }
        while (!got_alarm && !got_quit && !got_reload)
            sigsuspend(&old);
        alarm(0);

        if (got_quit)
            break;
        if (got_reload) {
            got_reload = 0;
            if (config_load(&cfg) == 0 && alarm_load(&set) == 0)
                logmsg("설정과 알림 규칙을 다시 읽음 (%s, 규칙 %d개)", dorm_label(cfg.dorm),
                       set.n);
            continue;
        }
        if (target != 0 && time(NULL) >= target)
            fire(&cfg, &set, target);
        /* 일찍 깼으면(시계 변경 등) 다시 계산해서 잔다 */
    }
    logmsg("종료 (signal %d)", (int)got_quit);
    return 0;
}

int daemon_reload(void)
{
    pid_t pid;

    if (set_pid_path() < 0 || (pid = running_pid()) == 0)
        return 0;
    return kill(pid, SIGHUP) == 0;
}

int daemon_stop(void)
{
    pid_t pid;

    if (set_pid_path() < 0)
        return -1;
    if ((pid = running_pid()) == 0) {
        fprintf(stderr, "실행 중인 상주 모드가 없습니다\n");
        return -1;
    }
    if (kill(pid, SIGTERM) < 0) {
        perror("kill");
        return -1;
    }
    printf("pid %ld에 SIGTERM을 보냈습니다\n", (long)pid);
    return 0;
}
