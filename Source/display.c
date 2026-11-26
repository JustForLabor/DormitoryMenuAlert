/* display.c - 터미널 출력 */
#include <stdio.h>
#include <unistd.h>

#include "menu.h"

static void print_meal_line(const struct day_menu *d, enum meal m)
{
    printf("  %s  %s\n", meal_name(m), d->meal[m][0] ? d->meal[m] : "-");
}

void print_day(const struct day_menu *d, int today)
{
    int bold = isatty(STDOUT_FILENO);
    int m;

    printf("%s%04d-%02d-%02d (%s)%s%s\n", bold ? "\033[1m" : "", d->year, d->month,
           d->day, weekday_name(d->wday), today ? "  <- 오늘" : "", bold ? "\033[0m" : "");
    if (!d->registered) {
        printf("  (미등록)\n");
        return;
    }
    for (m = 0; m < MEAL_COUNT; m++)
        print_meal_line(d, (enum meal)m);
}
