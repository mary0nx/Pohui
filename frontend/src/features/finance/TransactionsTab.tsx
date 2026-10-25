import { ArrowLeftRight, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { useFamily } from "@/app/session";
import { PrivateMark } from "@/components/Visibility";
import { Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Select } from "@/components/ui";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { zonedDate } from "@/lib/time";
import type { Transaction } from "@/types/api";

import { useAccounts, useCategories, useTransactions } from "./api";
import { ImportSheet } from "./ImportSheet";
import { TransactionSheet } from "./TransactionSheet";

const KIND_LABEL = { expense: "Расход", income: "Доход", refund: "Возврат", transfer: "Перевод" } as const;

export function TransactionsTab() {
  const { tz, members, memberName } = useFamily();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState("");
  const [member, setMember] = useState("");
  const [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const categories = useCategories();
  const accounts = useAccounts(true);
  const tx = useTransactions({ q: q.trim() || undefined, kind: kind || undefined, category_id: category || undefined, member_id: member || undefined, offset });

  const catName = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const accName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.id, a.name])), [accounts.data]);

  const groups = useMemo(() => {
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of tx.data?.items ?? []) {
      const day = zonedDate(t.occurred_at, tz);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(t);
      else out.push({ day, items: [t] });
    }
    return out;
  }, [tx.data, tz]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input aria-label="Поиск по описанию" placeholder="Поиск по описанию или магазину" className="pl-10" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select aria-label="Тип" value={kind} onChange={(e) => (setKind(e.target.value), setOffset(0))} className="h-10 text-sm">
          <option value="">Все типы</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label="Категория" value={category} onChange={(e) => (setCategory(e.target.value), setOffset(0))} className="h-10 text-sm">
          <option value="">Категория</option>
          {(categories.data ?? []).filter((c) => !c.parent_id).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Участник" value={member} onChange={(e) => (setMember(e.target.value), setOffset(0))} className="h-10 text-sm">
          <option value="">Все</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.first_name}
            </option>
          ))}
        </Select>
      </div>
      <Button variant="ghost" size="sm" icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
        Импорт из CSV
      </Button>

      {tx.isPending ? (
        <LoadingBlock rows={5} />
      ) : tx.isError ? (
        <ErrorState error={tx.error} onRetry={() => tx.refetch()} />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState art="jar" title="Операций не найдено" text="Измените фильтры или добавьте первую операцию." />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.day}>
              <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{formatDate(g.day, tz, { day: "numeric", month: "long", weekday: "short" })}</h3>
              <Card className="divide-y divide-border p-0">
                {g.items.map((t) => {
                  const positive = t.kind === "income" || t.kind === "refund";
                  return (
                    <button key={t.id} type="button" onClick={() => setEdit(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-muted">
                        {t.kind === "transfer" ? <ArrowLeftRight className="size-4" /> : <span className="text-sm font-semibold">{(catName.get(t.category_id ?? "") ?? KIND_LABEL[t.kind])[0]}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[15px]">
                          {t.description || t.merchant || (t.kind === "transfer" ? `${accName.get(t.account_id)} → ${accName.get(t.to_account_id ?? "")}` : (catName.get(t.category_id ?? "") ?? KIND_LABEL[t.kind]))}
                          {t.visibility === "private" && <PrivateMark />}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {catName.get(t.category_id ?? "") ?? KIND_LABEL[t.kind]} · {accName.get(t.account_id)} · {memberName(t.created_by)} · {formatTime(t.occurred_at, tz)}
                        </span>
                      </span>
                      <span className={`tabular shrink-0 font-semibold ${positive ? "text-income" : t.kind === "transfer" ? "text-muted" : ""}`}>
                        {t.kind === "transfer" ? "" : positive ? "+" : "−"}
                        {formatMoney(t.amount, t.currency)}
                      </span>
                    </button>
                  );
                })}
              </Card>
            </section>
          ))}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - 50, 0))}>
              Назад
            </Button>
            <span className="self-center text-xs text-muted">
              {offset + 1}–{Math.min(offset + 50, tx.data.total)} из {tx.data.total}
            </span>
            <Button variant="ghost" size="sm" disabled={offset + 50 >= tx.data.total} onClick={() => setOffset(offset + 50)}>
              Дальше
            </Button>
          </div>
        </div>
      )}
      <TransactionSheet open={edit !== null} onOpenChange={(v) => !v && setEdit(null)} transaction={edit} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
