import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import type { ShoppingList, ShoppingListDetail } from "@/types/api";

export function useLists(includeArchived = false) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["shopping-lists", familyId, includeArchived],
    queryFn: () => api<ShoppingList[]>(f("/shopping/lists"), { query: { include_archived: includeArchived } }),
  });
}

/** Shared list: refetch every 5 s so both partners see each other's changes. */
export function useListDetail(id: string | undefined) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["shopping-list", familyId, id],
    queryFn: () => api<ShoppingListDetail>(f(`/shopping/lists/${id}`)),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useShoppingInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all(["shopping-lists", "shopping-list", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
