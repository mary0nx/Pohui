import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Repeat } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PrivateMark } from "@/components/Visibility";
import { CheckCircle, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { celebrate, centerOf } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
import type { Task } from "@/types/api";

import { useTasksInvalidate } from "./api";

/** `isLast`: completing this task empties the list — worth a small celebration. */
export function TaskRow({ task, isLast = false }: { task: Task; isLast?: boolean }) {
  const box = useRef<HTMLButtonElement>(null);
  const { f, tz, memberName } = useFamily();
  const invalidate = useTasksInvalidate();
  const toast = useToast();
  const done = task.status === "done";
  const toggle = useMutation({
    mutationFn: () => (done ? api(f(`/tasks/${task.id}`), { method: "PATCH", body: { status: "todo" } }) : api(f(`/tasks/${task.id}/complete`), { method: "POST" })),
    onSuccess: async () => {
      haptic(done ? "light" : "success");
      if (!done && isLast) celebrate(centerOf(box.current));
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <button
        ref={box}
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Вернуть в работу: ${task.title}` : `Отметить выполненной: ${task.title}`}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate()}
        className="press -m-1 rounded-full p-1"
      >
        <CheckCircle checked={done} className={cn(!done && task.priority === "high" && "border-coral")} />
      </button>
      <Link to={`/home/tasks/${task.id}`} className="min-w-0 flex-1 py-1">
        <span className={cn("flex items-center gap-1.5 truncate text-[15px] font-semibold transition-colors duration-300", done && "text-muted line-through decoration-2")}>
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
