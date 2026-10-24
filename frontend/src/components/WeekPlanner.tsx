import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { addDays, todayIn, weekdayIndex } from "@/lib/time";

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function dayMonth(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]}`;
}

/** "Пн, 27 окт" style label for chips and sheet titles. */
export function shortDayLabel(date: string): string {
  return `${WEEKDAYS_SHORT[weekdayIndex(date)]}, ${dayMonth(date)}`;
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

interface Props {
  tz: string;
  /** Items planned for the given day (YYYY-MM-DD); nothing rendered means an empty day. */
  renderDay: (day: string) => ReactNode;
  onAdd: (day: string) => void;
  addLabel: string;
}

/** Monday-to-Sunday week with a "+" on every day; past days of the current week stay visible. */
export function WeekPlanner({ tz, renderDay, onAdd, addLabel }: Props) {
  const today = todayIn(tz);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const current = monday === mondayOf(today);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <button type="button" aria-label="Предыдущая неделя" className="flex size-9 items-center justify-center rounded-full text-muted active:bg-surface-2" onClick={() => setMonday(addDays(monday, -7))}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">
            {dayMonth(days[0]!)} – {dayMonth(days[6]!)}
          </p>
          {current ? (
            <p className="text-xs text-muted">Эта неделя</p>
          ) : (
            <button type="button" className="text-xs font-medium text-accent" onClick={() => setMonday(mondayOf(today))}>
              Вернуться к этой неделе
            </button>
          )}
        </div>
        <button type="button" aria-label="Следующая неделя" className="flex size-9 items-center justify-center rounded-full text-muted active:bg-surface-2" onClick={() => setMonday(addDays(monday, 7))}>
          <ChevronRight className="size-5" />
        </button>
      </div>
      {days.map((day) => {
        const isToday = day === today;
        const past = day < today;
        const content = renderDay(day);
        return (
          <section key={day} aria-label={`${WEEKDAYS[weekdayIndex(day)]}, ${dayMonth(day)}`} className={cn("rounded-card border bg-surface", isToday ? "border-accent" : "border-border", past && "opacity-60")}>
            <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <p className="flex-1 text-sm">
                <span className="font-semibold">{WEEKDAYS[weekdayIndex(day)]}</span> <span className="text-muted">{dayMonth(day)}</span>
                {isToday && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">сегодня</span>}
              </p>
              <button
                type="button"
                aria-label={`${addLabel}: ${shortDayLabel(day)}`}
                onClick={() => onAdd(day)}
                className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent-strong transition active:scale-95"
              >
                <Plus className="size-5" />
              </button>
            </div>
            {content && <div className="border-t border-border">{content}</div>}
          </section>
        );
      })}
      <p className="px-1 text-xs text-muted">В 9:00 выбранного дня придёт напоминание в Telegram.</p>
    </div>
  );
}
