import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, errorMessage, newIdempotencyKey } from "@/api/client";
import { useFamily } from "@/app/session";
import { VisibilityPicker } from "@/components/Visibility";
import { Button, Input, Select, Sheet, Textarea, useToast } from "@/components/ui";
import { zonedDate, zonedTime, zonedToIso } from "@/lib/time";
import type { Frequency, Priority, Task, Visibility } from "@/types/api";

import { useTasksInvalidate } from "./api";

interface Form {
  title: string;
  description: string;
  assignee_id: string;
  date: string;
  time: string;
  priority: Priority;
  recurrence: "" | Frequency;
  points: string;
  reminder: string;
  visibility: Visibility;
}

export function TaskSheet({ open, onOpenChange, task }: { open: boolean; onOpenChange: (v: boolean) => void; task?: Task | null }) {
  const { f, tz, members, userId } = useFamily();
  const toast = useToast();
  const invalidate = useTasksInvalidate();
  const idem = useRef(newIdempotencyKey());
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (!open) return;
    idem.current = newIdempotencyKey();
    setForm(
      task
        ? {
            title: task.title,
            description: task.description ?? "",
            assignee_id: task.assignee_id ?? "",
            date: task.due_at ? zonedDate(task.due_at, tz) : "",
            time: task.due_at ? zonedTime(task.due_at, tz) : "20:00",
            priority: task.priority,
            recurrence: task.recurrence_freq ?? "",
            points: task.points ? String(task.points) : "",
            reminder: "",
            visibility: task.visibility,
          }
        : { title: "", description: "", assignee_id: "", date: "", time: "20:00", priority: "normal", recurrence: "", points: "", reminder: "", visibility: "family" },
    );
  }, [open, task, tz]);

  const save = useMutation({
    mutationFn: (v: Form) => {
      const due_at = v.date ? zonedToIso(v.date, v.time || "20:00", tz) : null;
      const common = { title: v.title.trim(), description: v.description || null, priority: v.priority, points: v.points ? Number(v.points) : null };
      if (task) {
        return api<Task>(f(`/tasks/${task.id}`), {
          method: "PATCH",
          body: {
            ...common,
            assignee_id: v.assignee_id || undefined,
            unassign: !v.assignee_id,
            due_at: due_at ?? undefined,
            clear_due: !due_at,
            recurrence_freq: v.recurrence || undefined,
            clear_recurrence: !v.recurrence,
          },
        });
      }
      return api<Task>(f("/tasks"), {
        body: { ...common, assignee_id: v.assignee_id || null, due_at, recurrence_freq: v.recurrence || null, visibility: v.visibility, reminder_minutes: v.reminder && due_at ? Number(v.reminder) : null },
        idempotencyKey: idem.current,
      });
    },
    onSuccess: async () => {
      await invalidate();
      toast.show(task ? "Задача сохранена" : "Задача добавлена");
      onOpenChange(false);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const valid = form && form.title.trim() && (!form.recurrence || form.date);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={task ? "Изменить задачу" : "Новая задача"}
      footer={
        <Button block size="lg" loading={save.isPending} disabled={!valid} onClick={() => form && save.mutate(form)}>
          Сохранить
        </Button>
      }
    >
      {form && (
        <div className="space-y-4">
          <Input label="Что сделать" autoFocus={!task} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Пропылесосить" />
          <Select label="Исполнитель" value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} disabled={form.visibility === "private"}>
            <option value="">Общая задача</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user_id === userId ? `${m.first_name} (я)` : m.first_name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Input label="Срок" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input label="Время" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} disabled={!form.date} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Приоритет" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              <option value="low">Низкий</option>
              <option value="normal">Обычный</option>
              <option value="high">Высокий</option>
            </Select>
            <Select label="Повтор" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as Form["recurrence"] })}>
              <option value="">Нет</option>
              <option value="daily">Каждый день</option>
              <option value="weekly">Каждую неделю</option>
              <option value="monthly">Каждый месяц</option>
            </Select>
          </div>
          {form.recurrence && !form.date && <p className="-mt-2 px-1 text-xs text-danger">Для повтора укажите срок</p>}
          {!task && form.date && (
            <Select label="Напомнить" value={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.value })}>
              <option value="">Без напоминания</option>
              <option value="0">В срок</option>
              <option value="60">За 1 час</option>
              <option value="1440">За 1 день</option>
            </Select>
          )}
          <Input label="Очки (необязательно)" inputMode="numeric" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value.replace(/\D/g, "").slice(0, 3) })} hint="Считаются только общие очки семьи — без соревнования." />
          <Textarea label="Описание" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {!task && <VisibilityPicker value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v, assignee_id: v === "private" ? userId : form.assignee_id })} />}
        </div>
      )}
    </Sheet>
  );
}
