import { CheckCircle2, Send, Share, SquarePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/api/client";
import { parseTokenOut } from "@/api/contracts";
import { useSession } from "@/app/session";
import { Button, Card } from "@/components/ui";
import { isIos, isStandalone } from "@/lib/pwa";

interface Started {
  poll_token: string;
  bot_url: string;
  app_url: string;
  expires_at: string;
}

type PollStatus = "pending" | "approved" | "rejected" | "expired";

const POLL_MS = 2000;

/** Telegram app link on phones, t.me page on computers (it offers Telegram Desktop or Web). */
function openBot(s: Started): void {
  const phone = isIos() || /Android/.test(navigator.userAgent);
  window.location.href = phone ? s.app_url : s.bot_url;
}

/**
 * Sign-in in Safari or in the app on the home screen: the user confirms it with a button in
 * the Family OS bot, this page keeps asking the server until the confirmation arrives.
 */
export function LinkLogin() {
  const { signIn } = useSession();
  const [started, setStarted] = useState<Started | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const polling = useRef(false);

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const s = await api<Started>("/auth/link/start", { body: { standalone: isStandalone() } });
      setStarted(s);
      openBot(s);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const poll = useCallback(async () => {
    if (!started || polling.current) return;
    polling.current = true;
    try {
      const out = await api<{ status: PollStatus; auth: unknown }>("/auth/link/poll", { body: { poll_token: started.poll_token } });
      if (out.status === "approved" && out.auth) {
        signIn(parseTokenOut(out.auth, "/auth/link/poll"));
      } else if (out.status === "rejected") {
        setStarted(null);
        setProblem("Вход отклонён в Telegram. Если это были вы, нажмите «Войти через Telegram» ещё раз.");
      } else if (out.status === "expired") {
        setStarted(null);
        setProblem("Время на подтверждение вышло. Нажмите «Войти через Telegram» ещё раз.");
      }
    } catch {
      /* network hiccup: the next tick tries again */
    } finally {
      polling.current = false;
    }
  }, [started, signIn]);

  useEffect(() => {
    if (!started) return;
    const tick = () => document.visibilityState === "visible" && void poll();
    const id = window.setInterval(tick, POLL_MS);
    // Coming back from Telegram: check at once instead of waiting for the next tick.
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [started, poll]);

  const installFirst = isIos() && !isStandalone();

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Вход в Family OS</p>
          <p className="mt-1 text-sm text-muted">Войти можно своим аккаунтом Telegram: бот Family OS спросит, вы ли это, а дальше приложение работает без Telegram. Вход сохраняется на этом устройстве.</p>
        </div>
        {started ? (
          <div className="space-y-3" role="status">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>В Telegram откроется чат с ботом Family OS. Если видите кнопку «Старт» / «Start», нажмите её.</li>
              <li>Нажмите «✅ Войти» под сообщением бота.</li>
              <li>Вернитесь сюда: вход завершится сам.</li>
            </ol>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden /> Ждём подтверждения в Telegram…
            </p>
            <div className="grid gap-2">
              <Button variant="secondary" icon={<Send className="size-4" />} onClick={() => openBot(started)}>
                Открыть Telegram ещё раз
              </Button>
              <a href={started.bot_url} target="_blank" rel="noopener noreferrer" className="text-center text-sm text-accent underline-offset-2 hover:underline">
                Не открывается? Открыть ссылку на бота
              </a>
              <Button variant="ghost" onClick={() => setStarted(null)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <Button block icon={<Send className="size-4" />} loading={busy} onClick={start}>
            Войти через Telegram
          </Button>
        )}
        {problem && <p className="rounded-2xl bg-warning-soft p-3 text-sm">{problem}</p>}
      </Card>
      {installFirst && !started && (
        <Card className="space-y-2 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <SquarePlus className="size-5 text-accent" /> Сначала установите на экран «Домой»
          </p>
          <p className="text-muted">Тогда Family OS откроется как обычное приложение и сможет присылать уведомления. Вход в Safari и вход в установленном приложении — отдельные, поэтому входите уже из иконки.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Нажмите <Share className="inline size-4 align-text-bottom" aria-label="Поделиться" /> «Поделиться» внизу Safari (или «⋯» → «Поделиться»).
            </li>
            <li>Выберите «На экран "Домой"» → «Добавить».</li>
            <li>Откройте Family OS с иконки и нажмите «Войти через Telegram».</li>
          </ol>
        </Card>
      )}
      {isStandalone() && !started && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted">
          <CheckCircle2 className="size-4 text-success" /> Открыто как приложение с экрана «Домой»
        </p>
      )}
    </div>
  );
}
