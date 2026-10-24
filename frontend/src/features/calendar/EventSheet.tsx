import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { VisibilityPicker } from "@/components/Visibility";
import { Button, Input, Select, Sheet, Switch, Textarea, useToast } from "@/components/ui";
import { addDays, todayIn, zonedDate, zonedTime, zonedToIso } from "@/lib/time";
import type { CalendarEvent } from "@/types/api";

import { useCalendarInvalidate } from "./api";

const schema = z
  .object({
    title: z.string().trim().min(1, "Введите название").max(200),
    date: z.string().min(10),
    start: z.string(),
    endDate: z.string().min(10),
    end: z.string(),
    all_day: z.boolean(),
    location: z.string().max(300),
    description: z.string().max(5000),
    recurrence: z.enum(["", "daily", "weekly", "monthly", "yearly"]),
    until: z.string(),
    reminder: z.string(),
    visibility: z.enum(["family", "private"]),
  })
  .refine((v) => v.all_day ? v.endDate >= v.date : `${v.endDate}T${v.end}` >= `${v.date}T${v.start}`, { message: "Окончание раньше начала", path: ["end"] });

type Values = z.infer<typeof schema>;

const REMINDERS = [
  { value: "", label: "Без напоминания" },
  { value: "0", label: "В момент начала" },
  { value: "15", label: "За 15 минут" },
  { value: "60", label: "За 1 час" },
  { value: "180", label: "За 3 часа" },
  { value: "1440", label: "За 1 день" },
  { value: "10080", label: "За неделю" },
];

export function EventSheet({ open, onOpenChange, event, defaultDate }: { open: boolean; onOpenChange: (v: boolean) => void; event?: CalendarEvent | null; defaultDate?: string }) {
  const { f, tz } = useFamily();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useCalendarInvalidate();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const allDay = form.watch("all_day");

  useEffect(() => {
    if (!open) return;
    if (event) {
      const lastDay = event.all_day ? addDays(zonedDate(event.ends_at, tz), -1) : zonedDate(event.ends_at, tz);
      form.reset({
        title: event.title,
        date: zonedDate(event.starts_at, tz),
        start: zonedTime(event.starts_at, tz),
        endDate: lastDay,
        end: zonedTime(event.ends_at, tz),
        all_day: event.all_day,
        location: event.location ?? "",
        description: event.description ?? "",
        recurrence: event.recurrence_freq ?? "",
        until: event.recurrence_until ?? "",
        reminder: event.my_reminders[0] !== undefined ? String(event.my_reminders[0]) : "",
        visibility: event.visibility,
      });
    } else {
      const date = defaultDate ?? todayIn(tz);
      form.reset({ title: "", date, start: "18:00", endDate: date, end: "19:00", all_day: false, location: "", description: "", recurrence: "", until: "", reminder: "60", visibility: "family" });
    }
  }, [open, event, defaultDate, form, tz]);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const starts_at = zonedToIso(v.date, v.all_day ? "00:00" : v.start, tz);
      const ends_at = zonedToIso(v.endDate, v.all_day ? "00:00" : v.end, tz);
      const common = {
        title: v.title,
        location: v.location || null,
        description: v.description || null,
        starts_at,
        ends_at,
        all_day: v.all_day,
        recurrence_until: v.until || null,
      };
      if (event) {
        const updated = await api<CalendarEvent>(f(`/calendar/events/${event.id}`), {
          method: "PATCH",
          body: { ...common, recurrence_freq: v.recurrence || null, clear_recurrence: !v.recurrence },
        });
        await api(f(`/calendar/events/${event.id}/reminders`), { method: "PUT", body: { minutes: v.reminder ? [Number(v.reminder)] : [], all_members: true } });
        return updated;
      }
      return api<CalendarEvent>(f("/calendar/events"), {
        body: { ...common, recurrence_freq: v.recurrence || null, visibility: v.visibility, reminder_minutes: v.reminder ? [Number(v.reminder)] : [] },
      });
    },
    onSuccess: async (ev) => {
      await invalidate();
      toast.show(event ? "Событие сохранено" : "Событие добавлено");
      onOpenChange(false);
      if (!event) navigate(`/calendar/${ev.id}`);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const err = form.formState.errors;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "Изменить событие" : "Новое событие"}
      footer={
        <Button block size="lg" loading={save.isPending} onClick={form.handleSubmit((v) => save.mutate(v))}>
          Сохранить
        </Button>
      }
    >
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <Input label="Название" placeholder="Ужин у родителей" error={err.title?.message} {...form.register("title")} />
        <Switch checked={allDay ?? false} onChange={(v) => form.setValue("all_day", v)} label="Весь день" />
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <Input label="Начало" type="date" {...form.register("date", { onChange: (e) => form.getValues("endDate") < e.target.value && form.setValue("endDate", e.target.value) })} />
          {!allDay && <Input label="Время" type="time" {...form.register("start")} />}
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <Input label="Окончание" type="date" {...form.register("endDate")} />
          {!allDay && <Input label="Время" type="time" error={err.end?.message} {...form.register("end")} />}
        </div>
        {allDay && err.end && <p className="text-sm text-danger">{err.end.message}</p>}
        <Input label="Место" {...form.register("location")} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Повтор" {...form.register("recurrence")}>
            <option value="">Не повторять</option>
            <option value="daily">Каждый день</option>
            <option value="weekly">Каждую неделю</option>
            <option value="monthly">Каждый месяц</option>
            <option value="yearly">Каждый год</option>
          </Select>
          <Select label="Напоминание" {...form.register("reminder")}>
            {REMINDERS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        {form.watch("recurrence") && <Input label="Повторять до (необязательно)" type="date" {...form.register("until")} />}
        <Textarea label="Описание" rows={3} {...form.register("description")} />
        {!event && <VisibilityPicker value={form.watch("visibility") ?? "family"} onChange={(v) => form.setValue("visibility", v)} />}
        <p className="text-xs text-muted">Время указывается в часовом поясе семьи ({tz}). Напоминание придёт в Telegram.</p>
      </form>
    </Sheet>
  );
}
