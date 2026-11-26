/* cache.c - 주 단위 HTML 캐시: mkdir, stat(st_mtime), open/write/rename
 *
 * ~/.dorm_menu/<학사>-<월요일 YYYYMMDD>.html
 * 재다운로드 기준 (사이트 부담을 줄이려고 캐시 우선):
 *   - 지난 주이고 모두 등록됨  : 다시 받지 않음
 *   - 모두 등록됨             : 12시간 지나면
 *   - 미등록 날이 있음         : 3시간 지나면 (다음 주 식단이 올라왔는지 확인)
 *   - 다음 주보다 먼 주        : 받지 않고 미등록으로 처리
 */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#include "menu.h"

#define AGE_FULL (12 * 60 * 60)
#define AGE_PARTIAL (3 * 60 * 60)

int cache_dir(char *buf, size_t size)
{
    snprintf(buf, size, "%s/.dorm_menu", home_dir());
    if (mkdir(buf, 0700) < 0 && errno != EEXIST) {
        perror(buf);
        return -1;
    }
    return 0;
}

static char *read_file(const char *path)
{
    struct stat st;
    char *buf;
    ssize_t n;
    size_t got = 0;
    int fd;

    if ((fd = open(path, O_RDONLY)) < 0)
        return NULL;
    if (fstat(fd, &st) < 0 || (buf = malloc((size_t)st.st_size + 1)) == NULL) {
        close(fd);
        return NULL;
    }
    while (got < (size_t)st.st_size) {
        n = read(fd, buf + got, (size_t)st.st_size - got);
        if (n < 0 && errno == EINTR)
            continue;
        if (n <= 0)
            break;
        got += (size_t)n;
    }
    close(fd);
    buf[got] = '\0';
    return buf;
}

/* 임시 파일에 다 쓴 뒤 rename: 도중에 끊겨도 깨진 캐시가 남지 않는다 */
static int write_file(const char *path, const char *data, size_t len)
{
    char tmp[1140];
    size_t done = 0;
    ssize_t n;
    int fd;

    snprintf(tmp, sizeof tmp, "%s.%ld.tmp", path, (long)getpid());
    if ((fd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0600)) < 0) {
        perror(tmp);
        return -1;
    }
    while (done < len) {
        n = write(fd, data + done, len - done);
        if (n < 0 && errno == EINTR)
            continue;
        if (n <= 0) {
            perror(tmp);
            close(fd);
            unlink(tmp);
            return -1;
        }
        done += (size_t)n;
    }
    if (close(fd) < 0 || rename(tmp, path) < 0) {
        perror(path);
        unlink(tmp);
        return -1;
    }
    return 0;
}

/* 미등록이던 주가 처음 등록된 것을 본 순간을 남긴다 (식단 게시 시점 관찰용) */
static void log_published(const char *dir, const char *dorm, time_t monday,
                          time_t prev_check, time_t now)
{
    char path[1100], week[16], prev[32], cur[32];
    FILE *fp;

    snprintf(path, sizeof path, "%s/published.log", dir);
    if ((fp = fopen(path, "a")) == NULL)
        return;
    strftime(week, sizeof week, "%Y-%m-%d", localtime(&monday));
    strftime(prev, sizeof prev, "%Y-%m-%d(%a) %H:%M", localtime(&prev_check));
    strftime(cur, sizeof cur, "%Y-%m-%d(%a) %H:%M", localtime(&now));
    fprintf(fp, "%s 주 %s: %s ~ %s 사이에 게시됨\n", week, dorm, prev, cur);
    fclose(fp);
}

static void empty_week(time_t monday, struct week_menu *wk)
{
    /* 표가 없는 HTML을 파싱할 수는 없으니 날짜만 채운다 */
    int i;

    memset(wk, 0, sizeof *wk);
    for (i = 0; i < 7; i++) {
        time_t t = date_add_days(monday, i);
        struct tm tm = *localtime(&t);

        wk->day[i].year = tm.tm_year + 1900;
        wk->day[i].month = tm.tm_mon + 1;
        wk->day[i].day = tm.tm_mday;
        wk->day[i].wday = tm.tm_wday;
    }
}

int week_get(const char *dorm, time_t monday, int force, struct week_menu *wk)
{
    char dir[1024], path[1100], stamp[16];
    struct stat st;
    time_t now = time(NULL);
    time_t this_monday = date_monday(now);
    time_t week_end = date_add_days(monday, 7);
    char *cached = NULL, *html;
    size_t len;
    int have_cache = 0, cache_any = 0;

    if (monday > date_add_days(this_monday, 7)) {
        empty_week(monday, wk); /* 아직 올라올 수 없는 주 */
        return 0;
    }
    if (cache_dir(dir, sizeof dir) < 0)
        return -1;
    strftime(stamp, sizeof stamp, "%Y%m%d", localtime(&monday));
    snprintf(path, sizeof path, "%s/%s-%s.html", dir, dorm, stamp);

    if (stat(path, &st) == 0 && (cached = read_file(path)) != NULL &&
        parse_week(cached, monday, wk) == 0) {
        have_cache = 1;
        cache_any = week_any_registered(wk);
        if (!force) {
            double age = difftime(now, st.st_mtime);

            if (week_all_registered(wk) && (week_end <= now || age < AGE_FULL))
                goto done;
            if (!week_all_registered(wk) && age < AGE_PARTIAL)
                goto done;
        }
    }

    if (fetch_week_html(dorm, monday, &html, &len) == 0) {
        if (parse_week(html, monday, wk) == 0) {
            write_file(path, html, len);
            if (have_cache && !cache_any && week_any_registered(wk))
                log_published(dir, dorm, monday, st.st_mtime, now);
            free(html);
            goto done;
        }
        free(html);
    }

    if (have_cache) {
        fprintf(stderr, "경고: 새로 받지 못해 저장된 식단을 보여 줍니다\n");
        parse_week(cached, monday, wk);
        goto done;
    }
    free(cached);
    return -1;

done:
    free(cached);
    return 0;
}
