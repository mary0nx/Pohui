import { ChevronRight, MapPin, TramFront } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { Card, Segmented, Skeleton } from "@/components/ui";

import {
  clock,
  defaultDirection,
  minutesUntil,
  transfersText,
  untilText,
  usePlaces,
  usePlan,
  type Plan,
  type RouteOption,
} from "./api";
import { LineBadge } from "./parts";

/** Re-render every 30 s so "через N мин" stays true between refreshes. */
function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** "Доброе утро! Куда сегодня едем?" by the time of day in Wrocław. */
export function askLine(now = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const hello =
    h < 5
      ? "Доброй ночи"
      : h < 12
        ? "Доброе утро"
        : h < 18
          ? "Добрый день"
          : "Добрый вечер";
  return `${hello}! Куда сегодня едем?`;
}

export function bestOf(plan: Plan): RouteOption | null {
  const all = [
    ...(plan.walk_option ? [plan.walk_option] : []),
    ...plan.options,
  ];
  return (
    all.find((o) => o.recommended) ??
    plan.options[0] ??
    plan.walk_option ??
    null
  );
}

/** Home screen: the best way to work (or home) right now, in a few words. */
export function RouteCard() {
  const places = usePlaces();
  const [dir, setDir] = useState(defaultDirection);
  const home = places.data?.places.find((p) => p.kind === "home");
  const work = places.data?.places.find((p) => p.kind === "work");
  const query = useMemo(
    () =>
      home && work
        ? {
            from: dir === "to_work" ? home.id : work.id,
            to: dir === "to_work" ? work.id : home.id,
            mode: "depart" as const,
            at: null,
          }
        : null,
    [home, work, dir],
  );
  const plan = usePlan(query);
  const now = useNow();

  if (places.isPending || places.isError) return null;
  if (!home || !work)
    return (
      <Link
        to="/route/places"
        className="press flex items-center gap-3 rounded-[22px] bg-lavender-soft px-4 py-3 shadow-card"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-lavender text-lavender-ink">
          <TramFront className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-heading">
            Мой маршрут
          </span>
          <span className="block text-xs text-muted">
            Добавьте дом и работу — здесь появится ближайший трамвай или автобус
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    );

  const details = query ? `/route?from=${query.from}&to=${query.to}` : "/route";
  const best = plan.data ? bestOf(plan.data) : null;
  const ride = best?.first_ride ?? null;
  const leave = best ? minutesUntil(best.depart_at, now) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
          <TramFront className="size-5 text-coral-ink" aria-hidden /> Мой
          маршрут
        </h2>
        <Link
          to={details}
          className="press inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-sm font-bold text-coral-ink hover:bg-peach-soft"
        >
          Подробнее <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <p className="-mt-1 text-sm text-muted">{askLine()}</p>
      <Segmented
        value={dir}
        onChange={setDir}
        options={[
          { value: "to_work", label: `${home.title} → ${work.title}` },
          { value: "to_home", label: `${work.title} → ${home.title}` },
        ]}
      />
      {plan.isPending ? (
        <Skeleton className="h-16 w-full rounded-2xl" />
      ) : plan.isError ? (
        <p className="text-sm text-muted">
          Не удалось построить маршрут. Попробуйте позже.
        </p>
      ) : plan.data.status !== "ok" || !best ? (
        <p className="text-sm text-muted">
          {plan.data.message ?? "Маршрут не найден."}
        </p>
      ) : (
        <Link
          to={details}
          className="block rounded-2xl bg-surface-2 p-3"
          aria-label="Открыть варианты маршрута"
        >
          {ride ? (
            <>
              <div className="flex items-center gap-2">
                <LineBadge leg={ride} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
                  «{ride.from_stop?.name}»
                </span>
                <span className="shrink-0 text-[15px] font-extrabold tabular-nums text-coral-ink">
                  {ride.departure_at ? clock(ride.departure_at) : ""}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {leave !== null && leave >= 0 ? (
                  <span className="font-bold text-heading">
                    Выйти {untilText(leave)}
                  </span>
                ) : (
                  <span className="font-bold text-heading">Уже пора</span>
                )}
                {" · "}
                {best.duration_min} мин в пути · {transfersText(best.transfers)}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <MapPin className="size-4 text-coral-ink" aria-hidden /> Пешком{" "}
              {best.duration_min} мин — быстрее транспорта
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted">
            По расписанию
            {plan.data.schedule?.stale
              ? " · расписание давно не обновлялось"
              : ""}
          </p>
        </Link>
      )}
    </Card>
  );
}
