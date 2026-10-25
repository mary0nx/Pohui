import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ListChecks,
  Pencil,
  Plus,
  ShoppingCart,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useAiEnabled, useFamily } from "@/app/session";
import { Art, type ArtName } from "@/components/illustrations/Art";
import { PrivateMark } from "@/components/Visibility";
import { Avatar, Badge, Button, Card, CardHeader, CheckCircle, Collapse, ErrorState, IconBadge, ProgressBar, ProgressRing, Skeleton, useToast } from "@/components/ui";
import { ProductThumb } from "@/features/catalog/thumb";
import { BudgetSheet } from "@/features/finance/BudgetSheet";
import { TransactionSheet } from "@/features/finance/TransactionSheet";
import { useTasks } from "@/features/tasks/api";
import { TaskRow } from "@/features/tasks/TaskRow";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, formatQty, formatTime, plural, relativeDay, timeAgo } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
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
/* The cards cascade in on the first visit of the session only; coming back to the home
 * screen or a background refresh shows them at once. */
let introPlayed = false;

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
    <div className="animate-fade-in flex items-center gap-3">
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

/** Spent money as a change of balance: −2,50 PLN (a net refund shows as +). */
function spentText(spent: string, currency: string): string {
  return formatMoney(-Number(spent), currency, { sign: true });
}

/** A tile of the budget grid. The currency goes on its own small line so the number is
 *  never cut off on a narrow phone. */
function Stat({ label, value, currency, tone }: { label: string; value: string; currency: string; tone?: "danger" }) {
  const amount = value.replace(/[\s\u00a0]*[^\d\s\u00a0,.−+]+$/u, "");
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2/70 px-2.5 py-2">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className={cn("tabular text-[15px] font-extrabold leading-tight [overflow-wrap:anywhere]", tone === "danger" ? "text-danger" : "text-heading")}>{amount}</p>
      <p className="text-[11px] font-semibold text-subtle">{currency}</p>
    </div>
  );
}

/** The month budget. Three separate numbers, all computed by the server:
 *  budget (the limit), spent (expenses of the month), remaining = budget − spent. */
