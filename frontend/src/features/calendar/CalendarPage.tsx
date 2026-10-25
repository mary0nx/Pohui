import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Briefcase, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark } from "@/components/Visibility";
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingBlock, Segmented, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatMonth, formatTime, relativeDay } from "@/lib/format";
import { holidaysBetween, type Holiday } from "@/lib/holidays";
import { haptic } from "@/lib/telegram";
import { addDays, addMonths, monthKey, todayIn, weekdayIndex, zonedDate } from "@/lib/time";
import type { Occurrence } from "@/types/api";

import { useOccurrences, useShifts, type Shift, type ShiftKind } from "./api";
import { EventSheet } from "./EventSheet";
import { LAYERS, useCalendarLayers } from "./layers";
import { ShiftSheet } from "./ShiftSheet";

const VIEW_STORAGE = "familyos.calendar-view";
const SHIFT_LABEL: Record<ShiftKind, string> = { day: "Дневная смена", night: "Ночная смена" };
const SHIFT_STYLE: Record<ShiftKind, { background: string; color: string }> = {
  day: { background: "var(--shift-day)", color: "var(--shift-day-fg)" },
  night: { background: "var(--shift-night)", color: "var(--shift-night-fg)" },
};
const NEXT_SHIFT: Record<string, ShiftKind | null> = { none: "day", day: "night", night: null };
const MARK = Object.fromEntries(LAYERS.map((l) => [l.kind, l.mark])) as Record<Holiday["kind"], string>;
const LEGEND: Record<Holiday["kind"], string> = { public: "выходной", trading: "торговое", catholic: "катол.", orthodox: "правосл." };

