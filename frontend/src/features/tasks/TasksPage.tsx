import { ListChecks, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Chips, EmptyState, ErrorState, LoadingBlock, Segmented } from "@/components/ui";
import { WeekPlanner } from "@/components/WeekPlanner";
import { zonedDate } from "@/lib/time";
import type { Task } from "@/types/api";

import { useTasks, useTaskStats } from "./api";
import { TaskRow } from "./TaskRow";
import { TaskSheet } from "./TaskSheet";

const FILTERS = [
  { value: "all", label: "Все открытые" },
  { value: "me", label: "Мои" },
  { value: "unassigned", label: "Общие" },
  { value: "overdue", label: "Просроченные" },
  { value: "done", label: "Выполненные" },
];

export function TasksPage() {
  const { tz } = useFamily();
  const [filter, setFilter] = useState("all");
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const view = params.get("view") === "week" ? "week" : "list";
  const [newDay, setNewDay] = useState<string | undefined>();
  const query =
    filter === "done" ? { status: "done" } : filter === "overdue" ? { status: "open", due: "overdue" } : filter === "all" ? { status: "open" } : { status: "open", assignee: filter };
  const tasks = useTasks(query);
  const week = useTasks({ status: "open", limit: 200 });
  const stats = useTaskStats();

  const setCreating = (v: boolean) => {
    if (!v) setNewDay(undefined);
    setParams({ ...(view === "week" ? { view: "week" } : {}), ...(v ? { new: "1" } : {}) }, { replace: true });
  };
  const byDay = new Map<string, Task[]>();
  for (const t of week.data ?? []) {
    if (!t.due_at) continue;
    const day = zonedDate(t.due_at, tz);
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Задачи"
        back="/home"
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Задача
          </Button>
        }
      />
      {stats.data && (
        <Card tone="mint" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-mint text-on-bright">
            <Sparkles className="size-5" />
          </span>
          <p className="text-sm">
            Вместе за неделю: <b>{stats.data.done_this_week}</b> дел{stats.data.points_this_week > 0 && <> · {stats.data.points_this_week} очков</>}
            <span className="block text-xs text-muted">За месяц: {stats.data.done_this_month}</span>
          </p>
        </Card>
      )}
      <Segmented
        value={view}
        onChange={(v) => setParams(v === "week" ? { view: "week" } : {}, { replace: true })}
        options={[
          { value: "list", label: "Список" },
          { value: "week", label: "Неделя" },
        ]}
      />
      {view === "week" ? (
        week.isPending ? (
          <LoadingBlock rows={4} />
        ) : week.isError ? (
          <ErrorState error={week.error} onRetry={() => week.refetch()} />
        ) : (
          <WeekPlanner
            tz={tz}
            addLabel="Добавить задачу"
            onAdd={(day) => {
              setNewDay(day);
              setCreating(true);
            }}
            renderDay={(day) => {
              const items = byDay.get(day);
              if (!items?.length) return null;
              return (
                <div className="divide-y divide-border">
                  {items.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </div>
              );
            }}
          />
        )
      ) : (
        <>
          <Chips value={filter} onChange={setFilter} options={FILTERS} />
          {tasks.isPending ? (
            <LoadingBlock rows={4} />
          ) : tasks.isError ? (
            <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
          ) : tasks.data.length === 0 ? (
            <Card>
              <EmptyState icon={<ListChecks className="size-6" />} title={filter === "done" ? "Пока ничего не выполнено" : "Всё сделано!"} text="Добавьте домашнее дело или назначьте его партнёру." />
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {tasks.data.map((t) => (
                <TaskRow key={t.id} task={t} isLast={filter !== "done" && tasks.data.length === 1} />
              ))}
            </Card>
          )}
        </>
      )}
      <TaskSheet open={creating} onOpenChange={setCreating} defaultDate={newDay} />
    </div>
  );
}
