import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ListChecks,
  PiggyBank,
  Plus,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import { useAiEnabled, useFamily } from "@/app/session";
import { PrivateMark } from "@/components/Visibility";
import { Badge, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui";
import { TransactionSheet } from "@/features/finance/TransactionSheet";
import { formatDate, formatMoney, formatTime, plural, relativeDay, timeAgo } from "@/lib/format";
import { todayIn, zonedDate } from "@/lib/time";
import type { Dashboard } from "@/types/api";

import { activityLabel } from "./activity";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export function DashboardPage() {
  const { f, tz, familyId } = useFamily();
  const aiEnabled = useAiEnabled();
  const [txOpen, setTxOpen] = useState(false);
  const q = useQuery({ queryKey: ["dashboard", familyId], queryFn: () => api<Dashboard>(f("/dashboard")), refetchInterval: 60_000 });

  if (q.isPending) {
    return (
      <div className="space-y-4 pt-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const today = todayIn(tz);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between pt-5">
        <div>
          <p className="text-sm text-muted">{d.family_name}</p>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {greeting()}, {d.user_name}
          </h1>
        </div>
        <Link to="/inbox" aria-label="Уведомления" className="relative mt-1 inline-flex size-11 items-center justify-center rounded-full bg-surface text-muted shadow-card">
          <Bell className="size-5" />
          {d.unread_notifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">{d.unread_notifications}</span>
          )}
        </Link>
      </header>

      <Card className="overflow-hidden bg-gradient-to-br from-accent to-accent-strong text-accent-fg">
        <div className="flex items-center justify-between">
          <p className="text-sm opacity-85">Общий баланс месяца</p>
          <Link to="/finance" className="text-sm font-medium opacity-90">
            Подробнее
          </Link>
        </div>
        <p className="tabular mt-1 text-[32px] font-bold leading-tight">{formatMoney(d.month_family.net, d.currency, { sign: true })}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-white/12 p-2.5">
            <p className="flex items-center gap-1 opacity-85">
              <ArrowDownLeft className="size-4" /> Доходы
            </p>
            <p className="tabular font-semibold">{formatMoney(d.month_family.income, d.currency)}</p>
          </div>
          <div className="rounded-2xl bg-white/12 p-2.5">
            <p className="flex items-center gap-1 opacity-85">
              <ArrowUpRight className="size-4" /> Расходы
            </p>
            <p className="tabular font-semibold">{formatMoney(d.month_family.expense, d.currency)}</p>
          </div>
        </div>
        {d.budget && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs opacity-90">
              <span>Бюджет: {Math.round(d.budget.percent)}%</span>
              <span>Осталось {formatMoney(d.budget.remaining, d.currency, { compact: true })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className={`h-full rounded-full ${d.budget.level === "ok" ? "bg-white" : "bg-warning"}`} style={{ width: `${Math.min(d.budget.percent, 100)}%` }} />
            </div>
          </div>
        )}
        {Number(d.month_personal.expense) > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs opacity-85">
            <PrivateMark /> Мои личные расходы: {formatMoney(d.month_personal.expense, d.currency)}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Расход", icon: CircleDollarSign, onClick: () => setTxOpen(true) },
          { label: "Покупки", icon: ShoppingCart, to: d.shopping.list_id ? `/home/shopping/${d.shopping.list_id}` : "/home/shopping" },
          { label: "Задача", icon: ListChecks, to: "/home/tasks?new=1" },
          { label: "Событие", icon: CalendarDays, to: "/calendar?new=1" },
        ].map((a) => {
          const inner = (
            <>
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <a.icon className="size-5" />
              </span>
              <span className="text-xs font-medium">{a.label}</span>
            </>
          );
          const cls = "flex flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 shadow-card active:scale-[0.97] transition";
          return a.to ? (
            <Link key={a.label} to={a.to} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>

      {aiEnabled && (
        <Link to="/assistant" className="flex items-center gap-3 rounded-card border border-accent/20 bg-accent-soft p-4 text-accent-strong">
          <Sparkles className="size-5 shrink-0" />
          <span className="text-[15px]">
            <b>Спросите ассистента:</b> «Сколько мы потратили на продукты?»
          </span>
        </Link>
      )}

      {d.is_empty && (
        <Card>
          <EmptyState
            icon={<Plus className="size-6" />}
            title="Начните с первых данных"
            text="Добавьте расход, событие или список покупок — сводка на главной появится автоматически."
          />
        </Card>
      )}

      {d.payments.length > 0 && (
        <Card>
          <CardHeader title="Платежи" to="/finance/recurring" icon={<CircleDollarSign className="size-4 text-accent" />} />
          <ul className="divide-y divide-border">
            {d.payments.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{p.rule_name}</p>
                  <p className="text-xs text-muted">{relativeDay(p.due_date, today) ?? formatDate(p.due_date, tz)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.overdue && <Badge tone="danger">просрочен</Badge>}
                  <span className="tabular font-medium">{formatMoney(p.amount, p.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Ближайшие события" to="/calendar" icon={<CalendarDays className="size-4 text-accent" />} />
        {d.events.length === 0 ? (
          <p className="py-2 text-sm text-muted">На неделю ничего не запланировано.</p>
        ) : (
          <ul className="space-y-2">
            {d.events.map((e) => {
              const day = zonedDate(e.start, tz);
              return (
                <li key={`${e.event_id}-${e.start}`}>
                  <Link to={`/calendar/${e.event_id}`} className="flex items-center gap-3 rounded-2xl p-1.5 transition hover:bg-surface-2">
                    <div className="w-14 shrink-0 rounded-xl bg-surface-2 py-1.5 text-center">
                      <p className="text-[11px] uppercase text-muted">{relativeDay(day, today) ?? formatDate(e.start, tz, { weekday: "short" })}</p>
                      <p className="tabular text-sm font-semibold">{e.all_day ? "весь день" : formatTime(e.start, tz)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                        {e.title} {e.visibility === "private" && <PrivateMark />}
                      </p>
                      <p className="truncate text-xs text-muted">{e.location ?? formatDate(e.start, tz)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link to={d.shopping.list_id ? `/home/shopping/${d.shopping.list_id}` : "/home/shopping"}>
          <Card className="h-full">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <ShoppingCart className="size-4 text-accent" /> Покупки
            </p>
            <p className="tabular mt-2 text-2xl font-bold">{d.shopping.needed_total}</p>
            <p className="text-xs text-muted">{plural(d.shopping.needed_total, "товар", "товара", "товаров")} нужно купить</p>
            {d.shopping.items.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-muted">{d.shopping.items.join(", ")}</p>}
          </Card>
        </Link>
        <Link to="/home/tasks">
          <Card className="h-full">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <ListChecks className="size-4 text-accent" /> Задачи
            </p>
            <p className="tabular mt-2 text-2xl font-bold">{d.task_stats.open_total}</p>
            <p className="text-xs text-muted">
              открыто{d.task_stats.overdue_total > 0 && <span className="text-danger"> · {d.task_stats.overdue_total} просрочено</span>}
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="size-3.5" /> Вместе за неделю: {d.task_stats.done_this_week}
            </p>
          </Card>
        </Link>
      </div>

      {d.my_tasks.length > 0 && (
        <Card>
          <CardHeader title="Мои и общие задачи" to="/home/tasks" />
          <ul className="divide-y divide-border">
            {d.my_tasks.map((t) => (
              <li key={t.id}>
                <Link to={`/home/tasks/${t.id}`} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="truncate text-[15px]">{t.title}</span>
                  {t.due_at && <span className={`shrink-0 text-xs ${t.overdue ? "text-danger" : "text-muted"}`}>{formatDate(t.due_at, tz, { day: "numeric", month: "short" })}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.goals.length > 0 && (
        <Card>
          <CardHeader title="Цели и накопления" to="/finance/goals" icon={<PiggyBank className="size-4 text-accent" />} />
          <div className="space-y-3">
            {d.goals.map((g) => (
              <div key={g.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="truncate">
                    {g.emoji} {g.name}
                  </span>
                  <span className="tabular text-muted">{Math.round(g.percent)}%</span>
                </div>
                <ProgressBar value={g.percent} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {d.activity.length > 0 && (
        <Card>
          <CardHeader title="Последние изменения" />
          <ul className="space-y-2.5">
            {d.activity.slice(0, 6).map((a, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{a.is_me ? "Вы" : (a.actor_name ?? "Система")}</span> <span className="text-muted">{activityLabel(a.action)}</span>
                {a.summary && <span className="text-text">: {a.summary}</span>}
                <span className="block text-xs text-subtle">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <TransactionSheet open={txOpen} onOpenChange={setTxOpen} />
    </div>
  );
}
