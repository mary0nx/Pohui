import {
  Briefcase,
  ChevronRight,
  ExternalLink,
  Home,
  MapPin,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { errorMessage } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Section,
  Segmented,
  Sheet,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";

import {
  checkAddress,
  searchAddresses,
  useDeletePlace,
  usePlaces,
  useSavePlace,
  type AddressCheck,
  type Place,
  type PlaceKind,
  type SearchResult,
} from "./api";
import { MiniMap } from "./parts";

const KIND_TITLE: Record<PlaceKind, string> = {
  home: "Дом",
  work: "Работа",
  other: "",
};
const KIND_ICON = { home: Home, work: Briefcase, other: MapPin } as const;

function PlaceRow({ p, onEdit }: { p: Place; onEdit?: () => void }) {
  const Icon = KIND_ICON[p.kind];
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-peach-soft text-coral-ink">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{p.title}</span>
        <span className="block truncate text-sm text-muted">
          {p.label ?? "Адрес нужно указать заново"}
        </span>
        {!p.mine && (
          <span className="block text-xs text-muted">
            Делится: {p.owner_name}
          </span>
        )}
        {p.mine && p.shared && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Users className="size-3" aria-hidden /> Видно семье
          </span>
        )}
      </span>
      {onEdit && (
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      )}
    </>
  );
  return onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 px-4 py-3 text-left"
    >
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
  );
}

