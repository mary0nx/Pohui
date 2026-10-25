import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ListChecks,
  Plus,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { api } from "@/api/client";
import { useAiEnabled, useFamily } from "@/app/session";
import { Art, type ArtName } from "@/components/illustrations/Art";
import { PrivateMark } from "@/components/Visibility";
import { Avatar, Badge, Button, Card, CardHeader, Collapse, EmptyState, ErrorState, IconBadge, ProgressBar, ProgressRing, Skeleton } from "@/components/ui";
import { TransactionSheet } from "@/features/finance/TransactionSheet";
import { useTasks } from "@/features/tasks/api";
import { TaskRow } from "@/features/tasks/TaskRow";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatTime, plural, relativeDay, timeAgo } from "@/lib/format";
import { todayIn, zonedDate, zonedTime } from "@/lib/time";
import type { Dashboard } from "@/types/api";

import { activityLabel } from "./activity";

type Tone = "peach" | "mint" | "lemon" | "lavender";

interface QuickAction {
  label: string;
  icon: typeof Plus;
  tone: Tone;
  to?: string;
  onClick?: () => void;
}

const QUICK_TONE: Record<Tone, string> = {
  peach: "bg-peach text-peach-ink",
  mint: "bg-mint text-mint-ink",
  lemon: "bg-lemon text-lemon-ink",
  lavender: "bg-lavender text-lavender-ink",
};

