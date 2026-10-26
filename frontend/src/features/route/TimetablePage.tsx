import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Clock, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  ErrorState,
  Input,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { cn } from "@/lib/cn";

import type { Schedule } from "./api";
import { LineBadge } from "./parts";

type Status = "ok" | "no_schedule" | "loading";

interface LineBrief {
  line: string;
  mode: string;
  night: boolean;
  runs: boolean;
  directions: { id: string; headsign: string }[];
}
interface LinesResp {
  status: Status;
  date: string;
  schedule: Schedule | null;
  lines: LineBrief[];
}
interface StopRef {
  id: string;
  name: string;
  code: string;
}
interface LineDetail {
  status: Status;
  line: string;
  mode: string;
  night: boolean;
  directions: { id: string; headsign: string; stops: StopRef[] }[];
}
interface Departure {
  at: string;
  time: string;
  hour: number;
  headsign: string;
  other_end: boolean;
  next: boolean;
}
interface DeparturesResp {
  status: Status;
  date: string;
  schedule: Schedule | null;
  line: string;
  mode: string;
  night: boolean;
  direction: { id: string; headsign: string } | null;
  stop: StopRef | null;
  departures: Departure[];
}
interface StopSearch {
  status: Status;
  stops: { name: string; lines: string[] }[];
}
interface BoardResp {
  status: Status;
  schedule: Schedule | null;
  name: string;
  rows: {
    at: string;
    time: string;
    minutes: number;
    line: string;
    mode: string;
    night: boolean;
    headsign: string;
    platform: string;
  }[];
}

const MESSAGE: Record<Exclude<Status, "ok">, string> = {
  no_schedule: "Нет действующего расписания на эту дату.",
  loading:
    "Загружаем расписание — это занимает до минуты после перезапуска сервера. Страница обновится сама.",
};

function isoDay(plus = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(
    new Date(Date.now() + plus * 86_400_000),
  );
}

function dayLabel(iso: string, i: number): string {
  if (i === 0) return "Сегодня";
  if (i === 1) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${iso}T12:00:00`));
}

function DayPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const days = Array.from({ length: 8 }, (_, i) => isoDay(i));
  return (
    <Select
      label="День"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {days.map((d, i) => (
        <option key={d} value={d}>
          {dayLabel(d, i)}
        </option>
      ))}
    </Select>
  );
}

const refetchWhileLoading = (q: { state: { data?: { status: Status } } }) =>
  q.state.data?.status === "loading" ? 15_000 : false;

function Note({ schedule }: { schedule: Schedule | null | undefined }) {
  return (
    <p className="px-1 text-xs text-muted">
      Время — по расписанию, задержки не учитываются. Источник: открытые данные
      Вроцлава (CC0)
      {schedule?.valid_to
        ? `, расписание действует по ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${schedule.valid_to}T12:00:00`))}`
        : ""}
      .
    </p>
  );
}

function LineChip({ l, href }: { l: LineBrief; href: string }) {
  const tone = l.night
    ? "bg-[#2f3550] text-white"
    : l.mode === "tram"
      ? "bg-coral text-on-bright"
      : "bg-lavender text-lavender-ink";
  return (
    <Link
      to={href}
      className={cn(
        "press flex h-12 items-center justify-center rounded-2xl text-[15px] font-extrabold tabular-nums shadow-card",
        tone,
        !l.runs && "opacity-40",
      )}
      aria-label={`${l.mode === "tram" ? "Трамвай" : "Автобус"} ${l.line}${l.runs ? "" : ", в этот день не ходит"}`}
    >
      {l.line}
    </Link>
  );
}

