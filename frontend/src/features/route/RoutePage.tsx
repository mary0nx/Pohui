import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  ExternalLink,
  MapPinned,
  RefreshCw,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  IconButton,
  Input,
  LoadingBlock,
  Section,
  Segmented,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";

import {
  clock,
  defaultDirection,
  TAG_LABEL,
  useFavorites,
  usePlaces,
  usePlan,
  usePreferences,
  type Favorite,
  type Place,
  type Plan,
  type PlanQuery,
  type Preferences,
  type RouteOption,
} from "./api";
import { LineBadge, OptionSummary, RouteSteps, TightTransfer } from "./parts";

function localDateTime(date: string, time: string): string {
  // The chosen wall-clock time in Wrocław, sent with its offset.
  const probe = new Date(`${date}T${time}:00Z`);
  const offset =
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Warsaw",
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  const sign = offset.replace("GMT", "") || "+00:00";
  return `${date}T${time}:00${sign}`;
}

function todayIso(plusDays = 0): string {
  const d = new Date(Date.now() + plusDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(
    d,
  );
}

function nowHm(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function OptionCard({
  o,
  plan,
  open,
  onToggle,
}: {
  o: RouteOption;
  plan: Plan;
  open: boolean;
  onToggle: () => void;
}) {
  const rides = o.legs.filter((l) => l.kind === "ride");
  return (
    <Card className={cn("space-y-2", o.recommended && "ring-2 ring-coral/60")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {o.recommended && <Badge tone="accent">Рекомендуем</Badge>}
          {o.tags.map((t) => (
            <Badge key={t}>{TAG_LABEL[t] ?? t}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {rides.length ? (
            rides.map((r, i) => <LineBadge key={i} leg={r} size="sm" />)
          ) : (
            <span className="text-sm font-bold">Пешком</span>
          )}
        </div>
        <div className="mt-1.5">
          <OptionSummary o={o} />
          {o.first_ride && (
            <p className="text-sm">
              Выйти в{" "}
              <span className="font-bold tabular-nums">
                {clock(o.depart_at)}
              </span>
              , посадка «{o.first_ride.from_stop?.name}» в{" "}
              <span className="font-bold tabular-nums">
                {o.first_ride.departure_at
                  ? clock(o.first_ride.departure_at)
                  : ""}
              </span>
            </p>
          )}
        </div>
        <TightTransfer o={o} />
      </button>
      {open && (
        <div className="border-t border-border pt-3">
          <RouteSteps o={o} from={plan.from_title} to={plan.to_title} />
        </div>
      )}
    </Card>
  );
}

function PlaceSelect({
  label,
  value,
  onChange,
  places,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  places: Place[];
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {places.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
          {p.mine ? "" : ` (${p.owner_name ?? "семья"})`}
        </option>
      ))}
    </Select>
  );
}

function SourceNote({ plan }: { plan: Plan }) {
  const s = plan.schedule;
  if (!s) return null;
  const fmt = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("ru-RU", {
          timeZone: "Europe/Warsaw",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))
      : "—";
  const day = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat("ru-RU", {
          day: "numeric",
          month: "long",
        }).format(new Date(`${d}T12:00:00`))
      : "";
  return (
    <div
      className={cn(
        "space-y-1 rounded-[20px] p-3 text-xs",
        s.stale ? "bg-warning-soft" : "bg-surface-2 text-muted",
      )}
    >
      {plan.notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
      <p>
        Источник: {s.source}
        {s.license ? `, лицензия ${s.license}` : ""}.
      </p>
      {s.valid_from && (
        <p>
          Расписание действует с {day(s.valid_from)} по {day(s.valid_to)}.
          Проверено: {fmt(s.checked_at)}.
        </p>
      )}
    </div>
  );
}

/** Route options between two places: depart now / at a time / arrive by. */
export function RoutePage() {
  const places = usePlaces();
  const [params, setParams] = useSearchParams();
  const all = useMemo(
    () => [...(places.data?.places ?? []), ...(places.data?.shared ?? [])],
    [places.data],
  );
  const home = places.data?.places.find((p) => p.kind === "home");
  const work = places.data?.places.find((p) => p.kind === "work");
  const dir = defaultDirection();
  const from =
    params.get("from") ??
    (dir === "to_work" ? home?.id : work?.id) ??
    all[0]?.id ??
    "";
  const to =
    params.get("to") ??
    (dir === "to_work" ? work?.id : home?.id) ??
    all.find((p) => p.id !== from)?.id ??
    "";
  const [mode, setMode] = useState<"now" | "depart" | "arrive">("now");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowHm());
  const [openId, setOpenId] = useState<string | null>(null);
  const query: PlanQuery | null =
    from && to && from !== to
      ? {
          from,
          to,
          mode: mode === "arrive" ? "arrive" : "depart",
          at: mode === "now" ? null : localDateTime(date, time),
        }
      : null;
  const plan = usePlan(query);
  const favorites = useFavorites();
  const prefs = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();

  const fav = favorites.data?.find(
    (f) => f.from_place_id === from && f.to_place_id === to,
  );
  const toggleFav = useMutation({
    mutationFn: async (): Promise<void> => {
      if (fav)
        await api<void>(`/me/route/favorites/${fav.id}`, { method: "DELETE" });
      else
        await api<Favorite>("/me/route/favorites", {
          method: "POST",
          body: { from_place_id: from, to_place_id: to },
        });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["route", "favorites"] });
      toast.show(fav ? "Убрано из избранного" : "Маршрут в избранном");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const savePrefs = useMutation({
    mutationFn: (p: Preferences) =>
      api<Preferences>("/me/route/preferences", { method: "PUT", body: p }),
    onSuccess: async (data) => {
      qc.setQueryData(["route", "prefs"], data);
      await qc.invalidateQueries({ queryKey: ["route", "plan"] });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (places.isPending) return <LoadingBlock />;
  if (places.isError)
    return <ErrorState error={places.error} onRetry={() => places.refetch()} />;
  const set = (key: "from" | "to", value: string) => {
    const next = new URLSearchParams(params);
    next.set("from", key === "from" ? value : from);
    next.set("to", key === "to" ? value : to);
    setParams(next, { replace: true });
  };

  if (all.length < 2)
    return (
      <div className="space-y-5">
        <PageHeader title="Мой маршрут" back="/" />
        <Card className="space-y-3 text-center">
          <MapPinned className="mx-auto size-10 text-coral-ink" aria-hidden />
          <p className="text-[15px]">
            Добавьте два места — например, дом и работу. Маршрут считается по
            официальному расписанию трамваев и автобусов Вроцлава.
          </p>
          <Link to="/route/places">
            <Button block>Добавить места</Button>
          </Link>
        </Card>
      </div>
    );

  const options = plan.data
    ? [
        ...(plan.data.walk_option &&
        plan.data.walk_option.tags.some(
          (t) => t === "fastest" || t === "latest_departure",
        )
          ? [plan.data.walk_option]
          : []),
        ...plan.data.options,
        ...(plan.data.walk_option &&
        !plan.data.walk_option.tags.some(
          (t) => t === "fastest" || t === "latest_departure",
        )
          ? [plan.data.walk_option]
          : []),
      ]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Мой маршрут"
        back="/"
        action={
          <IconButton
            label={fav ? "Убрать из избранного" : "В избранное"}
            onClick={() => toggleFav.mutate()}
            disabled={!query}
          >
            <Star
              className={cn("size-5", fav && "fill-lemon text-lemon-ink")}
            />
          </IconButton>
        }
      />
      <Card className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-3">
            <PlaceSelect
              label="Откуда"
              value={from}
              onChange={(v) => set("from", v)}
              places={all}
            />
            <PlaceSelect
              label="Куда"
              value={to}
              onChange={(v) => set("to", v)}
              places={all}
            />
          </div>
          <IconButton
            label="Поменять местами"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("from", to);
              next.set("to", from);
              setParams(next, { replace: true });
            }}
          >
            <ArrowUpDown className="size-5" />
          </IconButton>
        </div>
        {from === to && (
          <p className="text-sm text-danger">Выберите два разных места.</p>
        )}
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "now", label: "Сейчас" },
            { value: "depart", label: "Выезд в" },
            { value: "arrive", label: "Прибыть к" },
          ]}
        />
        {mode !== "now" && (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="День"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              <option value={todayIso()}>Сегодня</option>
              <option value={todayIso(1)}>Завтра</option>
              <option value={todayIso(2)}>Послезавтра</option>
            </Select>
            <Input
              label="Время"
              type="time"
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
            />
          </div>
        )}
      </Card>

      <Section
        title="Варианты"
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="size-4" />}
            loading={plan.isFetching}
            onClick={() => plan.refetch()}
          >
            Обновить
          </Button>
        }
      >
        {!query ? null : plan.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
          </div>
        ) : plan.isError ? (
          <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
        ) : plan.data.status !== "ok" ? (
          <Card className="space-y-2">
            <p className="text-[15px]">{plan.data.message}</p>
            {plan.data.status === "loading" && (
              <p className="text-sm text-muted">Страница обновится сама.</p>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {options.map((o) => (
              <OptionCard
                key={o.id}
                o={o}
                plan={plan.data}
                open={openId === o.id}
                onToggle={() => setOpenId(openId === o.id ? null : o.id)}
              />
            ))}
          </div>
        )}
        {plan.data && <SourceNote plan={plan.data} />}
        {plan.data?.jakdojade_url && (
          <a
            href={plan.data.jakdojade_url}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-1.5 rounded-full px-1 text-sm font-bold text-coral-ink"
          >
            Открыть эту поездку в Jakdojade{" "}
            <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </Section>

      {prefs.data && (
        <Section title="Предпочтения">
          <Card className="space-y-3">
            <Select
              label="Что рекомендовать"
              value={prefs.data.prefer}
              onChange={(e) =>
                savePrefs.mutate({
                  ...prefs.data,
                  prefer: e.target.value as Preferences["prefer"],
                })
              }
            >
              <option value="fastest">Быстрее всего</option>
              <option value="fewer_transfers">Меньше пересадок</option>
              <option value="less_walking">Меньше пешком</option>
            </Select>
            <Select
              label="Пешком до остановки — не больше"
              value={String(prefs.data.max_walk_m)}
              onChange={(e) =>
                savePrefs.mutate({
                  ...prefs.data,
                  max_walk_m: Number(e.target.value),
                })
              }
            >
              {[500, 750, 1000, 1500, 2000].map((m) => (
                <option key={m} value={m}>
                  {m} м
                </option>
              ))}
            </Select>
          </Card>
        </Section>
      )}

      <Link
        to="/route/places"
        className="press flex items-center gap-2 px-1 text-sm font-bold text-coral-ink"
      >
        <MapPinned className="size-4" aria-hidden /> Мои места
      </Link>
    </div>
  );
}
