import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import type { CalendarEvent, Occurrence } from "@/types/api";

export function useOccurrences(dateFrom: string, dateTo: string) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["occurrences", familyId, dateFrom, dateTo],
    queryFn: () => api<Occurrence[]>(f("/calendar/occurrences"), { query: { date_from: dateFrom, date_to: dateTo } }),
    placeholderData: (prev) => prev,
  });
}

export function useEvent(id: string | undefined) {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["event", familyId, id], queryFn: () => api<CalendarEvent>(f(`/calendar/events/${id}`)), enabled: Boolean(id) });
}

export function useCalendarInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all(["occurrences", "event", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export type ShiftKind = "day" | "night";
export interface Shift {
  day: string;
  kind: ShiftKind;
}

/** The current user's own work shifts (day/night) between two dates. */
export function useShifts(dateFrom: string, dateTo: string) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["shifts", familyId, dateFrom, dateTo],
    queryFn: () => api<Shift[]>(f("/calendar/shifts"), { query: { date_from: dateFrom, date_to: dateTo } }),
    placeholderData: (prev) => prev,
  });
}
