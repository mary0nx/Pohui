import { Copy, Plus } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, ProgressBar, Select, Sheet, useToast } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { addMonths, monthKey, todayIn } from "@/lib/time";
import type { Budget } from "@/types/api";

import { useBudgets, useCategories, useFinanceMutation } from "./api";
import { MonthSwitcher } from "./MonthSwitcher";

export function BudgetsTab() {
  const { tz, currency, f } = useFamily();
  const [month, setMonth] = useState(monthKey(todayIn(tz)));
  const budgets = useBudgets(month);
  const categories = useCategories();
  const toast = useToast();
  const [edit, setEdit] = useState<{ category_id: string; amount: string } | null>(null);

  const save = useFinanceMutation((v: { category_id: string; amount: string }) =>
    api<Budget[]>(f("/finance/budgets"), { method: "PUT", body: { month: `${month}-01`, category_id: v.category_id || null, limit_amount: v.amount.replace(",", ".") } }),
  );
  const remove = useFinanceMutation((id: string) => api(f(`/finance/budgets/${id}`), { method: "DELETE" }));
  const copy = useFinanceMutation(() => api<Budget[]>(f("/finance/budgets/copy"), { body: { from_month: `${addMonths(month, -1)}-01`, to_month: `${month}-01` } }));

  const catName = (id: string | null) => (id ? (categories.data?.find((c) => c.id === id)?.name ?? "—") : "Весь месяц");
  const expenseCats = (categories.data ?? []).filter((c) => c.kind === "expense" && !c.parent_id);

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} onChange={setMonth} />
      {budgets.isPending ? (
        <LoadingBlock />
      ) : budgets.isError ? (
        <ErrorState error={budgets.error} onRetry={() => budgets.refetch()} />
      ) : budgets.data.length === 0 ? (
        <Card>
          <EmptyState
            art="jar"
            title="Бюджет не задан"
            text="Задайте общий лимит на месяц или лимиты по категориям — мы предупредим при 80% и 100%."
            action={
              <div className="flex flex-col gap-2">
                <Button icon={<Plus className="size-4" />} onClick={() => setEdit({ category_id: "", amount: "" })}>
                  Задать лимит
                </Button>
                <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} loading={copy.isPending} onClick={() => copy.mutate(undefined, { onSuccess: (r) => toast.show(r.length ? "Бюджет скопирован" : "В прошлом месяце бюджета не было") })}>
                  Скопировать с прошлого месяца
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          {budgets.data.map((b) => (
            <Card key={b.id} className="space-y-2">
              <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setEdit({ category_id: b.category_id ?? "", amount: b.limit_amount })}>
                <span className="font-medium">{catName(b.category_id)}</span>
                <Badge tone={b.level === "ok" ? "accent" : b.level === "warning" ? "warning" : "danger"}>{Math.round(b.percent)}%</Badge>
              </button>
              <ProgressBar value={b.percent} level={b.level} />
              <div className="tabular flex justify-between text-sm text-muted">
                <span>{formatMoney(b.spent, currency)}</span>
                <span>из {formatMoney(b.limit_amount, currency)}</span>
              </div>
            </Card>
          ))}
          <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setEdit({ category_id: "", amount: "" })}>
            Добавить лимит
          </Button>
        </>
      )}
      <Sheet
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title="Лимит бюджета"
        footer={
          <div className="flex gap-2">
            {budgets.data?.some((b) => (b.category_id ?? "") === edit?.category_id) && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const b = budgets.data!.find((x) => (x.category_id ?? "") === edit?.category_id)!;
                  await remove.mutateAsync(b.id);
                  setEdit(null);
                }}
              >
                Удалить
              </Button>
            )}
            <Button
              block
              loading={save.isPending}
              disabled={!edit || !/^\d+([.,]\d{1,2})?$/.test(edit.amount)}
              onClick={async () => {
                try {
                  await save.mutateAsync(edit!);
                  toast.show("Лимит сохранён");
                  setEdit(null);
                } catch (e) {
                  toast.show(errorMessage(e), "error");
                }
              }}
            >
              Сохранить
            </Button>
          </div>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Select label="Категория" value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>
              <option value="">Весь месяц (общий лимит)</option>
              {expenseCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input label={`Лимит, ${currency}`} inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