/** Address search with suggestions from the city's register; nothing leaves Family OS. */
function AddressSearch({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setRes(null);
      return;
    }
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        setRes(await searchAddresses(text, ctl.signal));
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => {
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="space-y-2">
      <Input
        ref={input}
        label="Адрес во Вроцлаве"
        placeholder="Например: Legnicka 58"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        hint="Улица и номер дома, можно без польских букв"
      />
      {busy && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted">
          <Spinner /> Ищем…
        </p>
      )}
      {error && <p className="px-1 text-sm text-danger">{error}</p>}
      {res && (
        <ul
          className="divide-y divide-border overflow-hidden rounded-[20px] bg-surface-2"
          aria-label="Найденные адреса"
        >
          {res.addresses.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick(a.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <MapPin
                  className="size-4 shrink-0 text-coral-ink"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{a.label}</span>
                  <span className="block text-xs text-muted">
                    {a.postcode} · {a.estate}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {res.streets.map((s) => (
            <li key={s.street}>
              <button
                type="button"
                onClick={() => {
                  setQ(`${s.street} `);
                  input.current?.focus();
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <Search className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold">{s.street}</span>
                  <span className="block text-xs text-muted">
                    Добавьте номер дома ({s.count} адресов)
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!res.addresses.length && !res.streets.length && (
            <li className="px-3 py-2.5 text-sm text-muted">
              Ничего не нашли. Проверьте улицу и номер дома.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function PlaceSheet({
  open,
  onClose,
  place,
  kinds,
}: {
  open: boolean;
  onClose: () => void;
  place: Place | null;
  kinds: PlaceKind[];
}) {
  const [kind, setKind] = useState<PlaceKind>(
    place?.kind ?? kinds[0] ?? "other",
  );
  const [title, setTitle] = useState(
    place?.title ?? KIND_TITLE[kinds[0] ?? "other"],
  );
  const [shared, setShared] = useState(place?.shared ?? false);
  const [picked, setPicked] = useState<AddressCheck | null>(null);
  const [changing, setChanging] = useState(place === null);
  const [checking, setChecking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSavePlace();
  const del = useDeletePlace();
  const toast = useToast();

  const pick = async (id: string) => {
    setChecking(true);
    try {
      setPicked(await checkAddress(id));
      setChanging(false);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setChecking(false);
    }
  };
  const submit = () =>
    save.mutate(
      {
        id: place?.id,
        kind,
        title: title.trim() || KIND_TITLE[kind] || "Место",
        address_id: picked?.address.id,
        shared,
      },
      {
        onSuccess: () => {
          toast.show("Сохранено");
          onClose();
        },
        onError: (e) => toast.show(errorMessage(e), "error"),
      },
    );
  const kindOptions = (["home", "work", "other"] as PlaceKind[]).filter(
    (k) => kinds.includes(k) || k === place?.kind,
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={place ? "Место" : "Новое место"}
      description="Адрес видите только вы. Семье — только если включите."
      footer={
        <div className="space-y-2">
          <Button
            block
            onClick={submit}
            loading={save.isPending}
            disabled={(!place && !picked) || changing}
          >
            {picked ? "Подтвердить и сохранить" : "Сохранить"}
          </Button>
          {place && (
            <Button
              block
              variant="ghost"
              className="text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Удалить место
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {kindOptions.length > 1 && (
          <Segmented
            value={kind}
            onChange={(k) => {
              setKind(k);
              if (!title || Object.values(KIND_TITLE).includes(title))
                setTitle(KIND_TITLE[k]);
            }}
            options={kindOptions.map((k) => ({
              value: k,
              label: k === "home" ? "Дом" : k === "work" ? "Работа" : "Другое",
            }))}
          />
        )}
        <Input
          label="Название"
          value={title}
          maxLength={40}
          placeholder="Например: Садик"
          onChange={(e) => setTitle(e.target.value)}
        />
        {place && !changing && !picked && (
          <Card
            tone="plain"
            className="flex items-center justify-between gap-2 bg-surface-2 shadow-none"
          >
            <span className="min-w-0">
              <span className="block font-semibold">
                {place.label ?? "Адрес не читается"}
              </span>
              <span className="block text-xs text-muted">{place.estate}</span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setChanging(true)}
            >
              Изменить
            </Button>
          </Card>
        )}
        {changing && <AddressSearch onPick={pick} />}
        {checking && <LoadingBlock />}
        {picked && !changing && (
          <div className="space-y-3">
            <div className="rounded-[20px] bg-surface-2 p-3">
              <p className="font-bold">{picked.address.label}</p>
              <p className="text-sm text-muted">
                {picked.address.postcode} Wrocław · {picked.address.estate}
              </p>
            </div>
            {picked.stops?.length ? (
              <>
                <MiniMap
                  lat={picked.address.lat}
                  lon={picked.address.lon}
                  stops={picked.stops}
                  label={picked.address.label}
                />
                <ul className="space-y-1 text-sm">
                  {picked.stops.map((s) => (
                    <li key={s.code + s.name}>
                      <span className="font-semibold">«{s.name}»</span>
                      {s.near_address ? ` (возле ${s.near_address})` : ""} — ≈
                      {s.distance_m} м, {s.walk_min} мин пешком ·{" "}
                      {s.lines.join(", ")}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted">
                {picked.stops === null
                  ? "Ближайшие остановки покажем, когда загрузится расписание."
                  : "В пределах 700 м остановок нет."}
              </p>
            )}
            <p className="text-xs text-muted">
              Это то место? Проверьте номер дома и остановки рядом.
            </p>
            <a
              href={picked.osm_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-bold text-coral-ink"
            >
              Посмотреть на карте OpenStreetMap{" "}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
              Выбрать другой адрес
            </Button>
          </div>
        )}
        <Switch
          label="Показывать семье"
          description="Члены семьи смогут строить маршрут к этому месту и увидят адрес."
          checked={shared}
          onChange={setShared}
        />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Удалить место?"
        description="Избранные маршруты с ним тоже удалятся."
        confirmLabel="Удалить"
        danger
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(place!.id, {
            onSuccess: () => {
              toast.show("Место удалено");
              onClose();
            },
            onError: (e) => toast.show(errorMessage(e), "error"),
          })
        }
      />
    </Sheet>
  );
}

/** «Мои места»: home, work and other places for «Мой маршрут». */
export function PlacesPage() {
  const places = usePlaces();
  const [editing, setEditing] = useState<Place | null | "new">(null);
  if (places.isPending) return <LoadingBlock />;
  if (places.isError)
    return <ErrorState error={places.error} onRetry={() => places.refetch()} />;
  const own = places.data.places;
  const free: PlaceKind[] = [
    ...(own.some((p) => p.kind === "home") ? [] : ["home" as const]),
    ...(own.some((p) => p.kind === "work") ? [] : ["work" as const]),
    "other",
  ];
  return (
    <div className="space-y-5">
      <PageHeader title="Мои места" back="/route" />
      {own.length === 0 ? (
        <EmptyState
          art="house"
          title="Пока нет мест"
          text="Начните с дома и работы — на главной появится ближайший транспорт."
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {own.map((p) => (
            <PlaceRow key={p.id} p={p} onEdit={() => setEditing(p)} />
          ))}
        </Card>
      )}
      <Button
        block
        icon={<Plus className="size-5" />}
        onClick={() => setEditing("new")}
      >
        {free.includes("home")
          ? "Добавить дом"
          : free.includes("work")
            ? "Добавить работу"
            : "Добавить место"}
      </Button>
      {places.data.shared.length > 0 && (
        <Section title="Места семьи">
          <Card className="divide-y divide-border p-0">
            {places.data.shared.map((p) => (
              <PlaceRow key={p.id} p={p} />
            ))}
          </Card>
        </Section>
      )}
      <p className="px-1 text-xs text-muted">
        Адреса ищутся по официальному справочнику адресов Вроцлава прямо на
        нашем сервере — в сторонние сервисы они не передаются. В базе адрес
        хранится зашифрованным.{" "}
        <Link to="/route" className="font-semibold text-coral-ink">
          К маршрутам →
        </Link>
      </p>
      {editing !== null && (
        <PlaceSheet
          open
          onClose={() => setEditing(null)}
          place={editing === "new" ? null : editing}
          kinds={
            editing === "new"
              ? free
              : (["home", "work", "other"] as PlaceKind[]).filter(
                  (k) => free.includes(k) || k === (editing as Place).kind,
                )
          }
        />
      )}
    </div>
  );
}
