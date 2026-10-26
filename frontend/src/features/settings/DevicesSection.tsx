import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Copy, ExternalLink, LogOut, MonitorSmartphone } from "lucide-react";

import { api, errorMessage } from "@/api/client";
import { useFamily, useSession } from "@/app/session";
import { Badge, Button, Card, Section, useToast } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { disablePush } from "@/lib/pwa";
import { isInsideTelegram, openExternal } from "@/lib/telegram";

interface Device {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string;
  current: boolean;
  push: boolean;
}

/** Phones and computers signed in outside Telegram (Safari, the home-screen app). */
export function DevicesSection() {
  const { tz } = useFamily();
  const { logout } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["devices"], queryFn: () => api<Device[]>("/auth/devices") });
  const revoke = useMutation({
    mutationFn: async (d: Device) => {
      if (d.current) {
        await disablePush().catch(() => undefined);
        await logout();
        return;
      }
      await api(`/auth/devices/${d.id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const site = window.location.origin;
  const devices = q.data ?? [];
  const inTelegram = isInsideTelegram();

  return (
    <Section title="Устройства">
      {devices.length > 0 && (
        <Card className="divide-y divide-border p-0">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <MonitorSmartphone className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[15px]">
                  {d.label} {d.current && <Badge tone="success">это устройство</Badge>}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  был(о) в сети {formatDateTime(d.last_used_at, tz)}
                  {d.push && <BellRing className="size-3.5" aria-label="уведомления включены" />}
                </p>
              </div>
              <Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} loading={revoke.isPending && revoke.variables?.id === d.id} onClick={() => revoke.mutate(d)}>
                Выйти
              </Button>
            </div>
          ))}
        </Card>
      )}
      {inTelegram && (
        <Card className="space-y-2 text-sm">
          <p className="font-semibold">Family OS как приложение на телефоне</p>
          <p className="text-muted">Можно пользоваться без Telegram: иконка на экране «Домой», свои уведомления на экране блокировки.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Откройте {site.replace(/^https?:\/\//, "")} в Safari (на iPhone — именно в Safari).</li>
            <li>«Поделиться» → «На экран "Домой"» → «Добавить».</li>
            <li>Откройте Family OS с иконки → «Войти через Telegram» → в боте «✅ Войти».</li>
            <li>«Профиль» → «Уведомления» → «Включить уведомления на этом устройстве».</li>
          </ol>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(site).then(() => toast.show("Ссылка скопирована"))}>
              Копировать
            </Button>
            <Button variant="soft" icon={<ExternalLink className="size-4" />} onClick={() => openExternal(site)}>
              Открыть
            </Button>
          </div>
        </Card>
      )}
      {!inTelegram && devices.length === 0 && q.isSuccess && <p className="px-1 text-sm text-muted">Других устройств нет.</p>}
    </Section>
  );
}
