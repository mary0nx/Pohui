import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, ErrorState, Input, LoadingBlock, Section, Segmented, Select, Switch, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

import { useCare, useCarePreview, type CareSettings, type CareTone } from "./api";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TONES: { value: CareTone; label: string }[] = [
  { value: "tender", label: "Нежный" },
  { value: "romantic", label: "Романтичный" },
  { value: "friendly", label: "Дружеский" },
  { value: "short", label: "Короткий" },
];
const ZONES = ["Europe/Warsaw", "Europe/Berlin", "Europe/London", "Europe/Kyiv", "Europe/Vilnius", "Europe/Minsk", "Europe/Moscow"];

type Form = Omit<CareSettings, "configured" | "default_name" | "country" | "next_send_at" | "telegram" | "push_devices">;

const hhmm = (t: string) => t.slice(0, 5);

function nextSendText(iso: string | null, tz: string): string {
  if (!iso) return "Сейчас сообщения не запланированы.";
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(at);
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(at);
  return `Следующее сообщение: ${day}, ${time}.`;
}

/** «Забота на каждый день»: the member's own morning message with the real weather. */
export function CarePage() {
  const care = useCare();
  const preview = useCarePreview(care.isSuccess);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (care.data && form === null) {
      const { configured: _c, default_name: _d, country: _co, next_send_at: _n, telegram: _t, push_devices: _p, ...rest } = care.data;
      setForm({ ...rest, send_time: hhmm(rest.send_time), leave_time: hhmm(rest.leave_time) });
    }
  }, [care.data, form]);

  const save = useMutation({
    mutationFn: (body: Form) => api<CareSettings>("/me/care", { method: "PUT", body }),
    onSuccess: async (data) => {
      qc.setQueryData(["care"], data);
      setForm((f) => (f ? { ...f, city: data.city, timezone: data.timezone } : f));
      await qc.invalidateQueries({ queryKey: ["care", "preview"] });
      toast.show(data.enabled ? "Сохранено — сообщения включены" : "Сохранено");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const test = useMutation({
    mutationFn: () => api<{ queued: boolean; telegram_ready: boolean; push_devices: number }>("/me/care/test", { method: "POST" }),
    onSuccess: (r) => {
      if (r.push_devices > 0) toast.show("Отправлено — уведомление Family OS придёт в течение минуты");
      else if (r.telegram_ready) toast.show("Отправлено в Telegram: приложение с уведомлениями пока не установлено");
      else toast.show("Сообщение во «Входящих»: включите уведомления в приложении Family OS", "error");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (care.isPending || (care.isSuccess && !form)) return <LoadingBlock />;
  if (care.isError) return <ErrorState error={care.error} onRetry={() => care.refetch()} />;
  const s = care.data;
  const f = form!;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...f, [key]: value });
  const tg = s.telegram;

  return (
    <div className="space-y-5">
      <PageHeader title="Забота" back="/profile" art="mugs" />
      <Card className="space-y-2">
        <Switch
          label="Утреннее сообщение с погодой"
          description="Каждое утро: прогноз на день, совет по одежде и тёплое пожелание — уведомлением из приложения Family OS."
          checked={f.enabled}
          onChange={(v) => {
            const next = { ...f, enabled: v };
            setForm(next);
            save.mutate(next);
          }}
        />
        {s.enabled && <p className="text-sm text-muted">{nextSendText(s.next_send_at, s.timezone)}</p>}
      </Card>

      {s.push_devices > 0 ? (
        <Card className="bg-mint-soft text-sm text-mint-ink">Сообщение придёт уведомлением из приложения Family OS на этом телефоне (устройств: {s.push_devices}).</Card>
      ) : (
        <Card className="space-y-2 border-warning/40 bg-warning-soft text-sm">
          <p className="font-semibold">Чтобы сообщение приходило из приложения Family OS</p>
          <p>
            Установите Family OS на экран «Домой» (Safari → «Поделиться» → «На экран "Домой"»), войдите и включите уведомления: «Профиль» → «Уведомления» → «Включить уведомления».
            {tg.bot_started && !tg.bot_blocked ? " Пока приложение не установлено, сообщение придёт в Telegram." : " До этого сообщение будет видно только во «Входящих»."}
          </p>
          <Link to="/profile/notifications" className="inline-block font-semibold text-accent">
            Открыть настройки уведомлений →
          </Link>
        </Card>
      )}

      <Section title="Сообщение на сегодня">
        <Card className="space-y-3">
          {preview.isPending ? (
            <p className="text-sm text-muted">Собираем прогноз…</p>
          ) : preview.isError ? (
            <p className="text-sm text-muted">Не удалось показать пример: {errorMessage(preview.error)}</p>
          ) : (
            <div className="rounded-[20px] bg-peach-soft p-4">
              <p className="font-bold">{preview.data.title}</p>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{preview.data.body}</p>
              {preview.data.weather && <p className="mt-3 text-[11px] text-muted">Прогноз: {preview.data.weather.source}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => preview.refetch()} loading={preview.isFetching}>
              Обновить
            </Button>
            <Button variant="soft" icon={<Send className="size-4" />} onClick={() => test.mutate()} loading={test.isPending}>
              Отправить тест
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="Настройки">
        <Card className="space-y-4">
          <Input label="Имя в приветствии" value={f.recipient_name ?? ""} placeholder={s.default_name} maxLength={40} onChange={(e) => set("recipient_name", e.target.value || null)} hint="Например, «Мария». Пусто — имя из Telegram." />
          <div>
            <p className="mb-1.5 px-1 text-sm font-medium text-muted">Обращение</p>
            <Segmented<"f" | "m">
              value={f.gender}
              onChange={(v) => set("gender", v)}
              options={[
                { value: "f", label: "К ней" },
                { value: "m", label: "К нему" },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 px-1 text-sm font-medium text-muted">Тон</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Тон сообщения">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={f.tone === t.value}
                  onClick={() => set("tone", t.value)}
                  className={cn("rounded-2xl border px-3 py-2.5 text-sm transition", f.tone === t.value ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-border text-muted")}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Время отправки" type="time" value={f.send_time} onChange={(e) => e.target.value && set("send_time", e.target.value)} />
            <Input label="Выход из дома" type="time" value={f.leave_time} onChange={(e) => e.target.value && set("leave_time", e.target.value)} />
          </div>
          <div>
            <p className="mb-1.5 px-1 text-sm font-medium text-muted">Дни</p>
            <div className="flex gap-1.5" role="group" aria-label="Дни отправки">
              {DAYS.map((label, i) => {
                const on = f.days.includes(i);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("days", on ? f.days.filter((d) => d !== i) : [...f.days, i].sort())}
                    className={cn("h-10 flex-1 rounded-xl text-sm font-semibold transition", on ? "bg-sage text-forest-ink" : "bg-surface-2 text-muted")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <Input label="Город" value={f.city} maxLength={100} onChange={(e) => set("city", e.target.value)} hint="По умолчанию Вроцлав. Можно написать по-польски или по-русски." />
          <Select label="Часовой пояс" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {[...new Set([f.timezone, ...ZONES])].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </Select>
          <Switch label="Советы по погоде" description="Зонт, тёплая одежда, вода в жару, сильный ветер." checked={f.weather_tips} onChange={(v) => set("weather_tips", v)} />
          <Input label="Подпись (необязательно)" value={f.signature ?? ""} placeholder="Например: Твой Юра" maxLength={40} onChange={(e) => set("signature", e.target.value || null)} />
          <Button block loading={save.isPending} onClick={() => save.mutate(f)}>
            Сохранить
          </Button>
        </Card>
      </Section>
      <p className="px-1 text-xs text-muted">
        Сообщение получает только тот, кто включил его здесь, — на своём телефоне. Погода — реальный прогноз Open-Meteo или MET Norway; если прогноз недоступен, придёт пожелание без погоды. Тихие часы
        на это сообщение не действуют: оно приходит в выбранное время.
      </p>
    </div>
  );
}
