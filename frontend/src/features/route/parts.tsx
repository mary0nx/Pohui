import {
  AlertTriangle,
  BusFront,
  Footprints,
  MapPin,
  TrainFront,
  TramFront,
} from "lucide-react";

import { cn } from "@/lib/cn";

import {
  clock,
  MODE_LABEL,
  transfersText,
  type Leg,
  type NearStop,
  type RouteOption,
} from "./api";

const MODE_ICON = {
  tram: TramFront,
  bus: BusFront,
  rail: TrainFront,
  other: BusFront,
} as const;

export function ModeIcon({
  mode,
  className,
}: {
  mode: string | null;
  className?: string;
}) {
  const Icon =
    MODE_ICON[(mode ?? "other") as keyof typeof MODE_ICON] ?? BusFront;
  return <Icon className={className} aria-hidden />;
}

/** "🚋 10" — the vehicle and the line number, coloured by kind (night lines dark). */
export function LineBadge({
  leg,
  size = "md",
}: {
  leg: Pick<Leg, "mode" | "line" | "night">;
  size?: "sm" | "md";
}) {
  const tone = leg.night
    ? "bg-[#2f3550] text-white"
    : leg.mode === "tram"
      ? "bg-coral text-on-bright"
      : "bg-lavender text-lavender-ink";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-extrabold tabular-nums",
        tone,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      )}
      aria-label={`${MODE_LABEL[leg.mode ?? "other"] ?? "Транспорт"} ${leg.line ?? ""}${leg.night ? ", ночная линия" : ""}`}
    >
      <ModeIcon
        mode={leg.mode}
        className={size === "sm" ? "size-3.5" : "size-4"}
      />
      {leg.line}
    </span>
  );
}

/** One line under an option: times, duration, changes, walking. */
export function OptionSummary({ o }: { o: RouteOption }) {
  return (
    <p className="text-sm text-muted">
      <span className="font-bold text-heading tabular-nums">
        {clock(o.depart_at)} → {clock(o.arrive_at)}
      </span>
      {" · "}
      {o.duration_min} мин · {transfersText(o.transfers)} · пешком {o.walk_min}{" "}
      мин
    </p>
  );
}

