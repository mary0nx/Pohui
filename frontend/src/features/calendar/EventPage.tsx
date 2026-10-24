import { useMutation } from "@tanstack/react-query";
import { Bell, CalendarX, Clock, MapPin, Pencil, Repeat, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark } from "@/components/Visibility";
import { Badge, Button, Card, ConfirmDialog, ErrorState, LoadingBlock, Segmented, useToast } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";

import { useCalendarInvalidate, useEvent } from "./api";
import { EventSheet } from "./EventSheet";

const FREQ = { daily: "каждый день", weekly: "каждую неделю", monthly: "каждый месяц", yearly: "каждый год" } as const;

export function EventPage() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const occurrence = params.get("at");
  const { f, tz, userId, role } = useFamily();
  const q = useEvent(eventId);
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useCalendarInvalidate();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "occurrence" | null>(null);

  const rsvp = useMutation({
    mutationFn: (v: string) => api(f(`/calendar/events/${eventId}/rsvp`), { body: { rsvp: v } }),
    onSuccess: () => invalidate(),
  });
  const remove = useMutation({
    mutationFn: () => api(f(`/calendar/events/${eventId}`), { method: "DELETE" }),
    onSuccess: async () => {
      await invalidate();
      toast.show("Событие удалено");
      navigate("/calendar");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const skip = useMutation({
    mutationFn: () => api(f(`/calendar/events/${eventId}/cancel-occurrence`), { body: { occurrence_start: occurrence } }),
    onSuccess: async () => {
      await invalidate();
      toast.show("Повторение отменено");
      navigate("/calendar");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (q.isPending) return <LoadingBlock rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;
  const start = occurrence ?? e.starts_at;
  const duration = new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime();
  const end = new Date(new Date(start).getTime() + duration).toISOString();
  const mine = e.attendees.find((a) => a.user_id === userId);
  const canDelete = e.created_by === userId || role !== "member";

  return (
    <div className="space-y-4">
      <PageHeader title={e.title} subtitle={e.visibility === "private" ? <span className="inline-flex items-center gap-1"><PrivateMark /> Видно только вам</span> : undefined} back="/calendar" />
      <Card className="space-y-3">
        <p className="flex items-center gap-3 text-[15px]">
          <Clock className="size-5 text-accent" />
          {e.all_day ? formatDate(start, tz, { day: "numeric", month: "long", weekday: "long" }) : `${formatDate(start, tz, { day: "numeric", month: "long", weekday: "short" })}, ${formatTime(start, tz)}–${formatTime(end, tz)}`}
        </p>
        {e.location && (
          <p className="flex items-center gap-3 text-[15px]">
            <MapPin className="size-5 text-accent" /> {e.location}
          </p>
        )}
        {e.recurrence_freq && (
          <p className="flex items-center gap-3 text-[15px]">
            <Repeat className="size-5 text-accent" /> Повтор {FREQ[e.recurrence_freq]}
            {e.recurrence_until && ` до ${formatDate(e.recurrence_until, tz)}`}
          </p>
        )}
        <p className="flex items-center gap-3 text-[15px]">
          <Bell className="size-5 text-accent" />
          {e.my_reminders.length ? `Напомнить за ${e.my_reminders.map((m) => (m >= 1440 ? `${m / 1440} дн.` : m >= 60 ? `${m / 60} ч.` : `${m} мин.`)).join(", ")}` : "Без напоминания"}
        </p>
        {e.description && <p className="whitespace-pre-wrap border-t border-border pt-3 text-[15px] text-muted">{e.description}</p>}
      </Card>

      {e.visibility === "family" && e.attendees.length > 0 && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-accent" /> Участники
          </p>
          <ul className="space-y-1.5 text-sm">
            {e.attendees.map((a) => (
              <li key={a.user_id} className="flex justify-between">
                <span>{a.name}</span>
                <Badge tone={a.rsvp === "accepted" ? "success" : a.rsvp === "declined" ? "danger" : "neutral"}>{a.rsvp === "accepted" ? "идёт" : a.rsvp === "declined" ? "не идёт" : "не ответил(а)"}</Badge>
              </li>
            ))}
          </ul>
          {mine && (
            <Segmented
              value={mine.rsvp}
              onChange={(v) => rsvp.mutate(v)}
              options={[
                { value: "accepted", label: "Иду" },
                { value: "pending", label: "Не знаю" },
                { value: "declined", label: "Не иду" },
              ]}
            />
          )}
        </Card>
      )}

      <div className="grid gap-2">
        <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>
          Изменить
        </Button>
        {e.recurrence_freq && occurrence && (
          <Button variant="secondary" icon={<CalendarX className="size-4" />} onClick={() => setConfirm("occurrence")}>
            Отменить только это повторение
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm("delete")}>
            Удалить {e.recurrence_freq ? "всю серию" : "событие"}
          </Button>
        )}
      </div>

      <EventSheet open={edit} onOpenChange={setEdit} event={e} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        danger
        title={confirm === "occurrence" ? "Отменить это повторение?" : "Удалить событие?"}
        description={confirm === "occurrence" ? "Остальные повторения останутся в календаре." : "Событие и напоминания будут удалены для всех участников."}
        confirmLabel={confirm === "occurrence" ? "Отменить повторение" : "Удалить"}
        loading={remove.isPending || skip.isPending}
        onConfirm={() => (confirm === "occurrence" ? skip.mutate() : remove.mutate())}
      />
    </div>
  );
}
