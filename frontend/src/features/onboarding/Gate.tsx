import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, RefreshCw, Send, ServerOff, Settings, ShieldAlert, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { api, errorMessage } from "@/api/client";
import familyArt from "@/assets/family-splash.webp";
import { Daisy } from "@/components/Daisy";
import { router } from "@/app/routes";
import { useSession } from "@/app/session";
import { Button, Card, ErrorState, Input, Select, Spinner } from "@/components/ui";

import { InviteCodeForm } from "./InviteCodeForm";
import { LinkLogin } from "./LinkLogin";
import type { Family, InvitationPreview, PendingInvitation } from "@/types/api";

function Centered({ children }: { children: ReactNode }) {
  return <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">{children}</div>;
}

function Logo() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
        <Home className="size-6" />
      </span>
      <div>
        <p className="text-xl font-bold">Family OS</p>
        <p className="text-sm text-muted">Пространство вашей семьи</p>
      </div>
    </div>
  );
}

/** Start-up screen, shown only while the session loads (no extra wait for the picture). The
 * family illustration is a local asset decoded off the main thread; on its own cream ground it
 * blends into the light theme and reads as a framed picture in the dark one. */
export function Splash() {
  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col items-center px-5 pb-[calc(24px+var(--safe-bottom))]">
      <div className="flex flex-[1.1] flex-col items-center justify-end gap-3 pb-8 text-muted" role="status">
        <Daisy spinning className="size-11" />
        <span className="text-sm">Загружаем ваше семейное пространство…</span>
      </div>
      <div className="flex flex-1 items-start justify-center">
        <img
          src={familyArt}
          alt=""
          width={522}
          height={390}
          decoding="async"
          fetchPriority="low"
          className="animate-fade-in h-auto max-h-[34dvh] w-[min(72vw,300px)] rounded-[28px] bg-[#fef7ed] object-contain [animation-duration:600ms]"
        />
      </div>
    </div>
  );
}

export function OutsideTelegram() {
  return (
    <Centered>
      <Logo />
      <LinkLogin />
    </Centered>
  );
}

/** Shown when the Family OS API cannot be reached or answers with something that is not the
 * API (for example a static host serving index.html). Nothing private is loaded here. */
export function ApiNotConfigured({ message }: { message: string | null }) {
  return (
    <Centered>
      <Logo />
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-warning">
            <Settings className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Сервер Family OS не подключён</p>
            <p className="mt-1 text-sm text-muted">Сайт опубликован, но в нём не указан адрес сервера, поэтому приложение не может загрузить данные.</p>
          </div>
        </div>
        {message && <p className="rounded-2xl bg-surface-2 p-3 text-sm break-words">{message}</p>}
        <div className="text-xs text-muted">
          <p className="font-medium">Для администратора:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>Запустите backend Family OS и проверьте, что открывается его адрес /health.</li>
            <li>Cloudflare → Workers &amp; Pages → проект → Settings → Variables and Secrets: добавьте VITE_API_URL с адресом backend.</li>
            <li>Deployments → ⋯ → Retry deployment, чтобы пересобрать сайт.</li>
          </ol>
        </div>
      </Card>
    </Centered>
  );
}

export function BackendUnavailable({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <Logo />
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-warning">
            <ServerOff className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Сервер Family OS недоступен</p>
            <p className="mt-1 text-sm text-muted">Приложение открылось, но не может связаться со своим сервером. Ваши данные в безопасности — они хранятся на сервере, а не здесь.</p>
          </div>
        </div>
        {message && <p className="rounded-2xl bg-surface-2 p-3 text-sm break-words">{message}</p>}
        <p className="text-xs text-muted">
          Если вы администратор: проверьте, что backend запущен и что при сборке фронтенда указан правильный адрес API (переменная VITE_API_URL).
        </p>
        <Button
          block
          variant="secondary"
          icon={<RefreshCw className="size-4" />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRetry();
            } finally {
              setBusy(false);
            }
          }}
        >
          Повторить
        </Button>
      </Card>
    </Centered>
  );
}

export function BootError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <Centered>
      <ErrorState error={new Error(message ?? "Ошибка запуска")} onRetry={onRetry} />
    </Centered>
  );
}

export function DevLogin() {
  const { devLogin } = useSession();
  const [id, setId] = useState("1001");
  const [name, setName] = useState("Анна");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (tid: number, n: string) => {
    setBusy(true);
    setError(null);
    try {
      await devLogin(tid, n);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Centered>
      <Logo />
      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          <b>Режим разработки.</b> Это не Telegram-авторизация. В production вход возможен только через Telegram.
        </span>
      </div>
      <Card className="space-y-3">
        <p className="font-semibold">Быстрый вход</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="soft" disabled={busy} onClick={() => go(1001, "Анна")}>
            Анна
          </Button>
          <Button variant="soft" disabled={busy} onClick={() => go(1002, "Павел")}>
            Павел
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Input aria-label="Telegram ID" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} />
          <Input aria-label="Имя" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button block loading={busy} disabled={!id || !name} onClick={() => go(Number(id), name)}>
          Войти как тестовый пользователь
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>
    </Centered>
  );
}