function Lines({ day, setDay }: { day: string; setDay: (d: string) => void }) {
  const q = useQuery({
    queryKey: ["transit", "lines", day],
    queryFn: () => api<LinesResp>("/transit/lines", { query: { date: day } }),
    staleTime: 10 * 60_000,
    refetchInterval: refetchWhileLoading,
  });
  const groups: [string, (l: LineBrief) => boolean][] = [
    ["Трамваи", (l) => l.mode === "tram"],
    ["Автобусы", (l) => l.mode !== "tram" && !l.night],
    ["Ночные", (l) => l.night],
  ];
  return (
    <div className="space-y-4">
      <DayPicker value={day} onChange={setDay} />
      {q.isPending ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.status !== "ok" ? (
        <Card className="text-[15px]">{MESSAGE[q.data.status]}</Card>
      ) : (
        <>
          {groups.map(([title, test]) => {
            const ls = q.data.lines.filter(test);
            if (!ls.length) return null;
            return (
              <section key={title} className="space-y-2">
                <h2 className="px-1 text-sm font-bold text-muted">{title}</h2>
                <div className="grid grid-cols-5 gap-2 min-[400px]:grid-cols-6">
                  {ls.map((l) => (
                    <LineChip
                      key={l.line}
                      l={l}
                      href={`?line=${encodeURIComponent(l.line)}&date=${day}`}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          <p className="px-1 text-xs text-muted">
            Бледные номера в выбранный день не ходят.
          </p>
          <Note schedule={q.data.schedule} />
        </>
      )}
    </div>
  );
}

function LineStops({ line, day }: { line: string; day: string }) {
  const [params, setParams] = useSearchParams();
  const q = useQuery({
    queryKey: ["transit", "line", line, day],
    queryFn: () =>
      api<LineDetail>(`/transit/lines/${encodeURIComponent(line)}`, {
        query: { date: day },
      }),
    staleTime: 10 * 60_000,
    refetchInterval: refetchWhileLoading,
  });
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />;
  if (q.isError)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.status !== "ok")
    return <Card className="text-[15px]">{MESSAGE[q.data.status]}</Card>;
  const dirs = q.data.directions;
  const dirId = params.get("dir") ?? dirs[0]?.id ?? "";
  const dir = dirs.find((d) => d.id === dirId) ?? dirs[0];
  if (!dir) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <LineBadge
          leg={{ mode: q.data.mode, line: q.data.line, night: q.data.night }}
        />
        <span className="text-sm text-muted">
          выберите направление и остановку
        </span>
      </div>
      {dirs.length > 1 && (
        <Segmented
          value={dir.id}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("dir", v);
            setParams(next, { replace: true });
          }}
          options={dirs
            .slice(0, 3)
            .map((d) => ({ value: d.id, label: `→ ${d.headsign}` }))}
        />
      )}
      <Card className="p-0">
        <ol aria-label={`Остановки в направлении ${dir.headsign}`}>
          {dir.stops.map((s, i) => {
            const last = i === dir.stops.length - 1;
            return (
              <li key={`${s.id}-${i}`}>
                <Link
                  to={`?line=${encodeURIComponent(line)}&dir=${encodeURIComponent(dir.id)}&stop=${encodeURIComponent(s.id)}&date=${day}`}
                  className={cn(
                    "flex items-center gap-3 px-4",
                    last && "pointer-events-none",
                  )}
                  aria-disabled={last}
                >
                  <span
                    className="relative flex h-12 w-4 shrink-0 justify-center"
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "absolute w-0.5 bg-border",
                        i === 0
                          ? "top-1/2 bottom-0"
                          : last
                            ? "top-0 bottom-1/2"
                            : "inset-y-0",
                      )}
                    />
                    <span
                      className={cn(
                        "relative mt-[18px] size-3 rounded-full border-2 bg-surface",
                        q.data.mode === "tram"
                          ? "border-coral"
                          : "border-lavender-ink",
                        (i === 0 || last) && "size-3.5 bg-heading",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[15px]",
                      (i === 0 || last) && "font-bold",
                    )}
                  >
                    {s.name}
                  </span>
                  {!last && (
                    <ChevronRight
                      className="size-4 shrink-0 text-muted"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function StopTimes({
  line,
  dir,
  stop,
  day,
  setDay,
}: {
  line: string;
  dir: string;
  stop: string;
  day: string;
  setDay: (d: string) => void;
}) {
  const q = useQuery({
    queryKey: ["transit", "deps", line, dir, stop, day],
    queryFn: () =>
      api<DeparturesResp>(
        `/transit/lines/${encodeURIComponent(line)}/departures`,
        { query: { direction: dir, stop, date: day } },
      ),
    staleTime: 60_000,
    refetchInterval: refetchWhileLoading,
  });
  useEffect(() => {
    document
      .querySelector('[data-next="true"]')
      ?.scrollIntoView({ block: "center" });
  }, [q.data]);
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />;
  if (q.isError)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (d.status !== "ok")
    return <Card className="text-[15px]">{MESSAGE[d.status]}</Card>;
  // Rows by clock hour, in timetable order (after-midnight hours stay at the end).
  const rows: { hour: number; deps: Departure[] }[] = [];
  for (const x of d.departures) {
    const last = rows[rows.length - 1];
    if (last && last.hour === x.hour) last.deps.push(x);
    else rows.push({ hour: x.hour, deps: [x] });
  }
  const others = [
    ...new Set(d.departures.filter((x) => x.other_end).map((x) => x.headsign)),
  ];
  const mark = (h: string) => "abcdefgh"[others.indexOf(h)] ?? "";
  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <LineBadge leg={{ mode: d.mode, line: d.line, night: d.night }} />
          <span className="font-bold">→ {d.direction?.headsign}</span>
        </div>
        <p className="text-[15px]">
          Остановка <span className="font-bold">«{d.stop?.name}»</span>
        </p>
        <Link
          to={`?board=${encodeURIComponent(d.stop?.name ?? "")}`}
          className="inline-flex items-center gap-1 text-sm font-bold text-coral-ink"
        >
          <Clock className="size-4" aria-hidden /> Все отправления с этой
          остановки
        </Link>
      </Card>
      <DayPicker value={day} onChange={setDay} />
      {rows.length === 0 ? (
        <Card className="text-[15px]">
          В этот день с этой остановки рейсов нет.
        </Card>
      ) : (
        <Card className="p-0">
          <table
            className="w-full text-[15px] tabular-nums"
            aria-label="Отправления по часам"
          >
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={`${r.hour}-${i}`}>
                  <th
                    scope="row"
                    className="w-12 bg-surface-2 py-2 text-center align-top font-extrabold"
                  >
                    {String(r.hour).padStart(2, "0")}
                  </th>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {r.deps.map((x, k) => (
                        <span
                          key={k}
                          data-next={x.next}
                          className={cn(
                            "rounded-lg px-1",
                            x.next && "bg-coral font-extrabold text-on-bright",
                          )}
                          title={x.other_end ? `до «${x.headsign}»` : undefined}
                        >
                          {x.time.slice(3)}
                          {x.other_end && (
                            <sup className="ml-0.5 text-[10px] font-bold">
                              {mark(x.headsign)}
                            </sup>
                          )}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {others.length > 0 && (
        <ul className="space-y-0.5 px-1 text-xs text-muted">
          {others.map((h) => (
            <li key={h}>
              <sup className="font-bold">{mark(h)}</sup> — рейс до «{h}»
            </li>
          ))}
        </ul>
      )}
      {d.departures.some((x) => x.next) && (
        <p className="px-1 text-xs text-muted">
          Выделено ближайшее отправление.
        </p>
      )}
      <Note schedule={d.schedule} />
    </div>
  );
}

function StopsSearch() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const res = useQuery({
    queryKey: ["transit", "stops", term],
    queryFn: () =>
      api<StopSearch>("/transit/stops/search", { query: { q: term } }),
    enabled: term.length >= 2,
    staleTime: 10 * 60_000,
  });
  return (
    <div className="space-y-3">
      <Input
        label="Остановка"
        placeholder="Например: Plac Grunwaldzki"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {res.data && res.data.status !== "ok" && (
        <Card className="text-[15px]">{MESSAGE[res.data.status]}</Card>
      )}
      {res.data?.status === "ok" && (
        <Card className="divide-y divide-border p-0">
          {res.data.stops.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">Ничего не нашли.</p>
          )}
          {res.data.stops.map((s) => (
            <Link
              key={s.name}
              to={`?board=${encodeURIComponent(s.name)}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="block truncate text-xs text-muted">
                  {s.lines.join(", ")}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted"
                aria-hidden
              />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}

function Board({ name }: { name: string }) {
  const q = useQuery({
    queryKey: ["transit", "board", name],
    queryFn: () => api<BoardResp>("/transit/stops/board", { query: { name } }),
    refetchInterval: 60_000,
  });
  if (q.isPending) return <Skeleton className="h-96 w-full rounded-card" />;
  if (q.isError)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.status !== "ok")
    return <Card className="text-[15px]">{MESSAGE[q.data.status]}</Card>;
  return (
    <div className="space-y-3">
      <h2 className="px-1 text-lg font-extrabold">
        «{q.data.name}» — ближайшие отправления
      </h2>
      {q.data.rows.length === 0 ? (
        <Card className="text-[15px]">В ближайшие 2 часа рейсов нет.</Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {q.data.rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-12 shrink-0 font-extrabold tabular-nums">
                {r.time}
              </span>
              <LineBadge leg={r} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">
                → {r.headsign}
              </span>
              <span className="shrink-0 text-sm font-bold text-coral-ink tabular-nums">
                {r.minutes <= 0 ? "сейчас" : `${r.minutes} мин`}
              </span>
            </div>
          ))}
        </Card>
      )}
      <Note schedule={q.data.schedule} />
    </div>
  );
}

/** Timetables of all trams and buses in both directions, like a printed stop schedule. */
export function TimetablePage() {
  const [params, setParams] = useSearchParams();
  const line = params.get("line");
  const stop = params.get("stop");
  const dir = params.get("dir");
  const board = params.get("board");
  const day = params.get("date") ?? isoDay(0);
  const [tab, setTab] = useState<"lines" | "stops">("lines");
  const setDay = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("date", v);
    setParams(next, { replace: true });
  };
  const back =
    board || stop
      ? line
        ? `/route/timetable?line=${encodeURIComponent(line)}${dir ? `&dir=${encodeURIComponent(dir)}` : ""}&date=${day}`
        : "/route/timetable"
      : line
        ? "/route/timetable"
        : "/route/places";
  return (
    <div className="space-y-4">
      <PageHeader
        title="Расписание"
        subtitle="Трамваи и автобусы Вроцлава"
        back={back}
      />
      {board ? (
        <Board name={board} />
      ) : line && dir && stop ? (
        <StopTimes
          line={line}
          dir={dir}
          stop={stop}
          day={day}
          setDay={setDay}
        />
      ) : line ? (
        <LineStops line={line} day={day} />
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "lines", label: "Линии" },
              { value: "stops", label: "Остановки" },
            ]}
          />
          {tab === "lines" ? (
            <Lines day={day} setDay={setDay} />
          ) : (
            <StopsSearch />
          )}
        </>
      )}
    </div>
  );
}