/** Greeting by the time of day in the family's time zone. */
function greeting(tz: string): string {
  const h = Number(zonedTime(new Date(), tz).slice(0, 2));
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function SectionTitle({ title, to, linkLabel = "Все" }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2 pt-1">
      <h2 className="text-[17px] font-extrabold">{title}</h2>
      {to && (
        <Link to={to} className="press inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-sm font-bold text-coral-ink hover:bg-peach-soft">
          {linkLabel} <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** One-line empty state inside a dashboard card: small picture, a sentence, an add button. */
function InlineEmpty({ art, text, action }: { art: ArtName; text: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Art name={art} className="h-12 w-[58px]" />
      <p className="min-w-0 flex-1 text-sm text-muted">{text}</p>
      {action}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 pt-5" role="status" aria-label="Загрузка">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-40 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
      </div>
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-20 w-24 rounded-3xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-card" />
    </div>
  );
}

function TodayTasks({ openTotal }: { openTotal: number }) {
  const q = useTasks({ status: "open", due: "today", limit: 5 });
  if (q.isPending) return <Skeleton className="h-24 w-full rounded-card" />;
  if (q.isError)
    return (
      <Card>
        <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
      </Card>
    );
  const tasks = q.data;
  if (tasks.length === 0)
    return (
      <Card>
        <InlineEmpty
          art="checklist"
          text={openTotal > 0 ? `На сегодня сроков нет. Ещё открыто: ${openTotal}.` : "На сегодня задач нет — можно выдохнуть."}
          action={
            <Link to="/home/tasks?new=1" aria-label="Добавить задачу" className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-lemon text-lemon-ink">
              <Plus className="size-5" />
            </Link>
          }
        />
      </Card>
    );
  return (
    <Card className="px-1 py-2">
      <ul className="divide-y divide-border/70">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskRow task={t} isLast={tasks.length === 1} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DashboardPage() {
  const { f, tz, familyId, members } = useFamily();
  const aiEnabled = useAiEnabled();
  const [txOpen, setTxOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const q = useQuery({ queryKey: ["dashboard", familyId], queryFn: () => api<Dashboard>(f("/dashboard")), refetchInterval: 60_000 });

  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const today = todayIn(tz);
  const monthName = formatDate(today, tz, { month: "long" });
  const shoppingLink = d.shopping.list_id ? `/home/shopping/${d.shopping.list_id}` : "/home/shopping";
  const budgetTone = d.budget?.level === "exceeded" ? "danger" : d.budget?.level === "warning" ? "warning" : "success";
  const budgetText = d.budget?.level === "exceeded" ? "Лимит превышен" : d.budget?.level === "warning" ? "Близко к лимиту" : "Всё по плану";

  const actions: QuickAction[] = [
    { label: "Расход", icon: CircleDollarSign, tone: "peach", onClick: () => setTxOpen(true) },
    { label: "Покупки", icon: ShoppingCart, tone: "mint", to: shoppingLink },
    { label: "Задача", icon: ListChecks, tone: "lemon", to: "/home/tasks?new=1" },
    { label: "Событие", icon: CalendarDays, tone: "lavender", to: "/calendar?new=1" },
  ];

  return (
    <div className="stagger space-y-5">
      {/* Greeting */}
      <header className="pt-5">
        <div className="flex items-center justify-between gap-3">
          <Link to="/profile" className="press -ml-1 flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3" aria-label={`Семья «${d.family_name}»: участники и настройки`}>
            <span className="flex -space-x-2.5">
              {(members.length > 0 ? members.slice(0, 3) : [{ user_id: "me", first_name: d.user_name, photo_url: null }]).map((m) => (
                <Avatar key={m.user_id} name={m.first_name} src={m.photo_url} size={34} />
              ))}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-coral-ink">Family OS</span>
              <span className="block truncate text-sm font-bold text-heading">{d.family_name}</span>
            </span>
          </Link>
          <Link
            to="/inbox"
            aria-label={d.unread_notifications > 0 ? `Уведомления: ${d.unread_notifications} новых` : "Уведомления"}
            className="press relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-muted shadow-card"
          >
            <Bell className="size-5" />
            {d.unread_notifications > 0 && (
              <span className="animate-pop absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-on-bright">{d.unread_notifications}</span>
            )}
          </Link>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0 pb-1">
            <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-tight">
              {greeting(tz)},<br />
              {d.user_name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-muted first-letter:uppercase">{formatDate(today, tz, { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <Art name="house" className="animate-art-in -mr-1 h-[96px] w-[116px]" />
        </div>
      </header>

      {/* Main block: the month budget */}
      <Card className="p-5" style={{ background: "linear-gradient(140deg, var(--surface) 45%, var(--peach-soft) 100%)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-muted">Бюджет · {monthName}</p>
            {d.budget ? (
              <>
                <p className="tabular mt-1 text-[30px] font-extrabold leading-tight text-heading">{formatMoney(d.budget.remaining, d.currency)}</p>
                <p className="text-sm text-muted">
                  осталось из {formatMoney(d.budget.limit, d.currency, { compact: true })}
                </p>
                <Badge tone={budgetTone} className="mt-2">
                  {budgetText}
                </Badge>
              </>
            ) : (
              <>
                <p className="tabular mt-1 text-[30px] font-extrabold leading-tight text-heading">{formatMoney(d.month_family.expense, d.currency)}</p>
                <p className="text-sm text-muted">потрачено в этом месяце</p>
                <Link to="/finance/budgets" className="press mt-2 inline-flex items-center gap-1 rounded-full bg-peach px-3 py-1 text-sm font-bold text-peach-ink">
                  <Plus className="size-4" aria-hidden /> Задать бюджет
                </Link>
              </>
            )}
          </div>
          {d.budget && (
            <ProgressRing value={d.budget.percent} level={d.budget.level} size={80} stroke={9} label={`Бюджет использован на ${Math.round(d.budget.percent)}%`}>
              <span className="text-center leading-tight">
                <span className="tabular block text-lg font-extrabold text-heading">{Math.round(d.budget.percent)}%</span>
                <span className="block text-[10px] font-bold text-muted">потрачено</span>
              </span>
            </ProgressRing>
          )}
        </div>
        <Link to="/finance" className="press mt-4 flex items-center justify-between gap-2 rounded-2xl bg-surface-2/70 px-3 py-2.5 text-sm">
          <span className="font-semibold text-muted">Общий баланс месяца</span>
          <span className="tabular flex items-center gap-1 font-extrabold text-heading">
            {formatMoney(d.month_family.net, d.currency, { sign: true })}
            <ChevronRight className="size-4 text-subtle" aria-hidden />
          </span>
        </Link>
        {Number(d.month_personal.expense) > 0 && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
            <PrivateMark /> Мои личные расходы: {formatMoney(d.month_personal.expense, d.currency)}
          </p>
        )}
      </Card>

      {/* Income / expense */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/finance/transactions" className="press rounded-card">
          <Card tone="mint" className="h-full p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-mint-ink">
              <ArrowDownLeft className="size-4" aria-hidden /> Доходы
            </p>
            <p className="tabular mt-1 truncate text-lg font-extrabold text-heading">{formatMoney(d.month_family.income, d.currency)}</p>
          </Card>
        </Link>
        <Link to="/finance/transactions" className="press rounded-card">
          <Card tone="coral" className="h-full p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-peach-ink">
              <ArrowUpRight className="size-4" aria-hidden /> Расходы
            </p>
            <p className="tabular mt-1 truncate text-lg font-extrabold text-heading">{formatMoney(d.month_family.expense, d.currency)}</p>
          </Card>
        </Link>
      </div>

      {/* Quick actions */}
      <nav aria-label="Быстрые действия" className="grid grid-cols-4 gap-2">
        {actions.map((a) => {
          const inner = (
            <>
              <span className={cn("flex size-14 items-center justify-center rounded-[20px] shadow-card", QUICK_TONE[a.tone])}>
                <a.icon className="size-6" aria-hidden />
              </span>
              <span className="text-xs font-bold text-heading">{a.label}</span>
            </>
          );
          const cls = "press flex flex-col items-center gap-1.5 rounded-3xl py-1";
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
      </nav>

      {aiEnabled && (
        <Link to="/assistant" className="press flex items-center gap-3 rounded-card bg-lavender p-4 text-lavender-ink">
          <Sparkles className="size-5 shrink-0" />
          <span className="text-[15px]">
            <b>Спросите ассистента:</b> «Сколько мы потратили на продукты?»
          </span>
        </Link>
      )}

      {d.is_empty && (
        <Card>
          <EmptyState
            art="plant"
            title="Начните с первых данных"
            text="Добавьте расход, событие или список покупок — сводка на главной появится автоматически."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setTxOpen(true)}>
                Добавить операцию
              </Button>
            }
          />
        </Card>
      )}

      {/* Upcoming family events */}
      <section>
        <SectionTitle title="Ближайшие события" to="/calendar" />
        <Card className={d.events.length ? "px-2 py-2" : undefined}>
          {d.events.length === 0 ? (
            <InlineEmpty
              art="calendar"
              text="На неделе пока свободно."
              action={
                <Link to="/calendar?new=1" aria-label="Добавить событие" className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-lavender text-lavender-ink">
                  <Plus className="size-5" />
                </Link>
              }
            />
          ) : (
            <ul className="space-y-1">
              {d.events.map((e) => {
                const day = zonedDate(e.start, tz);
                return (
                  <li key={`${e.event_id}-${e.start}`}>
                    <Link to={`/calendar/${e.event_id}`} className="press flex items-center gap-3 rounded-2xl p-1.5 hover:bg-surface-2">
                      <div className="w-[68px] shrink-0 rounded-2xl bg-lavender py-1.5 text-center text-lavender-ink">
                        <p className="text-[11px] font-extrabold uppercase">{relativeDay(day, today) ?? formatDate(e.start, tz, { weekday: "short", day: "numeric" })}</p>
                        <p className="tabular text-sm font-bold">{e.all_day ? "весь день" : formatTime(e.start, tz)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[15px] font-bold text-heading">
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
      </section>

      {/* Today's tasks: real checkboxes with the spring check */}
      <section>
        <SectionTitle title="Задачи на сегодня" to="/home/tasks" />
        <TodayTasks openTotal={d.task_stats.open_total} />
      </section>

      {/* Shopping list */}
      <section>
        <SectionTitle title={d.shopping.list_name ?? "Список покупок"} to={shoppingLink} />
        <Card tone="mint">
          {d.shopping.needed_total === 0 ? (
            <InlineEmpty
              art="basket"
              text="Всё куплено. Добавьте, что закончилось."
              action={
                <Link to={shoppingLink} aria-label="Добавить покупку" className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-mint-ink shadow-card">
                  <Plus className="size-5" />
                </Link>
              }
            />
          ) : (
            <Link to={shoppingLink} className="block">
              <p className="flex items-baseline gap-1.5 text-sm font-bold text-mint-ink">
                <span className="tabular text-2xl font-extrabold text-heading">{d.shopping.needed_total}</span>
                {plural(d.shopping.needed_total, "товар", "товара", "товаров")} нужно купить
              </p>
              {d.shopping.items.length > 0 && (
                <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Что купить">
                  {d.shopping.items.map((item, i) => (
                    <li key={`${item}-${i}`} className="max-w-full truncate rounded-full bg-surface/85 px-3 py-1 text-sm font-semibold text-heading">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          )}
        </Card>
      </section>

      {d.payments.length > 0 && (
        <Card>
          <CardHeader title="Платежи" to="/finance/recurring" icon={<IconBadge tone="peach" className="size-9 rounded-xl"><CircleDollarSign className="size-[18px]" /></IconBadge>} />
          <ul className="divide-y divide-border">
            {d.payments.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{p.rule_name}</p>
                  <p className="text-xs text-muted">{relativeDay(p.due_date, today) ?? formatDate(p.due_date, tz)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.overdue && <Badge tone="danger">просрочен</Badge>}
                  <span className="tabular font-bold">{formatMoney(p.amount, p.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Family summary */}
      <section>
        <SectionTitle title="Семейная сводка" />
        <Card className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Link to="/home/tasks" className="press rounded-2xl bg-mint px-1 py-2.5">
              <p className="tabular text-xl font-extrabold text-heading">{d.task_stats.done_this_week}</p>
              <p className="text-[11px] font-bold leading-tight text-mint-ink">сделано за неделю</p>
            </Link>
            <Link to="/home/tasks" className="press rounded-2xl bg-lemon-soft px-1 py-2.5">
              <p className="tabular text-xl font-extrabold text-heading">{d.task_stats.open_total}</p>
              <p className="text-[11px] font-bold leading-tight text-lemon-ink">
                {d.task_stats.overdue_total > 0 ? `открыто · ${d.task_stats.overdue_total} просрочено` : "задач открыто"}
              </p>
            </Link>
            <Link to="/home/life" className="press rounded-2xl bg-lavender px-1 py-2.5">
              <p className="tabular text-xl font-extrabold text-heading">{d.life_goals_open}</p>
              <p className="text-[11px] font-bold leading-tight text-lavender-ink">общих целей</p>
            </Link>
          </div>

          {d.goals.length > 0 && (
            <Link to="/finance/goals" className="block space-y-3">
              {d.goals.map((g) => (
                <div key={g.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">
                      {g.emoji} {g.name}
                    </span>
                    <span className="tabular font-bold text-muted">{Math.round(g.percent)}%</span>
                  </div>
                  <ProgressBar value={g.percent} level={g.percent >= 100 ? "done" : "ok"} label={`${g.name}: ${Math.round(g.percent)}%`} />
                </div>
              ))}
            </Link>
          )}

          {d.activity.length > 0 && (
            <div>
              <button
                type="button"
                className="press flex w-full items-center justify-between rounded-2xl bg-surface-2 px-3 py-2.5 text-sm font-bold text-heading"
                aria-expanded={activityOpen}
                aria-controls="dashboard-activity"
                onClick={() => setActivityOpen((v) => !v)}
              >
                Последние изменения
                <ChevronDown className={cn("size-4 text-muted transition-transform duration-300 ease-[var(--ease-out)]", activityOpen && "rotate-180")} aria-hidden />
              </button>
              <Collapse open={activityOpen} id="dashboard-activity">
                <ul className="space-y-2.5 px-1 pt-3">
                  {d.activity.slice(0, 6).map((a, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-bold">{a.is_me ? "Вы" : (a.actor_name ?? "Система")}</span> <span className="text-muted">{activityLabel(a.action)}</span>
                      {a.summary && <span>: {a.summary}</span>}
                      <span className="block text-xs text-subtle">{timeAgo(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </Collapse>
            </div>
          )}
        </Card>
      </section>

      <TransactionSheet open={txOpen} onOpenChange={setTxOpen} />
    </div>
  );
}
