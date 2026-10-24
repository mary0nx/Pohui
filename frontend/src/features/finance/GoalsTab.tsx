import { PiggyBank, Plus } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, ProgressBar, Sheet, useToast } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { SavingsGoal, Visibility } from "@/types/api";

import { useFinanceMutation, useGoals } from "./api";

export function GoalsTab() {
  const { f, tz, currency } = useFamily();
  const goals = useGoals();
  const toast = useToast();
  const [create, setCreate] = useState<{ name: string; target: string; date: string; emoji: string; visibility: Visibility } | null>(null);
  const [contrib, setContrib] = useState<{ goal: SavingsGoal; amount: string; withdraw: boolean } | null>(null);

  const createMut = useFinanceMutation((v: NonNullable<typeof create>) =>
    api(f("/finance/goals"), { body: { name: v.name, target_amount: v.target.replace(",", "."), target_date: v.date || null, emoji: v.emoji || null, visibility: v.visibility } }),
  );
  const contribMut = useFinanceMutation((v: NonNullable<typeof contrib>) =>
    api<SavingsGoal>(f(`/finance/goals/${v.goal.id}/contributions`), { body: { amount: `${v.withdraw ? "-" : ""}${v.amount.replace(",", ".")}` } }),
  );

  return (
    <div className="space-y-3">
      {goals.isPending ? (
        <LoadingBlock />
      ) : goals.isError ? (
        <ErrorState error={goals.error} onRetry={() => goals.refetch()} />
      ) : goals.data.length === 0 ? (
        <Card>
          <EmptyState icon={<PiggyBank className="size-6" />} title="Пока нет целей" text="Отпуск, ремонт, подушка безопасности — копите вместе и следите за прогнозом." />
        </Card>
      ) : (
        goals.data.map((g) => (
          <Card key={g.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-semibold">
                  <span className="text-lg">{g.emoji ?? "🎯"}</span> {g.name} {g.visibility === "private" && <PrivateMark />}
                </p>
                <p className="tabular text-sm text-muted">
                  {formatMoney(g.saved, g.currency)} из {formatMoney(g.target_amount, g.currency)}
                </p>
              </div>
              {g.status === "achieved" ? <Badge tone="success">Достигнута</Badge> : <Badge tone="accent">{Math.round(g.percent)}%</Badge>}
            </div>
            <ProgressBar value={g.percent} />
            <p className="text-xs text-muted">
              {g.forecast_date && g.status === "active" ? `Прогноз: ${formatDate(g.forecast_date, tz, { month: "long", year: "numeric" })}` : g.status === "active" ? "Сделайте первое пополнение, чтобы увидеть прогноз" : ""}
              {g.target_date && ` · срок ${formatDate(g.target_date, tz)}`}
              {g.on_track === false && <span className="text-warning"> · отстаём от плана</span>}
            </p>
            {g.status === "active" && (
              <div className="flex gap-2">
                <Button size="sm" variant="soft" onClick={() => setContrib({ goal: g, amount: "", withdraw: false })}>
                  Пополнить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setContrib({ goal: g, amount: "", withdraw: true })}>
                  Снять
                </Button>
              </div>
            )}
          </Card>
        ))
      )}
      <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setCreate({ name: "", target: "", date: "", emoji: "", visibility: "family" })}>
        Новая цель
      </Button>

      <Sheet
        open={create !== null}
        onOpenChange={(v) => !v && setCreate(null)}
        title="Новая цель накоплений"
        footer={
          <Button
            block
            loading={createMut.isPending}
            disabled={!create?.name || !/^\d+([.,]\d{1,2})?$/.test(create?.target ?? "")}
            onClick={async () => {
              try {
                await createMut.mutateAsync(create!);
                toast.show("Цель создана");
                setCreate(null);
              } catch (e) {
                toast.show(errorMessage(e), "error");
              }
            }}
          >
            Создать
          </Button>
        }
      >
        {create && (
          <div className="space-y-4">
            <div className="grid grid-cols-[72px_1fr] gap-3">
              <Input label="Эмодзи" maxLength={4} value={create.emoji} onChange={(e) => setCreate({ ...create, emoji: e.target.value })} placeholder="🏖" />
              <Input label="Название" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} placeholder="Отпуск" />
            </div>
            <Input label={`Сумма, ${currency}`} inputMode="decimal" value={create.target} onChange={(e) => setCreate({ ...create, target: e.target.value })} />
            <Input label="Плановая дата" type="date" value={create.date} onChange={(e) => setCreate({ ...create, date: e.target.value })} />
            <VisibilityPicker value={create.visibility} onChange={(v) => setCreate({ ...create, visibility: v })} />
          </div>
        )}
      </Sheet>

      <Sheet
        open={contrib !== null}
        onOpenChange={(v) => !v && setContrib(null)}
        title={contrib?.withdraw ? "Снять с накоплений" : "Пополнить накопления"}
        description={contrib?.goal.name}
        footer={
          <Button
            block
            loading={contribMut.isPending}
            disabled={!/^\d+([.,]\d{1,2})?$/.test(contrib?.amount ?? "") || Number(contrib?.amount.replace(",", ".")) <= 0}
            onClick={async () => {
              try {
                const g = await contribMut.mutateAsync(contrib!);
                toast.show(g.status === "achieved" ? "Цель достигнута! 🎉" : "Готово");
                setContrib(null);
              } catch (e) {
                toast.show(errorMessage(e), "error");
              }
            }}
          >
            Сохранить
          </Button>
        }
      >
        {contrib && <Input label={`Сумма, ${contrib.goal.currency}`} inputMode="decimal" autoFocus value={contrib.amount} onChange={(e) => setContrib({ ...contrib, amount: e.target.value })} />}
      </Sheet>
    </div>
  );
}
