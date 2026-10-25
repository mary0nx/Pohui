import { CalendarClock, Plus } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Input, LoadingBlock, Select, Sheet, Switch, useToast } from "@/components/ui";
import { formatDate, formatMoney, relativeDay } from "@/lib/format";
import { todayIn } from "@/lib/time";
import type { Frequency, RecurringRule, ScheduledPayment, Visibility } from "@/types/api";

import { useAccounts, useCategories, useFinanceMutation, useRecurring, useScheduled } from "./api";

const FREQ: Record<Frequency, string> = { daily: "ежедневно", weekly: "еженедельно", monthly: "ежемесячно", yearly: "ежегодно" };

interface RuleForm {
  name: string;
  amount: string;
  kind: "expense" | "income";
  account_id: string;
  category_id: string;
  frequency: Frequency;
  start_date: string;
  remind_days_before: number;
  auto_create: boolean;
  visibility: Visibility;
}

export function RecurringTab() {
  const { f, tz, currency } = useFamily();
  const today = todayIn(tz);
  const rules = useRecurring();
  const scheduled = useScheduled("pending");
  const accounts = useAccounts();
  const categories = useCategories();
  const toast = useToast();
  const [form, setForm] = useState<(RuleForm & { id?: string }) | null>(null);
  const [pay, setPay] = useState<ScheduledPayment | null>(null);
  const [del, setDel] = useState<RecurringRule | null>(null);

  const saveRule = useFinanceMutation((v: RuleForm & { id?: string }) => {
    const body = { ...v, amount: v.amount.replace(",", "."), account_id: v.account_id || null, category_id: v.category_id || null };
    return v.id
      ? api(f(`/finance/recurring/${v.id}`), { method: "PATCH", body: { name: body.name, amount: body.amount, account_id: body.account_id ?? undefined, category_id: body.category_id ?? undefined, frequency: body.frequency, start_date: body.start_date, remind_days_before: body.remind_days_before, auto_create: body.auto_create } })
      : api(f("/finance/recurring"), { body });
  });
  const payMut = useFinanceMutation((sp: ScheduledPayment) => api(f(`/finance/scheduled-payments/${sp.id}/pay`), { body: {} }));
  const skipMut = useFinanceMutation((sp: ScheduledPayment) => api(f(`/finance/scheduled-payments/${sp.id}/skip`), { method: "POST" }));
  const delMut = useFinanceMutation((r: RecurringRule) => api(f(`/finance/recurring/${r.id}`), { method: "DELETE" }));

  const upcoming = (scheduled.data ?? []).filter((s) => s.due_date <= addDaysIso(today, 31));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="К оплате" icon={<CalendarClock className="size-4 text-accent" />} />
        {scheduled.isPending ? (
          <LoadingBlock rows={2} />
        ) : scheduled.isError ? (
          <ErrorState compact error={scheduled.error} onRetry={() => scheduled.refetch()} />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted">Ближайших платежей нет.</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{s.rule_name}</p>
                  <p className={`text-xs ${s.overdue ? "text-danger" : "text-muted"}`}>
                    {s.overdue ? "Просрочен · " : ""}
                    {relativeDay(s.due_date, today) ?? formatDate(s.due_date, tz)}
                  </p>
                </div>
                <span className="tabular font-medium">{formatMoney(s.amount, s.currency)}</span>
                <Button size="sm" variant="soft" onClick={() => setPay(s)}>
                  Оплачено
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {rules.isPending ? (
        <LoadingBlock />
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
      ) : rules.data.length === 0 ? (
        <Card>
          <EmptyState art="calendar" title="Нет регулярных платежей" text="Аренда, интернет, подписки — добавьте их, и мы напомним о сроке оплаты." />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rules.data.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
              onClick={() => setForm({ id: r.id, name: r.name, amount: r.amount, kind: r.kind === "income" ? "income" : "expense", account_id: r.account_id ?? "", category_id: r.category_id ?? "", frequency: r.frequency, start_date: r.start_date, remind_days_before: r.remind_days_before, auto_create: r.auto_create, visibility: r.visibility })}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                  {r.name} {r.visibility === "private" && <PrivateMark />}
                </p>
                <p className="text-xs text-muted">
                  {FREQ[r.frequency]}
                  {r.next_due_date ? ` · следующий ${formatDate(r.next_due_date, tz)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular font-semibold">{formatMoney(r.amount, r.currency)}</p>
                {r.auto_create && <Badge tone="accent">авто</Badge>}
              </div>
            </button>
          ))}
        </Card>
      )}
      <Button
        variant="secondary"
        block
        icon={<Plus className="size-4" />}
        onClick={() => setForm({ name: "", amount: "", kind: "expense", account_id: accounts.data?.[0]?.id ?? "", category_id: "", frequency: "monthly", start_date: today, remind_days_before: 1, auto_create: false, visibility: "family" })}
      >
        Регулярный платёж
      </Button>

      <Sheet
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={form?.id ? "Регулярный платёж" : "Новый регулярный платёж"}
        footer={
          <div className="flex gap-2">
            {form?.id && (
              <Button variant="secondary" onClick={() => setDel(rules.data?.find((r) => r.id === form.id) ?? null)}>
                Удалить
              </Button>
            )}
            <Button
              block
              loading={saveRule.isPending}
              disabled={!form?.name || !/^\d+([.,]\d{1,2})?$/.test(form?.amount ?? "") || Number(form?.amount.replace(",", ".")) <= 0}
              onClick={async () => {
                try {
                  await saveRule.mutateAsync(form!);
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
            <Input label="Название" placeholder="Аренда, интернет…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label={`Сумма, ${currency}`} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <Select label="Периодичность" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
                {Object.entries(FREQ).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <Input label="Первый платёж" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Select label="Счёт" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Не выбран</option>
              {(accounts.data ?? []).filter((a) => a.visibility === form.visibility).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select label="Категория" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Без категории</option>
              {(categories.data ?? []).filter((c) => c.kind === form.kind && !c.parent_id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Напомнить" value={form.remind_days_before} onChange={(e) => setForm({ ...form, remind_days_before: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5, 7].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "в день платежа" : `за ${d} дн.`}
                </option>
              ))}
            </Select>
            <Switch checked={form.auto_create} onChange={(v) => setForm({ ...form, auto_create: v })} label="Записывать автоматически" description="Операция создаётся в день платежа без подтверждения" />
            {!form.id && <VisibilityPicker value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v, account_id: "" })} />}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={pay !== null}
        onOpenChange={(v) => !v && setPay(null)}
        title="Отметить платёж оплаченным?"
        description={pay ? `${pay.rule_name}: ${formatMoney(pay.amount, pay.currency)}. Будет создана операция расхода.` : ""}
        confirmLabel="Оплачено"
        loading={payMut.isPending}
        onConfirm={async () => {
          try {
            await payMut.mutateAsync(pay!);
            toast.show("Платёж записан");
            setPay(null);
          } catch (e) {
            toast.show(errorMessage(e), "error");
          }
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          block
          onClick={async () => {
            await skipMut.mutateAsync(pay!);
            toast.show("Платёж пропущен");
            setPay(null);
          }}
        >
          Пропустить этот платёж
        </Button>
      </ConfirmDialog>

      <ConfirmDialog
        open={del !== null}
        onOpenChange={(v) => !v && setDel(null)}
        danger
        title="Удалить регулярный платёж?"
        description="Будущие напоминания удалятся. Уже записанные операции останутся."
        confirmLabel="Удалить"
        loading={delMut.isPending}
        onConfirm={async () => {
          await delMut.mutateAsync(del!);
          setDel(null);
          setForm(null);
        }}
      />
    </div>
  );
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
