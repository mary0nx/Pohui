import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { useToast } from "@/components/ui";
import { todayIn } from "@/lib/time";

import { pageFor, type DailyPage } from "./schedule";

export interface DailyFavorite {
  phrase_id: string;
  text: string;
  day: string;
  created_at: string;
}

/** Today's local date in the family's time zone; turns over at midnight while the app is open. */
export function useToday(timeZone: string): string {
  const [date, setDate] = useState(() => todayIn(timeZone));
  useEffect(() => {
    const tick = () => setDate((prev) => {
      const now = todayIn(timeZone);
      return now === prev ? prev : now;
    });
    tick();
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timeZone]);
  return date;
}

/** The phrase collection is a separate chunk: the home screen never waits for it. */
export function useDailyContent() {
  return useQuery({ queryKey: ["daily", "content"], queryFn: () => import("./content"), staleTime: Infinity, gcTime: Infinity, retry: 1 });
}

/** Today's page for the active family: the same for every member, stable through the day. */
export function useDailyPage(): { page: DailyPage | null; failed: boolean } {
  const { familyId, tz } = useFamily();
  const date = useToday(tz);
  const content = useDailyContent();
  const page = useMemo(() => (content.data ? pageFor(content.data, familyId, date) : null), [content.data, familyId, date]);
  return { page, failed: content.isError };
}

const SAFE_SVG = (text: string) => text.trimStart().startsWith("<svg") && !/<script|<foreignObject|\son\w+\s*=|href\s*=/i.test(text);

/** One illustration (a few KB), fetched only when shown and cached for the session. */
export function useDailyArt(id: string | null) {
  return useQuery({
    queryKey: ["daily", "art", id],
    enabled: id !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}daily/${id}.svg`, { signal });
      const text = res.ok ? await res.text() : "";
      if (!SAFE_SVG(text)) throw new Error("illustration unavailable");
      return text;
    },
  });
}

/** The user's saved phrases (personal, stored on the server). */
export function useDailyFavorites(enabled: boolean) {
  return useQuery({ queryKey: ["daily", "favorites"], queryFn: () => api<DailyFavorite[]>("/me/daily-favorites"), enabled });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["daily", "favorites"];
  return useMutation({
    mutationFn: ({ save, id, text, day }: { save: boolean; id: string; text: string; day: string }) =>
      save ? api(`/me/daily-favorites/${id}`, { method: "PUT", body: { text, day } }) : api(`/me/daily-favorites/${id}`, { method: "DELETE" }),
    onMutate: async ({ save, id, text, day }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<DailyFavorite[]>(key);
      qc.setQueryData<DailyFavorite[]>(key, (list = []) =>
        save ? [{ phrase_id: id, text, day, created_at: new Date().toISOString() }, ...list.filter((f) => f.phrase_id !== id)] : list.filter((f) => f.phrase_id !== id),
      );
      return { before };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(key, ctx?.before);
      toast.show(errorMessage(e), "error");
    },
    onSuccess: (_r, { save }) => toast.show(save ? "Сохранено в избранное" : "Убрано из избранного"),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
