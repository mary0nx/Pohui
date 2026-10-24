import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import type { Account, Budget, Category, FinanceSummary, Page, RecurringRule, SavingsGoal, ScheduledPayment, Transaction } from "@/types/api";

export function useAccounts(includeArchived = false) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["accounts", familyId, includeArchived],
    queryFn: () => api<Account[]>(f("/finance/accounts"), { query: { include_archived: includeArchived } }),
  });
}

export function useCategories() {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["categories", familyId], queryFn: () => api<Category[]>(f("/finance/categories")), staleTime: 300_000 });
}

export interface TxFilters {
  kind?: string;
  category_id?: string;
  member_id?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
  offset?: number;
}

export function useTransactions(filters: TxFilters) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["transactions", familyId, filters],
    queryFn: () => api<Page<Transaction>>(f("/finance/transactions"), { query: { limit: 50, ...filters } }),
    placeholderData: (prev) => prev,
  });
}

export function useSummary(month: string, scope: "family" | "personal" | "all" = "family") {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["summary", familyId, month, scope],
    queryFn: () => api<FinanceSummary>(f("/finance/summary"), { query: { month, scope } }),
    placeholderData: (prev) => prev,
  });
}

export function useBudgets(month: string) {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["budgets", familyId, month], queryFn: () => api<Budget[]>(f("/finance/budgets"), { query: { month } }) });
}

export function useRecurring() {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["recurring", familyId], queryFn: () => api<RecurringRule[]>(f("/finance/recurring")) });
}

export function useScheduled(status?: string) {
  const { f, familyId } = useFamily();
  return useQuery({
    queryKey: ["scheduled", familyId, status],
    queryFn: () => api<ScheduledPayment[]>(f("/finance/scheduled-payments"), { query: { status } }),
  });
}

export function useGoals() {
  const { f, familyId } = useFamily();
  return useQuery({ queryKey: ["goals", familyId], queryFn: () => api<SavingsGoal[]>(f("/finance/goals")) });
}

/** Invalidate everything derived from transactions. */
export function useFinanceInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["transactions", "summary", "accounts", "budgets", "dashboard", "scheduled", "recurring", "goals"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

export function useFinanceMutation<TVars, TOut = unknown>(fn: (vars: TVars) => Promise<TOut>) {
  const invalidate = useFinanceInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}
