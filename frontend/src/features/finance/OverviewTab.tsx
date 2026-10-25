import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { useFamily } from "@/app/session";
import { Card, CardHeader, EmptyState, ErrorState, LoadingBlock, ProgressRing, Segmented } from "@/components/ui";
import { formatMoney, formatMonth } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion";
import { monthKey, todayIn } from "@/lib/time";

import { useSummary } from "./api";
import { MonthSwitcher } from "./MonthSwitcher";

// Brand-led categorical palette: distinct hues, readable on cream and on cocoa.
export const CHART_COLORS = ["#ff786b", "#5fbf9f", "#9b86e8", "#e8b923", "#315b4c", "#f2a65a", "#5b9bd5", "#d36d9a", "#8c7d70", "#b6d36b"];

export function OverviewTab() {
  const { tz, currency } = useFamily();
  const current = monthKey(todayIn(tz));
  const [month, setMonth] = useState(current);
  const [scope, setScope] = useState<"family" | "personal" | "all">("family");
  const q = useSummary(month, scope);

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} onChange={setMonth} max={current} />
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: "family", label: "Общие" },
          { value: "personal", label: "Мои личные" },
          { value: "all", label: "Всё моё" },
        ]}
      />
      {q.isPending ? (
        <LoadingBlock rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <SummaryView data={q.data} scope={scope} currency={currency} />
      )}
    </div>
  );
}

function SummaryView({ data, scope, currency }: { data: NonNullable<ReturnType<typeof useSummary>["data"]>; scope: string; currency: string }) {
  const totals = scope === "personal" ? data.personal : scope === "family" ? data.family : {
    income: String(Number(data.family.income) + Number(data.personal.income)),
    expense: String(Number(data.family.expense) + Number(data.personal.expense)),
    net: String(Number(data.family.net) + Number(data.personal.net)),
  };
  const pie = data.by_category.map((c, i) => ({ name: c.name, value: Number(c.amount), color: c.color ?? CHART_COLORS[i % CHART_COLORS.length] }));
  const history = data.history.map((h) => ({ month: formatMonth(h.month).slice(0, 3), expense: Number(h.expense), income: Number(h.income) }));
  const empty = Number(totals.income) === 0 && Number(totals.expense) === 0;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Доходы", value: totals.income, cls: "text-income" },
          { label: "Расходы", value: totals.expense, cls: "text-expense" },
          { label: "Итог", value: totals.net, cls: Number(totals.net) >= 0 ? "text-income" : "text-danger" },
        ].map((t, i) => (
          <Card key={t.label} tone={i === 0 ? "mint" : i === 1 ? "coral" : "lavender"} className="p-3">
            <p className="text-xs font-semibold text-muted">{t.label}</p>
            <p className={`tabular mt-0.5 text-[15px] font-extrabold ${t.cls}`}>{formatMoney(t.value, currency, { compact: true })}</p>
          </Card>
        ))}
      </div>

      {data.budget && scope === "family" && (
        <Card className="flex items-center gap-4">
          <ProgressRing value={data.budget.percent} level={data.budget.level} size={88} stroke={11} label={`Бюджет месяца: ${Math.round(data.budget.percent)}%`}>
            <span className="tabular text-lg font-extrabold">{Math.round(data.budget.percent)}%</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-base font-bold">Бюджет месяца</p>
            <p className="tabular mt-1 text-sm text-muted">
              Потрачено {formatMoney(data.budget.spent, currency)} из {formatMoney(data.budget.limit, currency)}
            </p>
            <p className={`mt-1 text-sm font-semibold ${data.budget.level === "ok" ? "text-success" : data.budget.level === "warning" ? "text-warning" : "text-danger"}`}>
              {data.budget.level === "ok" ? "Всё по плану" : data.budget.level === "warning" ? "Почти исчерпан" : "Бюджет превышен"}
            </p>
          </div>
        </Card>
      )}

      {data.category_alerts.length > 0 && scope === "family" && (
        <Card tone="lemon">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" /> Лимиты почти исчерпаны
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.category_alerts.map((a) => (
              <li key={a.category_id} className="flex justify-between">
                <span>{a.name}</span>
                <span className="tabular">
                  {formatMoney(a.amount, currency, { compact: true })} / {formatMoney(a.budget, currency, { compact: true })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {empty ? (
        <Card>
          <EmptyState title="Нет операций за этот месяц" text="Добавьте расход или доход кнопкой «Операция»." />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Расходы по категориям" />
          {pie.length > 0 ? (
            <div className="flex items-center gap-3">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" innerRadius="62%" outerRadius="100%" paddingAngle={3} cornerRadius={6} stroke="none" isAnimationActive={!prefersReducedMotion()} animationDuration={700}>
                      {pie.map((p) => (
                        <Cell key={p.name} fill={p.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {data.by_category.slice(0, 6).map((c, i) => (
                  <li key={c.category_id ?? "none"} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: pie[i]?.color }} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="tabular shrink-0 font-medium">{formatMoney(c.amount, currency, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">Расходов нет.</p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Последние 6 месяцев" />
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, color: "var(--text)", boxShadow: "var(--shadow)" }}
                formatter={(v) => formatMoney(Number(v), currency)}
              />
              <Bar dataKey="income" name="Доходы" fill="var(--mint)" radius={[8, 8, 8, 8]} isAnimationActive={!prefersReducedMotion()} animationDuration={600} />
              <Bar dataKey="expense" name="Расходы" fill="var(--coral)" radius={[8, 8, 8, 8]} isAnimationActive={!prefersReducedMotion()} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {data.by_member.length > 1 && (
        <Card>
          <CardHeader title="Кто записал" />
          <ul className="space-y-1.5 text-sm">
            {data.by_member.map((m) => (
              <li key={m.user_id ?? "x"} className="flex justify-between">
                <span>{m.name}</span>
                <span className="tabular text-muted">{formatMoney(m.expense, currency, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.other_currency_count > 0 && (
        <p className="flex items-start gap-2 px-1 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" /> {data.other_currency_count} операций в других валютах не включены в сводку (курсы валют не используются).
        </p>
      )}
    </>
  );
}
