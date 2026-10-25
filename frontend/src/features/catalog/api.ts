import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import type { CatalogCategory, CatalogSearch } from "@/types/api";

/** Value that settles `delay` ms after the last change (typing → one request). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return settled;
}

/** Catalogue search. Results are cached per query for the session; a newer query aborts the
 * older request (TanStack passes the AbortSignal), so a slow answer never overwrites a fresh one. */
export function useCatalogSearch(query: string, opts: { category?: string | null; limit?: number; enabled?: boolean } = {}) {
  const { f, familyId } = useFamily();
  const q = query.trim();
  return useQuery({
    queryKey: ["catalog", q.toLowerCase(), opts.category ?? null, opts.limit ?? 8],
    queryFn: ({ signal }) => api<CatalogSearch>(f("/catalog"), { query: { q: q || undefined, category: opts.category || undefined, limit: opts.limit ?? 8 }, signal }),
    enabled: Boolean(familyId) && (opts.enabled ?? true),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

export function useCatalogCategories() {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["catalog-categories"], queryFn: () => api<CatalogCategory[]>(f("/catalog/categories")), enabled: Boolean(familyId), staleTime: Infinity });
}
