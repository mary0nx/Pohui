import { Archive, Banknote, CreditCard, Landmark, PiggyBank, Plus, Wallet } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Button, Card, ErrorState, Input, LoadingBlock, Select, Sheet, useToast } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { Account, AccountKind, Visibility } from "@/types/api";

import { useAccounts, useFinanceMutation } from "./api";

const KINDS: Record<AccountKind, { label: string; icon: typeof Wallet }> = {
  cash: { label: "Наличные", icon: Banknote },
  card: { label: "Карта", icon: CreditCard },
  bank: { label: "Банковский счёт", icon: Landmark },
  savings: { label: "Сбережения", icon: PiggyBank },
  other: { label: "Другое", icon: Wallet },
};

export function AccountsTab() {
  const { f, currency } = useFamily();
  const accounts = useAccounts();
  const toast = useToast();
  const [form, setForm] = useState<{ id?: string; name: string; kind: AccountKind; initial: string; visibility: Visibility } | null>(null);

  const save = useFinanceMutation((v: NonNullable<typeof form>) =>
    v.id
      ? api<Account>(f(`/finance/accounts/${v.id}`), { method: "PATCH", body: { name: v.name, kind: v.kind, initial_balance: v.initial.replace(",", ".") || "0" } })
      : api<Account>(f("/finance/accounts"), { body: { name: v.name, kind: v.kind, initial_balance: v.initial.replace(",", ".") || "0", visibility: v.visibility } }),
  );
  const archive = useFinanceMutation((id: string) => api(f(`/finance/accounts/${id}`), { method: "PATCH", body: { archived: true } }));

  const total = (accounts.data ?? []).filter((a) => a.visibility === "family").reduce((s, a) => s + Number(a.balance), 0);

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-muted">Всего на общих счетах</p>
        <p className="tabular text-2xl font-bold">{formatMoney(total, currency)}</p>
        <p className="mt-1 text-xs text-muted">Расчётный остаток: начальный баланс плюс операции. Банки не подключаются автоматически.</p>
      </Card>
      {accounts.isPending ? (
        <LoadingBlock />
      ) : accounts.isError ? (
        <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
      ) : (
        <Card className="divide-y divide-border p-0">
          {accounts.data.map((a) => {
            const Icon = KINDS[a.kind].icon;
            return (
              <button key={a.id} type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => setForm({ id: a.id, name: a.name, kind: a.kind, initial: a.initial_balance, visibility: a.visibility })}>
                <span className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                    {a.name} {a.visibility === "private" && <PrivateMark />}
                  </span>
                  <span className="text-xs text-muted">{KINDS[a.kind].label}</span>
                </span>
                <span className={`tabular font-semibold ${Number(a.balance) < 0 ? "text-danger" : ""}`}>{formatMoney(a.balance, a.currency)}</span>
              </button>
            );
          })}
        </Card>
      )}
      <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setForm({ name: "", kind: "card", initial: "0", visibility: "family" })}>
        Добавить счёт
      </Button>
      <Sheet
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={form?.id ? "Счёт" : "Новый счёт"}
        footer={
          <div className="flex gap-2">
            {form?.id && (
              <Button
                variant="secondary"
                icon={<Archive className="size-4" />}
                onClick={async () => {
                  await archive.mutateAsync(form.id!);
                  toast.show("Счёт перемещён в архив");
                  setForm(null);
                }}
              >
                В архив
              </Button>
            )}
            <Button
              block
              loading={save.isPending}
              disabled={!form?.name || !/^-?\d*([.,]\d{1,2})?$/.test(form?.initial ?? "")}
              onClick={async () => {
                try {
                  await save.mutateAsync(form!);
                  toast.show("Сохранено");
                  setForm(null);
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
        {form && (
          <div className="space-y-4">
            <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Тип" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}>
              {Object.entries(KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Input label={`Начальный остаток, ${currency}`} inputMode="decimal" value={form.initial} onChange={(e) => setForm({ ...form, initial: e.target.value })} />
            {!form.id && (
              <>
                <VisibilityPicker value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} />
                <p className="text-xs text-muted">Личный счёт и все его операции видны только вам. Видимость нельзя изменить после создания.</p>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
