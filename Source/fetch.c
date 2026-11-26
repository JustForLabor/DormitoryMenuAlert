/* fetch.c - 식단 페이지 받기: pipe, fork, alarm, read, waitpid
 *
 * 네트워크 요청은 자식 프로세스가 맡는다. 자식은 alarm()으로 시간 제한을 걸고
 * https_post()로 받은 본문을 pipe에 쓴다. 사이트가 응답하지 않아도 자식만
 * SIGALRM으로 끝나므로, 부모(상주 모드)는 멈추지 않는다.
 */
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#include "menu.h"

#define FETCH_LIMIT (1024 * 1024) /* 페이지는 약 50KB. 비정상 응답 방어 */
#define FETCH_TIMEOUT 30          /* 초 */

int fetch_week_html(const char *dorm, time_t monday, char **out, size_t *len)
{
    struct tm tm = *localtime(&monday);
    char form[128];
    int fd[2], status;
    pid_t pid;
    char *buf = NULL;
    size_t size = 0, cap = 0;
    ssize_t n;

    /* 사이트는 POST 날짜부터 7일을 돌려준다 */
    snprintf(form, sizeof form, "foodtype=%s&year=%d&month=%d&day=%d",
             dorm, tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday);

    if (pipe(fd) < 0) {
        perror("pipe");
        return -1;
    }
    if ((pid = fork()) < 0) {
        perror("fork");
        close(fd[0]);
        close(fd[1]);
        return -1;
    }
    if (pid == 0) {
        /* 자식: 상주 모드가 막아 둔 시그널과 SIGALRM 핸들러를 기본으로 돌린 뒤
         * 시간 제한을 건다. 제한을 넘기면 SIGALRM 기본 동작으로 자식이 끝난다. */
        sigset_t none;

        sigemptyset(&none);
        sigprocmask(SIG_SETMASK, &none, NULL);
        signal(SIGALRM, SIG_DFL);
        alarm(FETCH_TIMEOUT);
        close(fd[0]);
        _exit(https_post(SITE_HOST, SITE_PATH, form, fd[1]) == 0 ? 0 : 1);
    }

    /* 부모: pipe에서 EOF까지 읽는다 */
    close(fd[1]);
    for (;;) {
        if (size + 4096 + 1 > cap) {
            char *p;

            cap = cap ? cap * 2 : 65536;
            if ((p = realloc(buf, cap)) == NULL) {
                perror("realloc");
                size = FETCH_LIMIT + 1; /* 실패로 처리 */
                break;
            }
            buf = p;
        }
        n = read(fd[0], buf + size, cap - size - 1);
        if (n < 0 && errno == EINTR)
            continue;
        if (n <= 0)
            break;
        size += (size_t)n;
        if (size > FETCH_LIMIT) {
            fprintf(stderr, "fetch: 응답이 너무 큽니다\n");
            break;
        }
    }
    close(fd[0]);

    while (waitpid(pid, &status, 0) < 0) {
        if (errno != EINTR) {
            perror("waitpid");
            free(buf);
            return -1;
        }
    }
    if (WIFSIGNALED(status) && WTERMSIG(status) == SIGALRM)
        fprintf(stderr, "fetch: %d초 안에 응답이 없습니다\n", FETCH_TIMEOUT);
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0 || buf == NULL ||
        size == 0 || size > FETCH_LIMIT) {
        free(buf);
        return -1;
    }
    buf[size] = '\0';
    *out = buf;
    *len = size;
    return 0;
}
