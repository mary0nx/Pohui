import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";

export type PlaceKind = "home" | "work" | "other";
export type Prefer = "fastest" | "fewer_transfers" | "less_walking";
export type TimeKind = "scheduled" | "predicted" | "confirmed";

export interface Place {
  id: string;
  kind: PlaceKind;
  title: string;
  label: string | null;
  estate: string | null;
  lat: number | null;
  lon: number | null;
  shared: boolean;
  mine: boolean;
  owner_name: string | null;
  position: number;
}

export interface Places {
  places: Place[];
  shared: Place[];
}

export interface AddressHit {
  id: string;
  label: string;
  street: string;
  number: string;
  postcode: string;
  estate: string;
  lat: number;
  lon: number;
}

export interface SearchResult {
  addresses: AddressHit[];
  streets: { street: string; count: number }[];
  source: string;
}

export interface NearStop {
  name: string;
  code: string;
  near_address?: string | null;
  distance_m: number;
  walk_min: number;
  lat: number;
  lon: number;
  lines: string[];
  modes: string[];
}

export interface AddressCheck {
  address: AddressHit;
  stops: NearStop[] | null;
  osm_url: string;
}

export interface Stop {
  name: string;
  code: string;
  near_address?: string | null;
  lat: number | null;
  lon: number | null;
}

export interface Leg {
  kind: "walk" | "ride";
  minutes: number;
  metres: number | null;
  from_name: string | null;
  to_name: string | null;
  mode: string | null;
  line: string | null;
  night: boolean;
  headsign: string | null;
  from_stop: Stop | null;
  to_stop: Stop | null;
  departure_at: string | null;
  arrival_at: string | null;
  stops: number | null;
  time_kind: TimeKind;
  delay_min: number | null;
  wait_min: number | null;
}

export interface RouteOption {
  id: string;
  provider: "gtfs" | "jakdojade";
  tags: string[];
  recommended: boolean;
  depart_at: string;
  arrive_at: string;
  duration_min: number;
  transfers: number;
  walk_m: number;
  walk_min: number;
  legs: Leg[];
  time_kind: TimeKind;
  warnings: string[];
  first_ride: Leg | null;
}

export interface Schedule {
  provider: "gtfs" | "jakdojade";
  source: string;
  license: string | null;
  name: string | null;
  valid_from: string | null;
  valid_to: string | null;
  fetched_at: string | null;
  checked_at: string | null;
  stale: boolean;
}

export type PlanStatus =
  | "ok"
  | "no_route"
  | "no_stops_start"
  | "no_stops_end"
  | "no_schedule"
  | "loading"
  | "same_place";

export interface Plan {
  status: PlanStatus;
  message: string | null;
  mode: "depart" | "arrive";
  at: string;
  from_title: string;
  to_title: string;
  options: RouteOption[];
  walk_option: RouteOption | null;
  schedule: Schedule | null;
  realtime: boolean;
  jakdojade_url: string | null;
  notes: string[];
}

export interface Favorite {
  id: string;
  from_place_id: string;
  to_place_id: string;
}

export interface Preferences {
  prefer: Prefer;
  max_walk_m: number;
}

export interface PlanQuery {
  from: string;
  to: string;
  mode: "depart" | "arrive";
  at: string | null; // null: now
}

export const usePlaces = () =>
  useQuery({
    queryKey: ["places"],
    queryFn: () => api<Places>("/me/places"),
    staleTime: 60_000,
    retry: 1,
  });
export const useFavorites = () =>
  useQuery({
    queryKey: ["route", "favorites"],
    queryFn: () => api<Favorite[]>("/me/route/favorites"),
  });
export const usePreferences = () =>
  useQuery({
    queryKey: ["route", "prefs"],
    queryFn: () => api<Preferences>("/me/route/preferences"),
  });

/** A plan; with `at: null` it is "leave now" and refreshes every minute while shown. */
export function usePlan(q: PlanQuery | null) {
  return useQuery({
    queryKey: ["route", "plan", q],
    queryFn: () =>
      api<Plan>("/me/route/plan", {
        method: "POST",
        body: {
          from_place_id: q!.from,
          to_place_id: q!.to,
          mode: q!.mode,
          at: q!.at,
        },
      }),
    enabled: q !== null,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.status === "loading"
        ? 15_000
        : q?.at === null
          ? 60_000
          : false,
    retry: 1,
  });
}

export function useSavePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      id?: string;
      kind: PlaceKind;
      title: string;
      address_id?: string;
      shared: boolean;
    }) =>
      p.id
        ? api<Place>(`/me/places/${p.id}`, {
            method: "PATCH",
            body: {
              kind: p.kind,
              title: p.title,
              shared: p.shared,
              ...(p.address_id ? { address_id: p.address_id } : {}),
            },
          })
        : api<Place>("/me/places", {
            method: "POST",
            body: {
              kind: p.kind,
              title: p.title,
              address_id: p.address_id,
              shared: p.shared,
            },
          }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["places"] });
      await qc.invalidateQueries({ queryKey: ["route"] });
    },
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/me/places/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["places"] });
      await qc.invalidateQueries({ queryKey: ["route"] });
    },
  });
}

export const searchAddresses = (q: string, signal?: AbortSignal) =>
  api<SearchResult>("/me/places/search", {
    method: "POST",
    body: { q },
    signal,
  });
export const checkAddress = (addressId: string) =>
  api<AddressCheck>("/me/places/check", {
    method: "POST",
    body: { address_id: addressId },
  });

/** Home → work in the morning, work → home from 14:00 (Wrocław time). */
export function defaultDirection(now = new Date()): "to_work" | "to_home" {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return h < 14 ? "to_work" : "to_home";
}

export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}

export function clock(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function untilText(min: number): string {
  if (min <= 0) return "сейчас";
  if (min < 60) return `через ${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `через ${h} ч ${m} мин` : `через ${h} ч`;
}

export function transfersText(n: number): string {
  if (n === 0) return "без пересадок";
  if (n === 1) return "1 пересадка";
  if (n < 5) return `${n} пересадки`;
  return `${n} пересадок`;
}

export const TAG_LABEL: Record<string, string> = {
  fastest: "Быстрее всего",
  latest_departure: "Выйти позже всего",
  fewer_transfers: "Меньше пересадок",
  less_walking: "Меньше пешком",
  later: "Следующий рейс",
  earlier: "С запасом",
  walk: "Пешком",
  by_transit: "На транспорте",
};

export const MODE_LABEL: Record<string, string> = {
  tram: "Трамвай",
  bus: "Автобус",
  rail: "Поезд",
  other: "Транспорт",
};