/** The trip as a vertical list of steps: walk, ride, change, walk. */
export function RouteSteps({
  o,
  from,
  to,
}: {
  o: RouteOption;
  from: string;
  to: string;
}) {
  const rides = o.legs.filter((l) => l.kind === "ride");
  return (
    <ol className="relative space-y-0" aria-label="Шаги маршрута">
      {o.legs.map((leg, i) => {
        const last = i === o.legs.length - 1;
        if (leg.kind === "walk") {
          const target = leg.to_name ?? to;
          const source = leg.from_name ?? from;
          const isChange = leg.from_name !== null && leg.to_name !== null;
          return (
            <li key={i} className="flex gap-3">
              <Rail kind="walk" last={last} />
              <div className="min-w-0 flex-1 pb-3">
                <p className="text-sm">
                  <Footprints
                    className="mr-1 inline size-4 text-muted"
                    aria-hidden
                  />
                  {isChange ? (
                    <>
                      Пересадка: пешком {leg.minutes} мин до «{target}»
                    </>
                  ) : leg.to_name ? (
                    <>
                      Пешком {leg.minutes} мин до остановки «{target}»
                    </>
                  ) : (
                    <>
                      Пешком {leg.minutes} мин{" "}
                      {leg.from_name ? `от «${source}» ` : ""}до места «{to}»
                    </>
                  )}
                  {leg.metres ? (
                    <span className="text-muted"> · ≈{leg.metres} м</span>
                  ) : null}
                </p>
              </div>
            </li>
          );
        }
        const n = rides.indexOf(leg);
        return (
          <li key={i} className="flex gap-3">
            <Rail kind="ride" last={last} mode={leg.mode} />
            <div className="min-w-0 flex-1 pb-3">
              {n > 0 && leg.wait_min !== null && leg.wait_min > 0 && (
                <p className="mb-1 text-xs text-muted">
                  Ожидание {leg.wait_min} мин
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <LineBadge leg={leg} />
                {leg.headsign && (
                  <span className="min-w-0 truncate text-sm font-semibold">
                    → {leg.headsign}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm">
                <span className="font-bold tabular-nums">
                  {leg.departure_at ? clock(leg.departure_at) : ""}
                </span>{" "}
                «{leg.from_stop?.name}»
                {leg.from_stop?.near_address && (
                  <span className="text-muted">
                    {" "}
                    · возле {leg.from_stop.near_address}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {leg.stops ? `${leg.stops} ост. · ` : ""}
                {leg.minutes} мин в пути · <TimeKindLabel leg={leg} />
              </p>
              <p className="text-sm">
                <span className="font-bold tabular-nums">
                  {leg.arrival_at ? clock(leg.arrival_at) : ""}
                </span>{" "}
                выход «{leg.to_stop?.name}»
              </p>
            </div>
          </li>
        );
      })}
      <li className="flex gap-3">
        <span className="flex w-6 justify-center">
          <MapPin className="size-5 text-coral-ink" aria-hidden />
        </span>
        <p className="text-sm font-bold">
          {to} · <span className="tabular-nums">{clock(o.arrive_at)}</span>
        </p>
      </li>
    </ol>
  );
}

function Rail({
  kind,
  last,
  mode,
}: {
  kind: "walk" | "ride";
  last: boolean;
  mode?: string | null;
}) {
  return (
    <span className="relative flex w-6 shrink-0 justify-center" aria-hidden>
      <span
        className={cn(
          "mt-1 size-3 rounded-full",
          kind === "ride"
            ? mode === "tram"
              ? "bg-coral"
              : "bg-lavender-ink"
            : "border-2 border-muted bg-surface",
        )}
      />
      {!last && (
        <span
          className={cn(
            "absolute bottom-0 top-5 w-0.5",
            kind === "ride"
              ? "bg-border"
              : "border-l-2 border-dotted border-muted/60",
          )}
        />
      )}
    </span>
  );
}

/** Never "real time" for a timetable: say exactly what the time is. */
export function TimeKindLabel({
  leg,
}: {
  leg: Pick<Leg, "time_kind" | "delay_min">;
}) {
  if (leg.time_kind === "confirmed") return <span>подтверждено</span>;
  if (leg.time_kind === "predicted")
    return (
      <span>
        прогноз{leg.delay_min ? `, задержка ${leg.delay_min} мин` : ""}
      </span>
    );
  return <span>по расписанию</span>;
}

export function TightTransfer({ o }: { o: RouteOption }) {
  if (!o.warnings.includes("tight_transfer")) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
      <AlertTriangle className="size-3.5" aria-hidden /> Короткая пересадка —
      при задержке можно не успеть
    </p>
  );
}

/** A small private map: the address and its nearest stops, drawn here (no map service sees it). */
export function MiniMap({
  lat,
  lon,
  stops,
  label,
}: {
  lat: number;
  lon: number;
  stops: NearStop[];
  label: string;
}) {
  const W = 320;
  const H = 180;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  const pts = stops.map((s) => ({
    s,
    x: (s.lon - lon) * kx,
    y: (lat - s.lat) * ky,
  }));
  // Fit the box around the address and its stops, leaving room for the names at the sides.
  const xs = [0, ...pts.map((p) => p.x)];
  const ys = [0, ...pts.map((p) => p.y)];
  const [x0, x1, y0, y1] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const scale = Math.min(
    (W - 170) / Math.max(150, x1 - x0),
    (H - 44) / Math.max(100, y1 - y0),
  );
  const ox = W / 2 - ((x0 + x1) / 2) * scale;
  const oy = H / 2 - ((y0 + y1) / 2) * scale;
  const cx = ox;
  const cy = oy;
  const px = (x: number) => ox + x * scale;
  const py = (y: number) => oy + y * scale;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-[20px] bg-mint-soft"
      role="img"
      aria-label={`Схема: ${label} и ближайшие остановки`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={Math.max(18, 300 * scale)}
        fill="none"
        stroke="var(--color-border)"
        strokeDasharray="4 5"
      />
      {pts.map(({ s, x, y }) => (
        <g key={s.code + s.name}>
          <line
            x1={cx}
            y1={cy}
            x2={px(x)}
            y2={py(y)}
            stroke="var(--color-border)"
            strokeWidth={1.5}
          />
          <circle
            cx={px(x)}
            cy={py(y)}
            r={6}
            fill={
              s.modes.includes("tram")
                ? "var(--color-coral)"
                : "var(--color-lavender-ink)"
            }
          />
          <text
            x={x < 0 ? px(x) - 10 : px(x) + 10}
            y={py(y) + 4}
            textAnchor={x < 0 ? "end" : "start"}
            fontSize={11}
            fontWeight={700}
            fill="var(--color-heading)"
          >
            {s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name}
          </text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r={8} fill="var(--color-heading)" />
      <circle cx={cx} cy={cy} r={3} fill="white" />
    </svg>
  );
}
