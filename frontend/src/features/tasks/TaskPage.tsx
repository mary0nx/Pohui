import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, History, Pencil, Repeat, Send, Trash2, User } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark } from "@/components/Visibility";
import { Badge, Button, Card, ConfirmDialog, ErrorState, Input, LoadingBlock, useToast } from "@/components/ui";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { HistoryEntry } from "@/types/api";

import { useComments, useTask, useTasksInvalidate } from "./api";
import { TaskSheet } from "./TaskSheet";

const PRIORITY = { low: "Низкий", normal: "Обычный", high: "Высокий" } as const;

export function TaskPage() {
  const { taskId } = useParams();
  const { f, tz, memberName, familyId } = useFamily();
  const task = useTask(taskId);
  const comments = useComments(taskId);
  const history = useQuery({ queryKey: ["task-history", familyId, taskId], queryFn: () => api<HistoryEntry[]>(f(`/tasks/${taskId}/history`)), enabled: false });
  const invalidate = useTasksInvalidate();
  const toast = useToast();
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [comment, setComment] = useState("");

  const complete = useMutation({
    mutationFn: () => api(f(`/tasks/${taskId}/complete`), { method: "POST" }),
    onSuccess: async () => {
      toast.show("Задача выполнена");
      await invalidate();
    },
  });
  const reopen = useMutation({ mutationFn: () => api(f(`/tasks/${taskId}`), { method: "PATCH", body: { status: "todo" } }), onSuccess: () => invalidate() });
  const remove = useMutation({
    mutationFn: () => api(f(`/tasks/${taskId}`), { method: "DELETE" }),
    onSuccess: async () => {
      await invalidate();
      navigate("/home/tasks");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const addComment = useMutation({
    mutationFn: (body: string) => api(f(`/tasks/${taskId}/comments`), { body: { body } }),
    onSuccess: async () => {
      setComment("");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (task.isPending) return <LoadingBlock rows={3} />;
  if (task.isError) return <ErrorState error={task.error} onRetry={() => task.refetch()} />;
  const t = task.data;
  const done = t.status === "done";

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} back="/home/tasks" subtitle={t.visibility === "private" ? <span className="inline-flex items-center gap-1"><PrivateMark /> Личная задача</span> : undefined} />
      <Card className="space-y-3">
        <p className="flex items-center gap-3 text-[15px]">
          <User className="size-5 text-accent" /> {t.assignee_id ? memberName(t.assignee_id) : "Общая задача"}
        </p>
        {t.due_at && (
          <p className={`flex items-center gap-3 text-[15px] ${t.overdue ? "text-danger" : ""}`}>
            <Clock className="size-5 text-accent" /> {formatDateTime(t.due_at, tz)} {t.overdue && <Badge tone="danger">просрочена</Badge>}
          </p>
        )}
        {t.recurrence_freq && (
          <p className="flex items-center gap-3 text-[15px]">
            <Repeat className="size-5 text-accent" /> Повторяется
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Badge>{PRIORITY[t.priority]} приоритет</Badge>
          {t.points ? <Badge tone="accent">{t.points} очков</Badge> : null}
          {done && <Badge tone="success">выполнена {t.completed_by ? memberName(t.completed_by) : ""}</Badge>}
        </div>
        {t.description && <p className="whitespace-pre-wrap border-t border-border pt-3 text-[15px] text-muted">{t.description}</p>}
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {done ? (
          <Button variant="secondary" loading={reopen.isPending} onClick={() => reopen.mutate()}>
            Вернуть в работу
          </Button>
        ) : (
          <Button icon={<CheckCircle2 className="size-4" />} loading={complete.isPending} onClick={() => complete.mutate()}>
            Выполнено
          </Button>
        )}
        <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>
          Изменить
        </Button>
      </div>

      <Card className="space-y-3">
        <p className="font-semibold">Комментарии</p>
        {(comments.data ?? []).map((c) => (
          <div key={c.id} className="rounded-2xl bg-surface-2 p-3 text-sm">
            <p className="text-xs text-muted">
              {c.author_name} · {timeAgo(c.created_at)}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) addComment.mutate(comment.trim());
          }}
        >
          <Input aria-label="Комментарий" placeholder="Написать комментарий" value={comment} onChange={(e) => setComment(e.target.value)} className="flex-1" />
          <Button type="submit" aria-label="Отправить" className="w-12 px-0" disabled={!comment.trim()} loading={addComment.isPending}>
            <Send className="size-5" />
          </Button>
        </form>
      </Card>

      <Card>
        {history.data ? (
          <ul className="space-y-2 text-sm">
            {history.data.map((h, i) => (
              <li key={i}>
                <span className="font-medium">{h.actor_name ?? "—"}</span> <span className="text-muted">{h.action.replace("task.", "")}</span>
                <span className="block text-xs text-subtle">{timeAgo(h.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Button variant="ghost" block icon={<History className="size-4" />} loading={history.isFetching} onClick={() => history.refetch()}>
            Показать историю изменений
          </Button>
        )}
      </Card>
      <Button variant="ghost" block className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
        Удалить задачу
      </Button>
      <TaskSheet open={edit} onOpenChange={setEdit} task={t} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} danger title="Удалить задачу?" description="Задача, комментарии и напоминания будут удалены." confirmLabel="Удалить" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
