import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { Button, Input, Sheet, useToast } from "@/components/ui";
import { formatMoney } from "@/lib/format";

/** "500", "1 250,50" → "1250.50"; null when it is not a valid non-negative amount. */
export function parseAmount(raw: string): string | null {
  const clean = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) return null;
  return clean;
}

/** Set or change the family's overall budget for a month (owner/admin). Saved only when the
 * server confirms; the home screen and the budgets tab then refresh from the server. */
export function BudgetSheet({ open, onOpenChange, month, current }: { open: boolean; onOpenChange: (v: boolean) => void; month: string; current: string | null }) {
  const { f, currency } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue(current ? String(Number(current)).replace(".", ",") : "");
  }, [open, current]);
  const amount = parseAmount(value);
  const save = useMutation({
    mutationFn: (limit: string) => api(f("/finance/budgets"), { method: "PUT", body: { month, limit_amount: limit } }),
    onSuccess: async (_r, limit) => {
      await Promise.all(["dashboard", "budgets", "summary"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.show(`Бюджет сохранён: ${formatMoney(limit, currency)}`);
      onOpenChange(false);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={current ? "Изменить бюджет" : "Задать бюджет"}
      description="Сколько семья планирует потратить за месяц. Расходы уменьшают остаток."
      footer={
        <Button block loading={save.isPending} disabled={!amount} onClick={() => amount && save.mutate(amount)}>
          Сохранить
        </Button>
      }
    >
      <Input
        label={`Бюджет на месяц, ${currency}`}
        inputMode="decimal"
        placeholder="500"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={value && !amount ? "Введите сумму, например 500 или 1250,50" : undefined}
        autoFocus
      />
    </Sheet>
  );
}