function BudgetCard({
  d,
  monthName,
  num,
  canEdit,
  onAddExpense,
  onEditBudget,
}: {
  d: Dashboard;
  monthName: string;
  num?: string;
  canEdit: boolean;
  onAddExpense: () => void;
  onEditBudget: () => void;
}) {
  const b = d.budget;
  const cur = d.currency;
  const hasMoves = Number(d.month_family.income) !== 0 || Number(d.month_family.expense) !== 0;
  const over = b !== null && Number(b.remaining) < 0;
  const setButton = canEdit ? (
    <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={onEditBudget}>
      Задать бюджет
    </Button>
  ) : (
    <p className="text-xs font-semibold text-muted">Бюджет задаёт владелец или администратор семьи.</p>
  );
  return (
    <>
      <Card className="p-5" style={{ background: "linear-gradient(140deg, var(--surface) 45%, var(--peach-soft) 100%)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold text-muted">
              Бюджет · {monthName}
              {b && canEdit && (
                <button type="button" onClick={onEditBudget} aria-label="Изменить бюджет" className="press -m-1 rounded-full p-1 text-subtle hover:text-heading">
                  <Pencil className="size-3.5" />
                </button>
              )}
            </p>
            {b ? (
              <>
                <p className="mt-1 text-xs font-bold text-muted">{over ? "Перерасход" : "Осталось"}</p>
                <p className={cn("tabular text-[30px] font-extrabold leading-tight", over ? "text-danger" : "text-heading", num)}>{formatMoney(b.remaining, cur)}</p>
                <Badge tone={over ? "danger" : b.level === "warning" ? "warning" : "success"} className="mt-1.5">
                  {over ? `Превышение на ${formatMoney(-Number(b.remaining), cur)}` : b.level === "warning" ? "Близко к лимиту" : "Всё по плану"}
                </Badge>
              </>
            ) : hasMoves ? (
              <>
                <p className="mt-1 text-xl font-extrabold leading-snug text-heading">Бюджет не задан</p>
                <p className="mt-0.5 text-sm text-muted">
                  Потрачено в этом месяце: <span className={cn("tabular font-bold text-heading", num)}>{spentText(d.month_family.expense, cur)}</span>
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xl font-extrabold leading-snug text-heading">Операций за месяц пока нет</p>
                <p className="mt-1 text-sm text-muted">Задайте бюджет месяца — расходы будут уменьшать остаток.</p>
              </>
            )}
          </div>
          {b ? (
            <ProgressRing value={b.percent} level={b.level} size={80} stroke={9} label={`Бюджет использован на ${Math.round(b.percent)}%`}>
              <span className={cn("text-center leading-tight", num)}>
                <span className="tabular block text-lg font-extrabold text-heading">{Math.round(b.percent)}%</span>
                <span className="block text-[11px] font-bold text-muted">потрачено</span>
              </span>
            </ProgressRing>
          ) : (
            <Art name="jar" alive className="-mr-2 -mt-1 h-[76px] w-[90px]" />
          )}
        </div>

        {b ? (
          <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Бюджет месяца">
            <Stat label="Бюджет" value={formatMoney(b.limit, cur)} currency={cur} />
            <Stat label="Потрачено" value={spentText(b.spent, cur)} currency={cur} />
            <Stat label="Остаток" value={formatMoney(b.remaining, cur)} currency={cur} tone={over ? "danger" : undefined} />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {setButton}
            {!hasMoves && (
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={onAddExpense}>
                Первая операция
              </Button>
            )}
          </div>
        )}

        {hasMoves && (
          <Link to="/finance" className="press mt-3 flex items-center justify-between gap-2 rounded-2xl bg-surface-2/70 px-3 py-2.5 text-sm">
            <span className="font-semibold text-muted">Общий баланс месяца</span>
            <span className={cn("tabular flex items-center gap-1 font-extrabold", Number(d.month_family.net) < 0 ? "text-danger" : "text-heading", num)}>
              {formatMoney(d.month_family.net, cur, { sign: true })}
              <ChevronRight className="size-4 text-subtle" aria-hidden />
            </span>
          </Link>
        )}
        {Number(d.month_personal.expense) > 0 && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
            <PrivateMark /> Мои личные расходы: {spentText(d.month_personal.expense, cur)}
          </p>
        )}
      </Card>

      {hasMoves && (
        <div className="grid grid-cols-2 gap-3">
          <Link to="/finance/transactions" className="press rounded-card">
            <Card tone="mint" className="h-full p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-bold text-mint-ink">
                <ArrowDownLeft className="size-4" aria-hidden /> Доходы
              </p>
              <p className={cn("tabular mt-1 truncate text-lg font-extrabold text-heading", num)}>{formatMoney(d.month_family.income, cur, { sign: true })}</p>
            </Card>
          </Link>
          <Link to="/finance/transactions" className="press rounded-card">
            <Card tone="coral" className="h-full p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-bold text-peach-ink">
                <ArrowUpRight className="size-4" aria-hidden /> Расходы
              </p>
              <p className={cn("tabular mt-1 truncate text-lg font-extrabold text-heading", num)}>{spentText(d.month_family.expense, cur)}</p>
            </Card>
          </Link>
        </div>
      )}
    </>
  );
}

/** Needed items with thumbnails; ticking one marks it bought on the server for everyone. */
function ShoppingBlock({ shopping, link }: { shopping: Dashboard["shopping"]; link: string }) {
  const { f } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const entries = shopping.entries ?? [];
  const buy = useMutation({
    mutationFn: (id: string) => api(f(`/shopping/lists/${shopping.list_id}/items/${id}`), { method: "PATCH", body: { status: "bought" } }),
    onMutate: (id) => {
      haptic("select");
      setTicked((s) => new Set(s).add(id));
    },
    onSuccess: async () => {
      if (!prefersReducedMotion()) await new Promise((r) => setTimeout(r, 600)); // let the check play
      await Promise.all(["dashboard", "shopping-list", "shopping-lists"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
    onError: (e, id) => {
      setTicked((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      toast.show(errorMessage(e), "error");
    },
  });
  return (
    <section>
      <SectionTitle title={shopping.list_name ?? "Список покупок"} to={link} linkLabel="Весь список" />
      <Card tone="mint" className="space-y-3">
        {shopping.needed_total === 0 ? (
          <InlineEmpty
            art="basket"
            text="Всё куплено. Добавьте, что закончилось."
            action={
              <Link to={link} aria-label="Добавить покупку" className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-mint-ink shadow-card">
                <Plus className="size-5" />
              </Link>
            }
          />
        ) : (
          <>
            <p className="flex items-baseline gap-1.5 text-sm font-bold text-mint-ink">
              <span className="tabular text-2xl font-extrabold text-heading">{shopping.needed_total}</span>
              {plural(shopping.needed_total, "товар", "товара", "товаров")} нужно купить
            </p>
            {entries.length > 0 ? (
              <ul className="space-y-1.5" aria-label="Что купить">
                {entries.map((e) => {
                  const done = ticked.has(e.id);
                  return (
                    <li key={e.id} className="flex items-center gap-2.5 rounded-2xl bg-surface/85 py-1.5 pl-1.5 pr-2">
                      <ProductThumb image={e.image} category={e.category} size={40} className="rounded-xl" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[15px] font-semibold text-heading transition-colors", done && "text-muted line-through")}>{e.name}</span>
                        {e.quantity && <span className="block text-xs text-muted">{formatQty(e.quantity, e.unit)}</span>}
                      </span>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        aria-label={`Купить ${e.name}`}
                        disabled={done || !shopping.list_id}
                        onClick={() => buy.mutate(e.id)}
                        className="press -m-1 rounded-full p-1"
                      >
                        <CheckCircle checked={done} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Что купить">
                {shopping.items.map((item, i) => (
                  <li key={`${item}-${i}`} className="max-w-full truncate rounded-full bg-surface/85 px-3 py-1 text-sm font-semibold text-heading">
                    {item}
                  </li>
                ))}
              </ul>
            )}
            <Link to={link} className="press flex h-10 items-center justify-center gap-1 rounded-full bg-surface text-sm font-bold text-mint-ink shadow-card">
              Открыть список <ChevronRight className="size-4" aria-hidden />
            </Link>
          </>
        )}
      </Card>
    </section>
  );
}

export function DashboardPage() {
  const { f, tz, familyId, members, role } = useFamily();
  const aiEnabled = useAiEnabled();
  const [txOpen, setTxOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [intro] = useState(() => !introPlayed);
  const q = useQuery({ queryKey: ["dashboard", familyId], queryFn: () => api<Dashboard>(f("/dashboard")), refetchInterval: 60_000 });

  useEffect(() => {
    if (q.data) introPlayed = true;
  }, [q.data]);

  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const today = todayIn(tz);
  const monthName = formatDate(today, tz, { month: "long" });
  const shoppingLink = d.shopping.list_id ? `/home/shopping/${d.shopping.list_id}` : "/home/shopping";
  const num = intro ? "num-in" : undefined;
  const canEditBudget = role === "owner" || role === "admin";

  const actions: QuickAction[] = [
    { label: "Расход", icon: CircleDollarSign, tone: "peach", onClick: () => setTxOpen(true) },
    { label: "Покупки", icon: ShoppingCart, tone: "mint", to: shoppingLink },
    { label: "Задача", icon: ListChecks, tone: "lemon", to: "/home/tasks?new=1" },
    { label: "Событие", icon: CalendarDays, tone: "lavender", to: "/calendar?new=1" },
  ];

  return (
    <div className={cn("space-y-5", intro && "stagger")}>
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
          <Art name="house" alive className={cn("-mr-1 h-[96px] w-[116px]", intro && "animate-art-in")} />
        </div>
      </header>

      {/* Main block: the month budget — limit, spent, remaining from the server */}
      <BudgetCard d={d} monthName={monthName} num={num} canEdit={canEditBudget} onAddExpense={() => setTxOpen(true)} onEditBudget={() => setBudgetOpen(true)} />

      {/* Products: what the family still needs to buy */}
      <ShoppingBlock shopping={d.shopping} link={shoppingLink} />

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
        <Card tone="lavender" className="animate-fade-in flex items-center gap-3 py-3.5">
          <Art name="mugs" alive className="h-14 w-[66px]" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-heading">Начните с первых данных</p>
            <p className="text-sm text-lavender-ink">{members.length > 1 ? "Добавьте покупку, дело или событие." : "Позовите близкого — всё станет общим."}</p>
            {members.length <= 1 && (
              <Link to="/profile" className="press mt-2 inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-sm font-bold text-lavender-ink shadow-card">
                <UserPlus className="size-4" aria-hidden /> Пригласить
              </Link>
            )}
          </div>
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
                        <p className="text-xs font-extrabold uppercase">{relativeDay(day, today) ?? formatDate(e.start, tz, { weekday: "short", day: "numeric" })}</p>
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

      {/* Family summary — only once there is something to sum up */}
      {(d.task_stats.done_this_week > 0 || d.task_stats.open_total > 0 || d.life_goals_open > 0 || d.goals.length > 0 || d.activity.length > 0) && (
        <section>
          <SectionTitle title="Семейная сводка" />
          <Card className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Link to="/home/tasks" className="press rounded-2xl bg-mint px-1 py-2.5">
                <p className="tabular text-xl font-extrabold text-heading">{d.task_stats.done_this_week}</p>
                <p className="text-xs font-bold leading-tight text-mint-ink">сделано за неделю</p>
              </Link>
              <Link to="/home/tasks" className="press rounded-2xl bg-lemon-soft px-1 py-2.5">
                <p className="tabular text-xl font-extrabold text-heading">{d.task_stats.open_total}</p>
                <p className="text-xs font-bold leading-tight text-lemon-ink">
                  {d.task_stats.overdue_total > 0 ? `открыто · ${d.task_stats.overdue_total} просрочено` : "задач открыто"}
                </p>
              </Link>
              <Link to="/home/life" className="press rounded-2xl bg-lavender px-1 py-2.5">
                <p className="tabular text-xl font-extrabold text-heading">{d.life_goals_open}</p>
                <p className="text-xs font-bold leading-tight text-lavender-ink">общих целей</p>
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
      )}

      <TransactionSheet open={txOpen} onOpenChange={setTxOpen} />
      <BudgetSheet open={budgetOpen} onOpenChange={setBudgetOpen} month={`${today.slice(0, 7)}-01`} current={d.budget?.limit ?? null} />
    </div>
  );
}