function readView(): "agenda" | "month" {
  try {
    return localStorage.getItem(VIEW_STORAGE) === "agenda" ? "agenda" : "month";
  } catch {
    return "month";
  }
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function CalendarPage() {
  const { tz, f } = useFamily();
  const today = todayIn(tz);
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<"agenda" | "month">(readView);
  const [shiftSheet, setShiftSheet] = useState(false);
  const [editingShifts, setEditingShifts] = useState(false);
  const [layers] = useCalendarLayers();
  const setView = (v: "agenda" | "month") => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_STORAGE, v);
    } catch {
      /* ignore */
    }
  };
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
  const shiftsQ = useShifts(range.from, range.to);
  const shifts = useMemo(() => new Map((shiftsQ.data ?? []).map((s) => [s.day, s.kind])), [shiftsQ.data]);
  const holidays = useMemo(() => holidaysBetween(range.from, range.to, layers), [range, layers]);
  const setShift = useMutation({
    mutationFn: ({ day, kind }: { day: string; kind: ShiftKind | null }) => api(f(`/calendar/shifts/${day}`), { method: "PUT", body: { kind } }),
    onMutate: async ({ day, kind }) => {
      haptic("select");
      await qc.cancelQueries({ queryKey: ["shifts"] });
      qc.setQueriesData<Shift[]>({ queryKey: ["shifts"] }, (prev) => {
        if (!prev) return prev;
        const rest = prev.filter((s) => s.day !== day);
        return kind ? [...rest, { day, kind }] : rest;
      });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });

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

  const agendaDays = useMemo(() => {
    const days = new Set<string>([...byDay.keys(), ...holidays.keys()]);
    return [...days].filter((d) => d >= today).sort();
  }, [byDay, holidays, today]);

  const onDayClick = (day: string) => {
    if (editingShifts) setShift.mutate({ day, kind: NEXT_SHIFT[shifts.get(day) ?? "none"] ?? null });
    else setSelected(day);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Календарь"
        action={
          <div className="flex items-center gap-1">
            <IconButton label="Рабочий график и праздники" onClick={() => setShiftSheet(true)}>
              <Briefcase className="size-5" />
            </IconButton>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openCreate(true)}>
              Событие
            </Button>
          </div>
        }
      />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "month", label: "Месяц" },
          { value: "agenda", label: "Список" },
        ]}
      />
      {q.isPending ? (
        <LoadingBlock rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : view === "month" ? (
        <>
          {editingShifts && (
            <Card className="flex items-center gap-3 border-accent bg-accent-soft py-2.5 text-sm">
              <span className="flex-1">Нажимайте на дни: дневная → ночная → выходной</span>
              <Button size="sm" onClick={() => setEditingShifts(false)}>
                Готово
              </Button>
            </Card>
          )}
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
                const shift = shifts.get(day);
                const dayHolidays = holidays.get(day) ?? [];
                const marks = [...new Set(dayHolidays.map((h) => MARK[h.kind]))];
                const isPublic = dayHolidays.some((h) => h.kind === "public");
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onDayClick(day)}
                    aria-label={[formatDate(day, tz, { day: "numeric", month: "long" }), shift && SHIFT_LABEL[shift], ...dayHolidays.map((h) => h.name)].filter(Boolean).join(", ")}
                    aria-pressed={selected === day}
                    style={shift ? SHIFT_STYLE[shift] : undefined}
                    className={cn(
                      "mx-auto flex h-11 w-10 flex-col items-center justify-center rounded-xl text-sm transition",
                      !inMonth && (shift ? "opacity-70" : "text-subtle"),
                      !shift && isPublic && "font-semibold text-danger",
                      day === today && "font-bold underline decoration-2 underline-offset-2",
                      selected === day && !editingShifts && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                    )}
                  >
                    {Number(day.slice(8))}
                    <span className="flex h-3 items-center gap-0.5 text-[9px] leading-none">
                      {count > 0 && <span className={cn("size-1 rounded-full", shift ? "bg-current" : "bg-accent")} />}
                      {marks.map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="size-3 rounded" style={SHIFT_STYLE.day} /> день
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 rounded" style={SHIFT_STYLE.night} /> ночь
              </span>
              {LAYERS.filter((l) => layers.includes(l.kind)).map((l) => (
                <span key={l.kind}>
                  {l.mark} {LEGEND[l.kind]}
                </span>
              ))}
            </div>
          </Card>
          <DayList day={selected} items={byDay.get(selected) ?? []} today={today} shift={shifts.get(selected)} holidays={holidays.get(selected) ?? []} onCreate={() => openCreate(true)} />
        </>
      ) : agendaDays.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarDays className="size-6" />} title="Свободный месяц" text="Событий на ближайшие 30 дней нет." action={<Button onClick={() => openCreate(true)}>Добавить событие</Button>} />
        </Card>
      ) : (
        <div className="space-y-4">
          {agendaDays.map((day) => (
            <DayList key={day} day={day} items={byDay.get(day) ?? []} today={today} shift={shifts.get(day)} holidays={holidays.get(day) ?? []} />
          ))}
        </div>
      )}
      <Link to="/home/life" className="flex items-center gap-2 px-1 text-sm text-muted">
        <List className="size-4" /> Планы на выходные и идеи — в разделе «Вместе»
      </Link>
      <EventSheet open={creating} onOpenChange={openCreate} defaultDate={view === "month" ? selected : undefined} />
      <ShiftSheet open={shiftSheet} onOpenChange={setShiftSheet} defaultDay={selected} editing={editingShifts} onEditingChange={setEditingShifts} />
    </div>
  );
}

function DayList({
  day,
  items,
  today,
  shift,
  holidays,
  onCreate,
}: {
  day: string;
  items: Occurrence[];
  today: string;
  shift?: ShiftKind;
  holidays: Holiday[];
  onCreate?: () => void;
}) {
  const { tz } = useFamily();
  const extras = Boolean(shift) || holidays.length > 0;
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {relativeDay(day, today) ?? ""} {formatDate(day, tz, { day: "numeric", month: "long", weekday: "long" })}
      </h3>
      {extras && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {shift && (
            <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={SHIFT_STYLE[shift]}>
              {SHIFT_LABEL[shift]}
            </span>
          )}
          {holidays.map((h) => (
            <span key={h.kind + h.name} className={cn("rounded-full bg-surface-2 px-2.5 py-1 text-xs", h.kind === "public" && "font-medium text-danger")}>
              {MARK[h.kind]} {h.name}
            </span>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        extras && !onCreate ? null : (
          <Card className="flex items-center justify-between">
            <span className="text-sm text-muted">Событий нет</span>
            {onCreate && (
              <Button size="sm" variant="soft" onClick={onCreate}>
                Добавить
              </Button>
            )}
          </Card>
        )
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
