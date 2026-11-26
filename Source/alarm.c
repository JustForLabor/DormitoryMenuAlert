/* alarm.c - 알림 규칙 저장과 명령: alarm add | list | del
 *
 * 규칙은 ~/.dorm_menu/alarms 에 한 줄씩 저장한다.   형식: <today|tomorrow> <meal> HH:MM
 *   예) tomorrow breakfast 21:00   = 매일 21:00에 내일 아침 메뉴를 알린다
 * 저장은 임시 파일에 쓴 뒤 rename 해서, 도중에 끊겨도 깨진 파일이 남지 않는다.
 */
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "menu.h"

static const char *day_ids[] = { "today", "tomorrow" };
static const char *day_kr[] = { "오늘", "내일" };
static const char *meal_ids[MEAL_COUNT] = { "breakfast", "lunch", "dinner" };

int alarm_parse_day(const char *s, int *day_offset)
{
    int i;

    for (i = 0; i < 2; i++)
        if (strcmp(s, day_ids[i]) == 0 || strcmp(s, day_kr[i]) == 0) {
            *day_offset = i;
            return 0;
        }
    return -1;
}

int alarm_parse_meal(const char *s, enum meal *m)
{
    int i;

    for (i = 0; i < MEAL_COUNT; i++)
        if (strcmp(s, meal_ids[i]) == 0 || strcmp(s, meal_name((enum meal)i)) == 0) {
            *m = (enum meal)i;
            return 0;
        }
    return -1;
}

static int parse_hhmm(const char *s, int *minutes)
{
    int h, m;
    char extra;

    if (sscanf(s, "%d:%d%c", &h, &m, &extra) != 2 || h < 0 || h > 23 || m < 0 || m > 59)
        return -1;
    *minutes = h * 60 + m;
    return 0;
}

static int alarm_path(char *path, size_t size)
{
    char dir[1024];

    if (cache_dir(dir, sizeof dir) < 0)
        return -1;
    snprintf(path, size, "%s/alarms", dir);
    return 0;
}

int alarm_load(struct alarm_set *set)
{
    char path[1100], line[128];
    FILE *fp;
    int lineno = 0;

    set->n = 0;
    if (alarm_path(path, sizeof path) < 0)
        return -1;
    if ((fp = fopen(path, "r")) == NULL) {
        if (errno == ENOENT)
            return 0; /* 규칙이 하나도 없음 */
        perror(path);
        return -1;
    }
    while (fgets(line, sizeof line, fp) != NULL) {
        char d[16], m[16], t[16], h[16], extra[4];
        struct alarm_rule *r;

        lineno++;
        if (line[0] == '\n' || line[0] == '#')
            continue;
        r = &set->r[set->n];
        if (sscanf(line, "%15s %15s %15s %15s %3s", d, m, t, h, extra) != 4 ||
            alarm_parse_day(d, &r->day_offset) < 0 || alarm_parse_meal(m, &r->meal) < 0 ||
            parse_hhmm(t, &r->minute) < 0 || !dorm_valid(h) || set->n >= ALARM_MAX) {
            fprintf(stderr, "%s:%d: 잘못된 규칙입니다\n", path, lineno);
            fclose(fp);
            return -1;
        }
        snprintf(r->dorm, sizeof r->dorm, "%s", h);
        set->n++;
    }
    fclose(fp);
    return 0;
}

static int alarm_save(const struct alarm_set *set)
{
    char path[1100], tmp[1140];
    FILE *fp;
    int i;

    if (alarm_path(path, sizeof path) < 0)
        return -1;
    snprintf(tmp, sizeof tmp, "%s.%ld.tmp", path, (long)getpid());
    if ((fp = fopen(tmp, "w")) == NULL) {
        perror(tmp);
        return -1;
    }
    for (i = 0; i < set->n; i++)
        fprintf(fp, "%s %s %02d:%02d %s\n", day_ids[set->r[i].day_offset],
                meal_ids[set->r[i].meal], set->r[i].minute / 60, set->r[i].minute % 60,
                set->r[i].dorm);
    if (fclose(fp) != 0 || rename(tmp, path) < 0) {
        perror(path);
        unlink(tmp);
        return -1;
    }
    return 0;
}

