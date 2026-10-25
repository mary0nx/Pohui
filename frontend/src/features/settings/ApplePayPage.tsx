import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Send, Smartphone } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, ConfirmDialog, ErrorState, LoadingBlock, Section, Select, useToast } from "@/components/ui";
import { useAccounts } from "@/features/finance/api";
import { formatDateTime } from "@/lib/format";

interface Status {
  connected: boolean;
  token_prefix: string | null;
  account_id: string | null;
  last_used_at: string | null;
  hook_url: string;
}

interface Connected extends Status {
  token: string;
  sent_to_chat: boolean;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="space-y-1">
      <p className="px-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2 text-xs break-all select-all">{value}</code>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Скопировать: ${label}`}
          icon={<Copy className="size-4" />}
          onClick={() => void navigator.clipboard?.writeText(value).then(() => toast.show("Скопировано"))}
        />
      </div>
    </div>
  );
}

const STEPS: { title: string; text: string }[] = [
  { title: "Откройте «Команды»", text: "Приложение «Команды» (Shortcuts) на iPhone → вкладка «Автоматизация» → «+» / «Новая автоматизация»." },
  { title: "Триггер «Транзакция»", text: "Выберите «Транзакция» (Transaction). Отметьте свои карты, остальное — «Любой». Выберите «Запускать сразу» → «Далее» → «Новая пустая автоматизация»." },
  { title: "Место покупки (по желанию)", text: "Добавьте действие «Текущая геопозиция» (Get Current Location) — тогда в записи будет адрес." },
  { title: "Отправка в Family OS", text: "Добавьте действие «Получить содержимое URL» (Get Contents of URL). В поле URL вставьте адрес ниже. Нажмите «Показать больше»: Метод — POST." },
  { title: "Заголовок с ключом", text: "«Заголовки» → «Добавить новый заголовок»: Ключ — Authorization, Текст — строка «Bearer fos_…» (вставьте целиком, см. ниже)." },
  { title: "Данные покупки", text: "«Тело запроса» → JSON → добавьте 4 поля (тип «Текст»): amount — переменная «Ввод команды» → «Сумма»; merchant — «Ввод команды» → «Продавец»; card — «Ввод команды» → «Карта или пропуск»; location — «Текущая геопозиция»." },
  { title: "Подтверждение (по желанию)", text: "Добавьте «Показать уведомление» с переменной «Содержимое URL» — после оплаты придёт «Записано: 45,90 PLN — Biedronka (Продукты)»." },
];

export function ApplePayPage() {
  const { f, familyId, tz } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const accounts = useAccounts();
  const key = ["apple-pay", familyId];
  const q = useQuery({ queryKey: key, queryFn: () => api<Status>(f("/integrations/apple-pay")) });
  const [created, setCreated] = useState<Connected | null>(null);
  const [account, setAccount] = useState<string | undefined>();
  const [confirmOff, setConfirmOff] = useState(false);

  const connect = useMutation({
    mutationFn: (sendToChat: boolean) => api<Connected>(f("/integrations/apple-pay"), { body: { account_id: (account ?? q.data?.account_id) || null, send_to_chat: sendToChat } }),
    onSuccess: async (r, sendToChat) => {
      setCreated(r);
      if (sendToChat) toast.show(r.sent_to_chat ? "Ключ отправлен в чат с ботом" : "Не удалось отправить в чат — скопируйте ниже", r.sent_to_chat ? "success" : "error");
      await qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const changeAccount = useMutation({
    mutationFn: (accountId: string) => api<Status>(f("/integrations/apple-pay"), { method: "PATCH", body: { account_id: accountId || null } }),
    onSuccess: async () => {
      toast.show("Счёт сохранён");
      await qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const disconnect = useMutation({
    mutationFn: () => api(f("/integrations/apple-pay"), { method: "DELETE" }),
    onSuccess: async () => {
      setCreated(null);
      setConfirmOff(false);
      await qc.invalidateQueries({ queryKey: key });
      toast.show("Apple Pay отключён");
    },
  });

  if (q.isPending) return <LoadingBlock />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const selectedAccount = account ?? s.account_id ?? "";

  return (
    <div className="space-y-5">
      <PageHeader title="Apple Pay → расходы" back="/profile" />
      <Card className="flex gap-3 text-sm">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-accent" />
        <p>
          После каждой оплаты картой из Wallet iPhone сам отправит в Family OS сумму, магазин, карту и место покупки — расход появится в выбранном счёте с категорией по магазину. Нужен iPhone с iOS 17 или новее.
        </p>
      </Card>

      <Section title="Счёт для покупок">
        <Select
          label="Куда записывать"
          value={selectedAccount}
          onChange={(e) => (s.connected ? changeAccount.mutate(e.target.value) : setAccount(e.target.value))}
          hint="Оплата в другой валюте попадёт в счёт этой валюты, если он есть."
        >
          <option value="">Основной счёт семьи</option>
          {(accounts.data ?? [])
            .filter((a) => !a.archived_at)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
                {a.visibility === "private" ? " · личный" : ""}
              </option>
            ))}
        </Select>
      </Section>

      <Section title="Ключ для iPhone">
        {created ? (
          <Card className="space-y-3">
            <CopyRow label="Адрес (URL)" value={created.hook_url} />
            <CopyRow label="Заголовок Authorization" value={`Bearer ${created.token}`} />
            <p className="text-xs text-warning">Ключ показывается один раз. Он личный — не пересылайте его. Потеряли — создайте новый.</p>
          </Card>
        ) : s.connected ? (
          <Card className="space-y-1 text-sm">
            <p>
              Подключено · ключ <code>{s.token_prefix}…</code>
            </p>
            <p className="text-muted">{s.last_used_at ? `Последняя покупка: ${formatDateTime(s.last_used_at, tz)}` : "Покупок пока не было"}</p>
          </Card>
        ) : null}
        <div className="grid gap-2">
          <Button icon={<Send className="size-4" />} loading={connect.isPending && connect.variables === true} onClick={() => connect.mutate(true)}>
            {s.connected ? "Новый ключ — прислать в чат с ботом" : "Получить ключ — прислать в чат с ботом"}
          </Button>
          <Button variant="secondary" loading={connect.isPending && connect.variables === false} onClick={() => connect.mutate(false)}>
            {s.connected ? "Новый ключ — показать здесь" : "Получить ключ — показать здесь"}
          </Button>
          {s.connected && (
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmOff(true)}>
              Отключить
            </Button>
          )}
        </div>
        {s.connected && !created && <p className="px-1 text-xs text-muted">Новый ключ заменит старый — его нужно будет вставить в команду заново.</p>}
      </Section>

      <Section title="Настройка на iPhone">
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong">{i + 1}</span>
              <div className="text-sm">
                <p className="font-medium">{step.title}</p>
                <p className="text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="px-1 text-xs text-muted">
          Автоматизация срабатывает при оплате телефоном или часами в магазине. Покупки, повторённые в ту же минуту, не дублируются. Категорию можно поменять — в следующий раз покупки в этом магазине получат ту же категорию.
        </p>
      </Section>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        danger
        title="Отключить Apple Pay?"
        description="Ключ перестанет работать, новые покупки не будут записываться. Уже записанные расходы останутся."
        confirmLabel="Отключить"
        loading={disconnect.isPending}
        onConfirm={() => disconnect.mutate()}
      />
    </div>
  );
}
