import { BellOff, BellRing, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/api/client";
import { Button, Card, useToast } from "@/components/ui";
import { currentSubscription, disablePush, enablePush, needsInstallForPush, pushSupported } from "@/lib/pwa";
import { isInsideTelegram } from "@/lib/telegram";

type State = "loading" | "telegram" | "install" | "unsupported" | "off" | "on" | "denied";

async function detect(): Promise<State> {
  if (isInsideTelegram()) return "telegram";
  if (needsInstallForPush()) return "install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await currentSubscription()) ? "on" : "off";
}

/** Push notifications of this device (the home-screen app or a desktop browser). */
export function PushCard() {
  const toast = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void detect().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;
  if (state === "telegram")
    return (
      <Card className="text-sm text-muted">
        Уведомления прямо на экран блокировки, без Telegram, приходят в Family OS, установленном на экран «Домой»: «Профиль» → «Устройства».
      </Card>
    );
  return (
    <Card className="space-y-3">
      <p className="flex items-center gap-2 font-semibold">
        <BellRing className="size-5 text-accent" /> Уведомления на этом устройстве
      </p>
      {state === "install" && (
        <p className="text-sm text-muted">На iPhone уведомления работают только в приложении с экрана «Домой»: «Поделиться» → «На экран "Домой"», затем откройте Family OS с иконки и войдите.</p>
      )}
      {state === "unsupported" && <p className="text-sm text-muted">Этот браузер не умеет показывать уведомления. Уведомления остаются во «Входящих» и в Telegram.</p>}
      {state === "denied" && (
        <p className="text-sm text-muted">Уведомления запрещены в настройках телефона. iPhone: «Настройки» → «Уведомления» → Family OS → «Допуск уведомлений». Затем вернитесь сюда.</p>
      )}
      {state === "off" && (
        <>
          <p className="text-sm text-muted">Напоминания, платежи и покупки будут приходить на экран блокировки, даже когда приложение закрыто.</p>
          <Button
            block
            icon={<BellRing className="size-4" />}
            loading={busy}
            onClick={() =>
              run(async () => {
                const result = await enablePush();
                if (result === "granted") {
                  setState("on");
                  toast.show("Уведомления включены");
                } else setState(result === "denied" ? "denied" : "off");
              })
            }
          >
            Включить уведомления
          </Button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="text-sm text-success">Включены. Если они вам заменяют Telegram, сообщения бота можно выключить ниже.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={<Send className="size-4" />}
              loading={busy}
              onClick={() =>
                run(async () => {
                  const { sent } = await api<{ sent: number }>("/push/test", { method: "POST" });
                  toast.show(sent ? "Отправлено — проверьте экран" : "Не дошло: выключите и включите уведомления заново", sent ? "success" : "error");
                })
              }
            >
              Проверить
            </Button>
            <Button
              variant="ghost"
              icon={<BellOff className="size-4" />}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await disablePush();
                  setState("off");
                })
              }
            >
              Выключить
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
