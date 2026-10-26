import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, ErrorState, Input, LoadingBlock, Section, Switch, useToast } from "@/components/ui";
import type { NotificationCategory, NotificationSettings } from "@/types/api";

import { PushCard } from "./PushCard";

const LABELS: Record<NotificationCategory, string> = {
  event_reminder: "Напоминания о событиях",
  payment_due: "Сроки платежей",
  task_overdue: "Просроченные задачи",
  task_assigned: "Новые задачи",
  task_reminder: "Напоминания по задачам и задачи на сегодня",
  custom_reminder: "Личные напоминания",
  shopping_update: "Изменения списков покупок",
  shopping_reminder: "Покупки на сегодня",
  goal_update: "Цели и накопления",
  document_expiry: "Сроки документов",
  system: "Системные",
};

export function NotificationsPage() {
  const { familyId, tz } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["notification-settings", familyId], queryFn: () => api<NotificationSettings>("/notifications/settings") });
  const save = useMutation({
    mutationFn: (body: Partial<NotificationSettings>) => api<NotificationSettings>("/notifications/settings", { method: "PUT", body: { ...q.data, ...body } }),
    onSuccess: (data) => qc.setQueryData(["notification-settings", familyId], data),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  if (q.isPending) return <LoadingBlock />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  return (
    <div className="space-y-5">
      <PageHeader title="Уведомления" back="/profile" art="bell" />
      {!s.bot_started && <Card className="border-warning/40 bg-warning-soft text-sm">Бот ещё не может писать вам: откройте чат с ботом и нажмите «Старт». До этого уведомления видны только во входящих приложения.</Card>}
      {s.bot_blocked && <Card className="border-danger/40 bg-danger-soft text-sm">Бот заблокирован в Telegram — разблокируйте его, чтобы снова получать сообщения.</Card>}
      <PushCard />
      <Card>
        <Switch label="Отправлять в Telegram" checked={s.telegram_enabled} onChange={(v) => save.mutate({ telegram_enabled: v })} />
      </Card>
      <Section title="Тихие часы">
        <Card className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Input label="С" type="time" value={s.quiet_start?.slice(0, 5) ?? ""} onChange={(e) => save.mutate({ quiet_start: e.target.value || null })} />
            <Input label="До" type="time" value={s.quiet_end?.slice(0, 5) ?? ""} onChange={(e) => save.mutate({ quiet_end: e.target.value || null })} />
          </div>
          <p className="text-xs text-muted">В это время сообщения откладываются до конца тихих часов. Часовой пояс: {s.timezone ?? tz}.</p>
        </Card>
      </Section>
      <Section title="Категории">
        <Card className="divide-y divide-border py-1">
          {(Object.keys(LABELS) as NotificationCategory[]).map((c) => (
            <Switch key={c} label={LABELS[c]} checked={s.categories[c]} onChange={(v) => save.mutate({ categories: { ...s.categories, [c]: v } })} />
          ))}
        </Card>
      </Section>
      <p className="px-1 text-xs text-muted">О ваших личных записях партнёр уведомлений не получает. Тихие часы и категории действуют и для Telegram, и для уведомлений на телефон.</p>
    </div>
  );
}