static void usage(void)
{
    fprintf(stderr,
            "사용법: dorm-menu alarm add <오늘|내일> <아침|점심|저녁> <HH:MM> <kb|sunglim|surim>\n"
            "        dorm-menu alarm list [raw]\n"
            "        dorm-menu alarm del <번호>\n"
            "예) alarm add 내일 아침 21:00 surim   매일 21:00에 수림 내일 아침 메뉴를 알림\n"
            "학사는 반드시 적어야 한다 (kb, sunglim, surim)\n");
}

static void notify_daemon(void)
{
    if (daemon_reload())
        printf("실행 중인 상주 모드가 규칙을 다시 읽습니다\n");
}

int alarm_command(int argc, char *argv[])
{
    struct alarm_set set;
    const char *sub = argc > 0 ? argv[0] : "";
    int i;

    if (alarm_load(&set) < 0)
        return 1;

    if (strcmp(sub, "list") == 0) {
        int raw = argc > 1 && strcmp(argv[1], "raw") == 0;

        if (set.n == 0 && !raw)
            printf("등록된 알림이 없습니다. 예: dorm-menu alarm add 내일 아침 21:00 kb\n");
        for (i = 0; i < set.n; i++) {
            const struct alarm_rule *r = &set.r[i];

            if (raw)
                printf("%s %s %02d:%02d %s\n", day_ids[r->day_offset], meal_ids[r->meal],
                       r->minute / 60, r->minute % 60, r->dorm);
            else
                printf("%2d  매일 %02d:%02d  %s %s 메뉴  [%s]\n", i + 1, r->minute / 60,
                       r->minute % 60, day_kr[r->day_offset], meal_name(r->meal), r->dorm);
        }
        return 0;
    }
    if (strcmp(sub, "add") == 0 && argc == 5) {
        struct alarm_rule r;

        if (alarm_parse_day(argv[1], &r.day_offset) < 0 ||
            alarm_parse_meal(argv[2], &r.meal) < 0 || parse_hhmm(argv[3], &r.minute) < 0 ||
            !dorm_valid(argv[4])) {
            usage();
            return 2;
        }
        snprintf(r.dorm, sizeof r.dorm, "%s", argv[4]);
        for (i = 0; i < set.n; i++)
            if (set.r[i].day_offset == r.day_offset && set.r[i].meal == r.meal &&
                set.r[i].minute == r.minute && strcmp(set.r[i].dorm, r.dorm) == 0) {
                fprintf(stderr, "이미 같은 알림이 있습니다 (%d번)\n", i + 1);
                return 1;
            }
        if (set.n >= ALARM_MAX) {
            fprintf(stderr, "알림은 %d개까지 등록할 수 있습니다\n", ALARM_MAX);
            return 1;
        }
        set.r[set.n++] = r;
        if (alarm_save(&set) < 0)
            return 1;
        printf("등록: 매일 %02d:%02d에 %s %s 메뉴를 알립니다 [%s] (%d번)\n", r.minute / 60,
               r.minute % 60, day_kr[r.day_offset], meal_name(r.meal), r.dorm, set.n);
        notify_daemon();
        return 0;
    }
    if (strcmp(sub, "del") == 0 && argc == 2) {
        int n = atoi(argv[1]);

        if (n < 1 || n > set.n) {
            fprintf(stderr, "번호는 1~%d 입니다 (alarm list로 확인)\n", set.n);
            return 1;
        }
        for (i = n - 1; i < set.n - 1; i++)
            set.r[i] = set.r[i + 1];
        set.n--;
        if (alarm_save(&set) < 0)
            return 1;
        printf("%d번 알림을 지웠습니다\n", n);
        notify_daemon();
        return 0;
    }
    usage();
    return 2;
}
