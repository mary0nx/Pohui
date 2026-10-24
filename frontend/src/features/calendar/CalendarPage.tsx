import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark } from "@/components/Visibility";
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingBlock, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatMonth, formatTime, relativeDay } from "@/lib/format";
import { addDays, addMonths, monthKey, todayIn, weekdayIndex, zonedDate } from "@/lib/time";
import type { Occurrence } from "@/types/api";

import { useOccurrences } from "./api";
import { EventSheet } from "./EventSheet";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function CalendarPage() {
  const { tz } = useFamily();
  const today = todayIn(tz);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"agenda" | "month">("agenda");
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const creating = params.get("new") === "1";

  const range = useMemo(() => {
    if (view === "month") {
      const grid = monthGrid(month);
      return { from: grid[0]!, to: grid[41]! };
    }
    return { from: today, to: addDays(today, 30) };
  }, [view, month, today]);
  const q = useOccurrences(range.from, range.to);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of q.data ?? []) {
      let day = zonedDate(o.start, tz);
      const last = o.all_day ? addDays(zonedDate(o.end, tz), -1) : zonedDate(o.end, tz);
      // Multi-day events appear on each day they cover.
      for (let i = 0; i < 31 && day <= last; i++) {
        map.set(day, [...(map.get(day) ?? []), o]);
        day = addDays(day, 1);
      }
    }
    return map;
  }, [q.data, tz]);

  const openCreate = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь"
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openCreate(true)}>
            Событие
          </Button>
        }
      />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "agenda", label: "Список" },
          { value: "month", label: "Месяц" },
        ]}
      />
      {q.isPending ? (
        <LoadingBlock rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : view === "month" ? (
        <>
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <IconButton label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft className="size-5" />
              </IconButton>
              <span className="font-semibold">{formatMonth(month)}</span>
              <IconButton label="Следующий месяц" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight className="size-5" />
              </IconButton>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {monthGrid(month).map((day) => {
                const count = byDay.get(day)?.length ?? 0;
                const inMonth = day.startsWith(month);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelected(day)}
                    aria-label={formatDate(day, tz, { day: "numeric", month: "long" })}
                    aria-pressed={selected === day}
                    className={cn(
                      "mx-auto flex size-10 flex-col items-center justify-center rounded-full text-sm transition",
                      !inMonth && "text-subtle",
                      day === today && "font-bold text-accent",
                      selected === day && "bg-accent text-accent-fg",
                    )}
                  >
                    {Number(day.slice(8))}
                    <span className={cn("mt-0.5 h-1 w-1 rounded-full", count ? (selected === day ? "bg-accent-fg" : "bg-accent") : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
          </Card>
          <DayList day={selected} items={byDay.get(selected) ?? []} today={today} onCreate={() => openCreate(true)} />
        </>
      ) : byDay.size === 0 ? (
        <Card>
          <EmptyState icon={<CalendarDays className="size-6" />} title="Свободный месяц" text="Событий на ближайшие 30 дней нет." action={<Button onClick={() => openCreate(true)}>Добавить событие</Button>} />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()]
            .filter(([d]) => d >= today)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, items]) => (
              <DayList key={day} day={day} items={items} today={today} />
            ))}
        </div>
      )}
      <Link to="/home/life" className="flex items-center gap-2 px-1 text-sm text-muted">
        <List className="size-4" /> Планы на выходные и идеи — в разделе «Вместе»
      </Link>
      <EventSheet open={creating} onOpenChange={openCreate} defaultDate={view === "month" ? selected : undefined} />
    </div>
  );
}

function DayList({ day, items, today, onCreate }: { day: string; items: Occurrence[]; today: string; onCreate?: () => void }) {
  const { tz } = useFamily();
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {relativeDay(day, today) ?? ""} {formatDate(day, tz, { day: "numeric", month: "long", weekday: "long" })}
      </h3>
      {items.length === 0 ? (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-muted">Событий нет</span>
          {onCreate && (
            <Button size="sm" variant="soft" onClick={onCreate}>
              Добавить
            </Button>
          )}
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {items.map((o) => (
            <Link key={`${o.event_id}-${o.start}`} to={`/calendar/${o.event_id}?at=${encodeURIComponent(o.start)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <div className="w-12 shrink-0 text-sm">
                {o.all_day ? <span className="text-muted">весь день</span> : <span className="tabular font-semibold">{formatTime(o.start, tz)}</span>}
              </div>
              <div className="min-w-0 flex-1 border-l-2 border-accent pl-3">
                <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                  {o.title} {o.visibility === "private" && <PrivateMark />} {o.recurring && <Repeat className="size-3.5 text-subtle" />}
                </p>
                {o.location && <p className="truncate text-xs text-muted">{o.location}</p>}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </section>
  );
}