const TIMEZONES = ["Europe/Warsaw", "Europe/Berlin", "Europe/London", "Europe/Kyiv", "Europe/Vilnius", "Europe/Minsk", "Europe/Moscow", "Asia/Tbilisi", "Asia/Almaty", "America/New_York"];
const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "UAH", "BYN", "RUB", "KZT", "GEL", "CZK"];

const familySchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(100),
  currency: z.string().length(3),
  timezone: z.string().min(1),
});

export function CreateFamily() {
  const { refreshMe } = useSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof familySchema>>({
    resolver: zodResolver(familySchema),
    defaultValues: { name: "Наша семья", currency: "PLN", timezone: "Europe/Warsaw" },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api<Family>("/families", { body: values });
      await refreshMe();
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  return (
    <Centered>
      <Logo />
      <h1 className="text-2xl font-bold">Создайте семейное пространство</h1>
      <p className="mt-1 text-[15px] text-muted">Потом пригласите партнёра — данные будут общими, а личные записи останутся видны только вам.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Input label="Название" placeholder="Например, «Мы»" error={form.formState.errors.name?.message} {...form.register("name")} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Валюта" {...form.register("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select label="Часовой пояс" {...form.register("timezone")}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.split("/")[1]?.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" block size="lg" loading={form.formState.isSubmitting}>
          Создать
        </Button>
      </form>
      <div className="mt-8 border-t border-border pt-6">
        <p className="flex items-center gap-2 font-semibold text-heading">
          <Users className="size-4" /> Партнёр уже создал семью?
        </p>
        <p className="mb-3 mt-1 text-sm text-muted">Не создавайте новую — вставьте ссылку-приглашение, которую вам прислали.</p>
        <InviteCodeForm />
      </div>
    </Centered>
  );
}

function JoinCard({
  preview,
  onAccept,
  accepting,
  error,
  onLater,
}: {
  preview: InvitationPreview;
  onAccept: () => void;
  accepting: boolean;
  error: unknown;
  onLater: () => void;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Send className="size-5" />
        </span>
        <div>
          <p className="text-sm text-muted">{preview.inviter_name ? `${preview.inviter_name} приглашает вас` : "Приглашение"}</p>
          <p className="text-lg font-semibold">«{preview.family_name}»</p>
        </div>
      </div>
      {preview.already_member ? (
        <Button block onClick={onAccept} loading={accepting}>
          Вы уже в этой семье — открыть
        </Button>
      ) : (
        <Button block size="lg" onClick={onAccept} loading={accepting}>
          Присоединиться
        </Button>
      )}
      {error ? <p className="text-sm text-danger">{errorMessage(error)}</p> : null}
      <Button variant="ghost" block onClick={onLater}>
        Не сейчас
      </Button>
    </Card>
  );
}

export function JoinFamily({ token }: { token: string }) {
  const { refreshMe, clearInvite, setActiveFamily } = useSession();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<InvitationPreview>("/invitations/preview", { body: { token } }),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api<Family>("/invitations/accept", { body: { token } }),
    onSuccess: async (family) => {
      await setActiveFamily(family.id);
      await refreshMe();
      qc.clear();
      clearInvite();
      await router.navigate("/", { replace: true });
    },
  });
  return (
    <Centered>
      <Logo />
      {preview.isPending ? (
        <Spinner />
      ) : preview.isError ? (
        <Card className="space-y-3">
          <p className="font-semibold">Приглашение недействительно</p>
          <p className="text-sm text-muted">{errorMessage(preview.error)}. Попросите партнёра создать новое.</p>
          <Button variant="secondary" block onClick={clearInvite}>
            Продолжить без приглашения
          </Button>
        </Card>
      ) : (
        <JoinCard preview={preview.data} onAccept={() => accept.mutate()} accepting={accept.isPending} error={accept.error} onLater={clearInvite} />
      )}
    </Centered>
  );
}

/** The invitation was opened in the bot, but the app was started without it (menu button,
 *  bot profile): the server remembered it, so offer to join anyway. */
export function JoinPending({ invitation }: { invitation: PendingInvitation }) {
  const { refreshMe } = useSession();
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api<Family>("/invitations/pending/accept", { method: "POST" }),
    onSuccess: async () => {
      await refreshMe();
      qc.clear();
      await router.navigate("/", { replace: true });
    },
  });
  const later = useMutation({
    mutationFn: () => api("/invitations/pending/dismiss", { method: "POST" }),
    onSettled: () => refreshMe(),
  });
  return (
    <Centered>
      <Logo />
      <JoinCard preview={invitation} onAccept={() => accept.mutate()} accepting={accept.isPending} error={accept.error} onLater={() => later.mutate()} />
    </Centered>
  );
}
