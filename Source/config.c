/* config.c - 설정 파일 읽기: getenv, getpwuid, realpath, access, fopen, fgets
 *
 * 설정 파일은 실행 파일과 같은 폴더의 dorm_menurc 다.
 * 예) ~/Unix_Programming/Dormitory_Menu_Alert/dorm-menu
 *  -> ~/Unix_Programming/Dormitory_Menu_Alert/dorm_menurc
 * 상주 모드는 chdir("/")를 하므로, 시작할 때 실행 파일의 절대 경로를 구해 둔다.
 */
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <pwd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "menu.h"

static char prog_path[PATH_MAX]; /* 실행 파일의 절대 경로 */

static const struct {
    const char *id, *label;
} dorms[] = {
    { "kb", "KB학사 식당 (불암·KB·창명)" },
    { "sunglim", "성림학사 식당 (성림·누리)" },
    { "surim", "수림학사 식당" },
};

/* 홈을 못 찾으면 홈 밖(/tmp 등)에 쓰지 않고 끝낸다 */
const char *home_dir(void)
{
    const char *home = getenv("HOME");
    struct passwd *pw;

    if (home != NULL && home[0] != '\0')
        return home;
    pw = getpwuid(getuid());
    if (pw != NULL && pw->pw_dir != NULL && pw->pw_dir[0] != '\0')
        return pw->pw_dir;
    fprintf(stderr, "홈 디렉터리를 찾지 못했습니다 (HOME이 비어 있음)\n");
    exit(1);
}

/* argv[0]으로 실행 파일의 절대 경로를 구한다.
 * "./dorm-menu"처럼 '/'가 있으면 그 경로를, "dorm-menu"처럼 이름만 있으면
 * 셸처럼 PATH의 폴더를 차례로 찾아본다. */
int program_locate(const char *argv0)
{
    char cand[PATH_MAX];
    const char *path, *p, *end;
    size_t len;

    if (strchr(argv0, '/') != NULL) {
        if (realpath(argv0, prog_path) != NULL)
            return 0;
    } else if ((path = getenv("PATH")) != NULL) {
        for (p = path; ; p = end + 1) {
            end = strchr(p, ':');
            len = end != NULL ? (size_t)(end - p) : strlen(p);
            snprintf(cand, sizeof cand, "%.*s/%s", (int)len, len ? p : ".", argv0);
            if (access(cand, X_OK) == 0 && realpath(cand, prog_path) != NULL)
                return 0;
            if (end == NULL)
                break;
        }
    }
    fprintf(stderr, "실행 파일 위치를 찾지 못했습니다: %s\n", argv0);
    return -1;
}

const char *program_path(void)
{
    return prog_path;
}

/* 실행 파일 폴더의 dorm_menurc 경로 */
void config_path(char *buf, size_t size)
{
    const char *slash = strrchr(prog_path, '/');

    snprintf(buf, size, "%.*s/dorm_menurc", (int)(slash - prog_path), prog_path);
}

int dorm_valid(const char *dorm)
{
    return dorm_label(dorm) != NULL;
}

const char *dorm_label(const char *dorm)
{
    size_t i;

    for (i = 0; i < sizeof dorms / sizeof dorms[0]; i++)
        if (strcmp(dorm, dorms[i].id) == 0)
            return dorms[i].label;
    return NULL;
}

static char *trim(char *s)
{
    char *end;

    while (isspace((unsigned char)*s))
        s++;
    end = s + strlen(s);
    while (end > s && isspace((unsigned char)end[-1]))
        *--end = '\0';
    return s;
}

int config_load(struct config *cfg)
{
    char path[1024], line[256];
    FILE *fp;
    int lineno = 0;

    strcpy(cfg->dorm, "kb");
    cfg->tty[0] = '\0';

    config_path(path, sizeof path);
    if ((fp = fopen(path, "r")) == NULL) {
        if (errno == ENOENT)
            return 0; /* 설정 파일이 없으면 기본값 */
        perror(path);
        return -1;
    }

    while (fgets(line, sizeof line, fp) != NULL) {
        char *key, *value, *eq;

        lineno++;
        if ((eq = strchr(line, '#')) != NULL)
            *eq = '\0';
        key = trim(line);
        if (*key == '\0')
            continue;
        if ((eq = strchr(key, '=')) == NULL)
            goto bad;
        *eq = '\0';
        key = trim(key);
        value = trim(eq + 1);

        if (strcmp(key, "dorm") == 0) {
            if (!dorm_valid(value))
                goto bad;
            snprintf(cfg->dorm, sizeof cfg->dorm, "%s", value);
            continue;
        }
        if (strcmp(key, "tty") == 0) {
            if (strncmp(value, "/dev/", 5) != 0)
                goto bad;
            snprintf(cfg->tty, sizeof cfg->tty, "%s", value);
            continue;
        }
        goto bad;
    }
    fclose(fp);
    return 0;

bad:
    fprintf(stderr, "%s:%d: 잘못된 설정입니다 (예: dorm = kb)\n", path, lineno);
    fclose(fp);
    return -1;
}
