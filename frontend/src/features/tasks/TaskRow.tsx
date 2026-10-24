import { useMutation } from "@tanstack/react-query";
import { Check, MessageSquare, Repeat } from "lucide-react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PrivateMark } from "@/components/Visibility";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { haptic } from "@/lib/telegram";
import type { Task } from "@/types/api";

import { useTasksInvalidate } from "./api";

export function TaskRow({ task }: { task: Task }) {
  const { f, tz, memberName } = useFamily();
  const invalidate = useTasksInvalidate();
  const toast = useToast();
  const done = task.status === "done";
  const toggle = useMutation({
    mutationFn: () => (done ? api(f(`/tasks/${task.id}`), { method: "PATCH", body: { status: "todo" } }) : api(f(`/tasks/${task.id}/complete`), { method: "POST" })),
    onSuccess: async () => {
      haptic(done ? "light" : "success");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Вернуть в работу" : "Отметить выполненной"}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
        className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition", done ? "border-success bg-success text-white" : task.priority === "high" ? "border-danger" : "border-border")}
      >
        {done && <Check className="size-4" />}
      </button>
      <Link to={`/home/tasks/${task.id}`} className="min-w-0 flex-1 py-1">
        <span className={cn("flex items-center gap-1.5 truncate text-[15px]", done && "text-muted line-through")}>
          {task.title} {task.visibility === "private" && <PrivateMark />} {task.recurrence_freq && <Repeat className="size-3.5 text-subtle" />}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-muted">
          {task.assignee_id ? memberName(task.assignee_id) : "Общая"}
          {task.due_at && <span className={cn(task.overdue && "text-danger")}>· {formatDateTime(task.due_at, tz)}</span>}
          {task.comments_count > 0 && (
            <span className="inline-flex items-center gap-0.5">
              · <MessageSquare className="size-3" /> {task.comments_count}
            </span>
          )}
        </span>
      </Link>
    </div>
  );
}
