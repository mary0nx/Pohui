import { ListChecks, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Chips, EmptyState, ErrorState, LoadingBlock } from "@/components/ui";

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
  const [filter, setFilter] = useState("all");
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const query =
    filter === "done" ? { status: "done" } : filter === "overdue" ? { status: "open", due: "overdue" } : filter === "all" ? { status: "open" } : { status: "open", assignee: filter };
  const tasks = useTasks(query);
  const stats = useTaskStats();

  const setCreating = (v: boolean) => setParams(v ? { new: "1" } : {}, { replace: true });

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
        <Card className="flex items-center gap-3 bg-success-soft">
          <Sparkles className="size-5 text-success" />
          <p className="text-sm">
            Вместе за неделю: <b>{stats.data.done_this_week}</b> дел{stats.data.points_this_week > 0 && <> · {stats.data.points_this_week} очков</>}
            <span className="block text-xs text-muted">За месяц: {stats.data.done_this_month}</span>
          </p>
        </Card>
      )}
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
            <TaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}
      <TaskSheet open={creating} onOpenChange={setCreating} />
    </div>
  );
}
