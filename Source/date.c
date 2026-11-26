/* date.c - 날짜 계산: time, localtime, mktime */
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "menu.h"

time_t date_make(int year, int month, int day, int hour, int min)
{
    struct tm tm;

    memset(&tm, 0, sizeof tm);
    tm.tm_year = year - 1900;
    tm.tm_mon = month - 1;
    tm.tm_mday = day; /* 범위를 넘어도 mktime이 정규화한다 (32일 -> 다음 달 1일) */
    tm.tm_hour = hour;
    tm.tm_min = min;
    tm.tm_isdst = -1;
    return mktime(&tm);
}

time_t date_add_days(time_t t, int days)
{
    struct tm tm = *localtime(&t);

    return date_make(tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday + days,
                     tm.tm_hour, tm.tm_min);
}

time_t date_monday(time_t t)
{
    struct tm tm = *localtime(&t);
    int back = (tm.tm_wday + 6) % 7; /* 월=0 ... 일=6 */

    return date_make(tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday - back, 0, 0);
}

int date_parse(const char *s, time_t *out)
{
    int y, m, d;
    char extra;
    struct tm tm;

    if (sscanf(s, "%d-%d-%d%c", &y, &m, &d, &extra) != 3)
        return -1;
    if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31)
        return -1;
    *out = date_make(y, m, d, 12, 0);
    tm = *localtime(out);
    if (tm.tm_mday != d) /* 2월 30일 같은 날짜 거부 */
        return -1;
    return 0;
}

const char *weekday_name(int wday)
{
    static const char *names[] = { "일", "월", "화", "수", "목", "금", "토" };

    return (wday >= 0 && wday < 7) ? names[wday] : "?";
}

const char *meal_name(enum meal m)
{
    static const char *names[] = { "아침", "점심", "저녁" };

    return names[m];
}
