import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api, errorMessage, newIdempotencyKey } from "@/api/client";
import { useFamily } from "@/app/session";
import { Button, ConfirmDialog, Input, Segmented, Select, Sheet, useToast } from "@/components/ui";
import { todayIn, zonedDate, zonedTime, zonedToIso } from "@/lib/time";
import type { Transaction, TxKind } from "@/types/api";

import { useAccounts, useCategories, useFinanceMutation } from "./api";

const schema = z
  .object({
    kind: z.enum(["expense", "income", "refund", "transfer"]),
    amount: z
      .string()
      .trim()
      .transform((v) => v.replace(",", ".").replace(/\s/g, ""))
      .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Введите сумму больше нуля, не более 2 знаков после запятой"),
    account_id: z.string().min(1, "Выберите счёт"),
    to_account_id: z.string().optional(),
    category_id: z.string().optional(),
    date: z.string().min(10),
    time: z.string().min(4),
    description: z.string().max(500).optional(),
    merchant: z.string().max(200).optional(),
  })
  .refine((v) => v.kind !== "transfer" || (v.to_account_id && v.to_account_id !== v.account_id), {
    message: "Выберите другой счёт получателя",
    path: ["to_account_id"],
  });

type FormValues = z.input<typeof schema>;

const KIND_OPTIONS: { value: TxKind; label: string }[] = [
  { value: "expense", label: "Расход" },
  { value: "income", label: "Доход" },
  { value: "transfer", label: "Перевод" },
  { value: "refund", label: "Возврат" },
];

export function TransactionSheet({ open, onOpenChange, transaction }: { open: boolean; onOpenChange: (v: boolean) => void; transaction?: Transaction | null }) {
  const { f, tz, currency, userId } = useFamily();
  const accounts = useAccounts();
  const categories = useCategories();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const idemKey = useRef(newIdempotencyKey());
  const editing = Boolean(transaction);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const kind = form.watch("kind");
  const accountId = form.watch("account_id");

  useEffect(() => {
    if (!open) return;
    idemKey.current = newIdempotencyKey();
    const first = accounts.data?.[0]?.id ?? "";
    form.reset(
      transaction
        ? {
            kind: transaction.kind,
            amount: transaction.amount,
            account_id: transaction.account_id,
            to_account_id: transaction.to_account_id ?? "",
            category_id: transaction.category_id ?? "",
            date: zonedDate(transaction.occurred_at, tz),
            time: zonedTime(transaction.occurred_at, tz),
            description: transaction.description ?? "",
            merchant: transaction.merchant ?? "",
          }
        : { kind: "expense", amount: "", account_id: first, to_account_id: "", category_id: "", date: todayIn(tz), time: zonedTime(new Date(), tz), description: "", merchant: "" },
    );
  }, [open, transaction, accounts.data, form, tz]);

  const selectedAccount = accounts.data?.find((a) => a.id === accountId);
  const catKind = kind === "income" ? "income" : "expense";
  const catOptions = useMemo(() => {
    const list = (categories.data ?? []).filter((c) => c.kind === catKind);
    const parents = list.filter((c) => !c.parent_id);
    return parents.flatMap((p) => [p, ...list.filter((c) => c.parent_id === p.id)]);
  }, [categories.data, catKind]);
  const targets = (accounts.data ?? []).filter((a) => a.id !== accountId && a.visibility === selectedAccount?.visibility);

  const save = useFinanceMutation(async (v: z.output<typeof schema>) => {
    const body = {
      amount: v.amount,
      account_id: v.account_id,
      to_account_id: v.kind === "transfer" ? v.to_account_id : undefined,
      category_id: v.kind !== "transfer" && v.category_id ? v.category_id : undefined,
      occurred_at: zonedToIso(v.date, v.time, tz),
      description: v.description || undefined,
      merchant: v.merchant || undefined,
    };
    if (transaction) {
      return api<Transaction>(f(`/finance/transactions/${transaction.id}`), {
        method: "PATCH",
        body: { ...body, clear_category: v.kind !== "transfer" && !v.category_id },
      });
    }
    return api<Transaction>(f("/finance/transactions"), { body: { ...body, kind: v.kind }, idempotencyKey: idemKey.current });
  });

  const remove = useFinanceMutation(() => api(f(`/finance/transactions/${transaction!.id}`), { method: "DELETE" }));

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(schema.parse(values));
      toast.show(editing ? "Операция сохранена" : "Операция добавлена");
      onOpenChange(false);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  });

  const canEdit = !transaction || transaction.created_by === userId || transaction.visibility === "family";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={editing ? "Операция" : "Новая операция"}
        footer={
          <div className="flex gap-2">
            {editing && (
              <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
                Удалить
              </Button>
            )}
            <Button block size="lg" onClick={onSubmit} loading={save.isPending} disabled={!canEdit}>
              {editing ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {!editing && <Segmented value={kind ?? "expense"} onChange={(v) => form.setValue("kind", v)} options={KIND_OPTIONS} />}
          <Input
            label={`Сумма, ${selectedAccount?.currency ?? currency}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            className="tabular h-14 text-2xl font-semibold"
            error={form.formState.errors.amount?.message}
            {...form.register("amount")}
          />
          <Select label={kind === "transfer" ? "Со счёта" : "Счёт"} error={form.formState.errors.account_id?.message} {...form.register("account_id")}>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.visibility === "private" ? " (личный)" : ""}
              </option>
            ))}
          </Select>
          {selectedAccount?.visibility === "private" && <p className="-mt-2 px-1 text-xs text-muted">Операции по личному счёту видны только вам.</p>}
          {kind === "transfer" ? (
            <Select label="На счёт" error={form.formState.errors.to_account_id?.message} {...form.register("to_account_id")}>
              <option value="">Выберите счёт</option>
              {targets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select label="Категория" {...form.register("category_id")}>
              <option value="">Без категории</option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? `   — ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          )}
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Input label="Дата" type="date" {...form.register("date")} />
            <Input label="Время" type="time" {...form.register("time")} />
          </div>
          <Input label="Описание" placeholder="Например, продукты на неделю" {...form.register("description")} />
          {kind !== "transfer" && <Input label="Магазин или получатель" {...form.register("merchant")} />}
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="Удалить операцию?"
        description="Операция будет удалена, балансы и сводки пересчитаются."
        confirmLabel="Удалить"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(undefined);
            toast.show("Операция удалена");
            setConfirmDelete(false);
            onOpenChange(false);
          } catch (e) {
            toast.show(errorMessage(e), "error");
          }
        }}
      />
    </>
  );
}
