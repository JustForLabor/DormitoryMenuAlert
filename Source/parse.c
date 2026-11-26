/* parse.c - <table class="chang"> 식단표 파싱
 *
 * 한 줄 구조:
 *   <th ...>16일</th><th ...>월</th>
 *   <td> <font>아침 :</font> 메뉴, ... <br> <font>점심 :</font> ... </td>
 * 올라오지 않은 날은 <td> 안에 "미등록"만 있다.
 */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <time.h>

#include "menu.h"

static const char *meal_marks[MEAL_COUNT] = { "아침 :", "점심 :", "저녁 :" };

/* [from, to) 범위 안에서 needle을 찾는다 */
static const char *find(const char *from, const char *to, const char *needle)
{
    size_t n = strlen(needle);

    for (; from + n <= to; from++)
        if (memcmp(from, needle, n) == 0)
            return from;
    return NULL;
}

/* 서식 태그(<br>, <font>)만 지운다. "<선택>" 같은 글자는 메뉴의 일부라 남긴다. */
static int skip_format_tag(const char *p, const char *to, const char **next)
{
    static const char *tags[] = { "br", "/br", "font", "/font" };
    const char *gt;
    size_t i, n;

    for (i = 0; i < sizeof tags / sizeof tags[0]; i++) {
        n = strlen(tags[i]);
        if (p + 1 + n < to && strncasecmp(p + 1, tags[i], n) == 0 &&
            (p[1 + n] == '>' || p[1 + n] == ' ' || p[1 + n] == '/')) {
            gt = find(p, to, ">");
            if (gt == NULL)
                return 0;
            *next = gt + 1;
            return 1;
        }
    }
    return 0;
}

static void clean_text(const char *from, const char *to, char *out, size_t size)
{
    static const struct {
        const char *ent;
        char ch;
    } ents[] = { { "&nbsp;", ' ' }, { "&amp;", '&' }, { "&lt;", '<' }, { "&gt;", '>' } };
    size_t len = 0, i;
    int space = 1; /* 앞 공백과 연속 공백 제거 */
    const char *next;

    while (from < to && len + 1 < size) {
        char c = *from;

        if (c == '<' && skip_format_tag(from, to, &next)) {
            from = next;
            c = ' ';
        } else if (c == '&') {
            for (i = 0; i < sizeof ents / sizeof ents[0]; i++) {
                size_t n = strlen(ents[i].ent);

                if (from + n <= to && memcmp(from, ents[i].ent, n) == 0)
                    break;
            }
            if (i < sizeof ents / sizeof ents[0]) {
                from += strlen(ents[i].ent);
                c = ents[i].ch;
            } else {
                from++;
            }
        } else {
            from++;
        }

        if (isspace((unsigned char)c)) {
            if (space)
                continue;
            c = ' ';
            space = 1;
        } else {
            space = 0;
        }
        out[len++] = c;
    }
    /* 끝의 공백과 쉼표 정리 */
    while (len > 0 && (out[len - 1] == ' ' || out[len - 1] == ','))
        len--;
    out[len] = '\0';
}

static void parse_cell(const char *from, const char *to, struct day_menu *d)
{
    int m;

    d->registered = find(from, to, "미등록") == NULL;
    for (m = 0; m < MEAL_COUNT; m++) {
        const char *start = find(from, to, meal_marks[m]);
        const char *end;

        d->meal[m][0] = '\0';
        if (start == NULL)
            continue;
        start += strlen(meal_marks[m]);
        end = find(start, to, "<font>");
        if (end == NULL)
            end = to;
        clean_text(start, end, d->meal[m], sizeof d->meal[m]);
    }
}

int parse_week(const char *html, time_t monday, struct week_menu *wk)
{
    const char *p = strstr(html, "class=\"chang\"");
    const char *end, *th, *td, *td_end;
    int i;

    if (p == NULL || (end = strstr(p, "</table>")) == NULL) {
        fprintf(stderr, "parse: 식단표(table.chang)를 찾지 못했습니다\n");
        return -1;
    }

    for (i = 0; i < 7; i++) {
        struct day_menu *d = &wk->day[i];
        time_t t = date_add_days(monday, i);
        struct tm tm = *localtime(&t);
        int shown_day;

        memset(d, 0, sizeof *d);
        d->year = tm.tm_year + 1900;
        d->month = tm.tm_mon + 1;
        d->day = tm.tm_mday;
        d->wday = tm.tm_wday;

        if ((th = find(p, end, "<th")) == NULL || (th = find(th, end, ">")) == NULL)
            goto bad;
        shown_day = atoi(th + 1);
        if (shown_day != d->day) {
            fprintf(stderr, "parse: %d번째 날짜가 %d일이어야 하는데 %d일입니다\n",
                    i + 1, d->day, shown_day);
            return -1;
        }
        if ((td = find(th, end, "<td")) == NULL || (td = find(td, end, ">")) == NULL ||
            (td_end = find(td, end, "</td>")) == NULL)
            goto bad;
        parse_cell(td + 1, td_end, d);
        p = td_end + 5;
    }
    return 0;

bad:
    fprintf(stderr, "parse: 식단표 %d번째 줄을 읽지 못했습니다\n", i + 1);
    return -1;
}

int week_any_registered(const struct week_menu *wk)
{
    int i;

    for (i = 0; i < 7; i++)
        if (wk->day[i].registered)
            return 1;
    return 0;
}

int week_all_registered(const struct week_menu *wk)
{
    int i;

    for (i = 0; i < 7; i++)
        if (!wk->day[i].registered)
            return 0;
    return 1;
}
