import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Smartphone, Copy, LogOut, Moon, Palette as PaletteIcon, Share2, Sparkles, SquarePlus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useAiEnabled, useFamily, useSession } from "@/app/session";
import { PALETTES, useTheme, type ThemeMode } from "@/app/theme";
import { PageHeader } from "@/components/layout/PageHeader";
import { InviteCodeForm } from "@/features/onboarding/InviteCodeForm";
import { DevicesSection } from "@/features/settings/DevicesSection";
import { Avatar, Badge, Button, Card, ConfirmDialog, Input, Section, Segmented, Select, Sheet, Switch, useToast } from "@/components/ui";
import { useI18n, type Locale } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { disablePush } from "@/lib/pwa";
import { addToHomeScreen, homeScreenStatus, webApp, type HomeScreenStatus } from "@/lib/telegram";
import type { Family, Invitation, InvitationCreated, Member, Role } from "@/types/api";

const ROLE: Record<Role, string> = { owner: "владелец", admin: "администратор", member: "участник" };
const TIMEZONES = ["Europe/Warsaw", "Europe/Berlin", "Europe/London", "Europe/Kyiv", "Europe/Vilnius", "Europe/Minsk", "Europe/Moscow", "Asia/Tbilisi", "Asia/Almaty", "America/New_York"];

/** "Add to Home Screen" via Telegram (8.0+); hidden where Telegram cannot do it. */
function HomeScreenRow() {
  const [status, setStatus] = useState<HomeScreenStatus>("unsupported");
  useEffect(() => {
    let alive = true;
    void homeScreenStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  if (status === "unsupported") return null;
  if (status === "added")
    return (
      <p className="flex items-center gap-3 px-4 py-3.5 text-muted">
        <Check className="size-5 text-success" /> Иконка уже на экране «Домой»
      </p>
    );
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={() => addToHomeScreen(() => setStatus("added"))}>
      <SquarePlus className="size-5 text-accent" /> Добавить на экран «Домой»
    </button>
  );
}

export function ProfilePage() {
  const { f, familyId, family, me, userId, role, tz } = useFamily();
  const { refreshMe, logout, setActiveFamily } = useSession();
  const { mode, setMode, palette, setPalette, resolved } = useTheme();
  const aiEnabled = useAiEnabled();
  const { locale, setLocale, t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const isAdmin = role === "owner" || role === "admin";
  const [invite, setInvite] = useState<InvitationCreated | null>(null);
  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  const [leave, setLeave] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [editName, setEditName] = useState<string | null>(null);

  const invitations = useQuery({ queryKey: ["invitations", familyId], queryFn: () => api<Invitation[]>(f("/invitations")), enabled: isAdmin });
  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: ["family"] }), qc.invalidateQueries({ queryKey: ["invitations"] })]);

  const patch = useMutation({
    mutationFn: (body: Partial<Family>) => api<Family>(f(""), { method: "PATCH", body }),
    onSuccess: async () => {
      await invalidate();
      await refreshMe();
      toast.show("Сохранено");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const createInvite = useMutation({
    mutationFn: () => api<InvitationCreated>(f("/invitations"), { body: { role: "admin", max_uses: 1, expires_in_hours: 72 } }),
    onSuccess: async (inv) => {
      setInvite(inv);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(f(`/invitations/${id}`), { method: "DELETE" }), onSuccess: () => invalidate() });
  const remove = useMutation({
    mutationFn: (m: Member) => api(f(`/members/${m.id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setRemoveMember(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const leaveMut = useMutation({
    mutationFn: () => api(f("/leave"), { method: "POST" }),
    onSuccess: async () => {
      qc.clear();
      await refreshMe();
    },
    onError: (e) => (toast.show(errorMessage(e), "error"), setLeave(false)),
  });
  const deleteMut = useMutation({
    mutationFn: () => api(f("/delete"), { body: { confirm_name: confirmName } }),
    onSuccess: async () => {
      qc.clear();
      await refreshMe();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const inviteLink = invite?.link ?? null;
  const share = () => {
    if (!invite) return;
    const text = inviteLink ?? `Код приглашения: ${invite.start_param}`;
    const tg = webApp();
    if (inviteLink && tg?.initData) tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent("Присоединяйся к нашей семье в Family OS: нажми на ссылку, в чате бота — «Старт», затем «Присоединиться».")}`);
    else void navigator.clipboard?.writeText(text).then(() => toast.show("Скопировано"));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Профиль" art="mugs" />
      <Card className="flex items-center gap-3">
        <Avatar name={me.user.first_name} src={me.user.photo_url} size={52} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">
            {me.user.first_name} {me.user.last_name ?? ""}
          </p>
          <p className="text-sm text-muted">
            {family?.name} · {ROLE[role]}
          </p>
        </div>
        {me.auth_method === "dev" && <Badge tone="warning">dev</Badge>}
      </Card>
      {!me.user.bot_started && (
        <Card className="border-warning/40 bg-warning-soft text-sm">
          Чтобы получать напоминания в Telegram, откройте бота и нажмите «Старт» — Telegram не позволяет ботам писать первыми.
        </Card>
      )}

      {me.families.length > 1 && (
        <Section title="Семейное пространство">
          <Select aria-label="Активная семья" value={familyId} onChange={(e) => setActiveFamily(e.target.value).then(() => qc.clear())}>
            {me.families.map((m) => (
              <option key={m.family_id} value={m.family_id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Section>
      )}

      <Section title="Участники">
        <Card className="divide-y divide-border p-0">
          {(family?.members ?? []).map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.first_name} src={m.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">
                  {m.first_name} {m.user_id === userId && <span className="text-muted">(вы)</span>}
                </p>
                <p className="text-xs text-muted">{ROLE[m.role]}</p>
              </div>
              {role === "owner" && m.user_id !== userId && (
                <Select aria-label={`Роль ${m.first_name}`} className="h-9 w-36 text-sm" value={m.role} onChange={(e) => api(f(`/members/${m.id}`), { method: "PATCH", body: { role: e.target.value } }).then(invalidate).catch((err) => toast.show(errorMessage(err), "error"))}>
                  <option value="admin">администратор</option>
                  <option value="member">участник</option>
                  <option value="owner">передать владение</option>
                </Select>
              )}
              {isAdmin && m.user_id !== userId && m.role !== "owner" && (
                <button type="button" aria-label={`Удалить ${m.first_name}`} className="text-muted" onClick={() => setRemoveMember(m)}>
                  <UserMinus className="size-5" />
                </button>
              )}
            </div>
          ))}
        </Card>
        {isAdmin && (
          <Button variant="soft" block icon={<UserPlus className="size-4" />} loading={createInvite.isPending} onClick={() => createInvite.mutate()}>
            Пригласить участника
          </Button>
        )}
        {isAdmin && (invitations.data?.length ?? 0) > 0 && (
          <Card className="space-y-2">
            <p className="text-sm font-medium">Активные приглашения</p>
            {invitations.data!.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="text-muted">до {formatDateTime(i.expires_at, tz)}</span>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                  Отозвать
                </Button>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {isAdmin && family && (
        <Section title="Настройки семьи">
          <Card className="space-y-3">
            <div className="flex items-end gap-2">
              <Input label="Название" value={editName ?? family.name} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
              <Button variant="secondary" disabled={!editName || editName === family.name} onClick={() => patch.mutate({ name: editName! })}>
                Сохранить
              </Button>
            </div>
            <Select label="Часовой пояс" value={family.timezone} onChange={(e) => patch.mutate({ timezone: e.target.value })}>
              {[...new Set([family.timezone, ...TIMEZONES])].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
            <Select label="Основная валюта" value={family.currency} onChange={(e) => patch.mutate({ currency: e.target.value })} hint="Изменить можно, пока нет операций">
              {["PLN", "EUR", "USD", "GBP", "UAH", "BYN", "RUB", "KZT", "GEL", "CZK"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Card>
        </Section>
      )}

      <Section title="Приложение">
        <Card className="space-y-3">
          <div>
            <p className="mb-1.5 flex items-center gap-2 px-1 text-sm font-medium text-muted">
              <Moon className="size-4" /> {t("settings.theme")}
            </p>
            <Segmented<ThemeMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "system", label: t("settings.theme.system") },
                { value: "light", label: t("settings.theme.light") },
                { value: "dark", label: t("settings.theme.dark") },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-2 px-1 text-sm font-medium text-muted">
              <PaletteIcon className="size-4" /> Цвет
            </p>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Цветовая палитра">
              {PALETTES.map((p) => {
                const active = p.id === palette;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPalette(p.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-xs transition",
                      active ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-border text-muted",
                    )}
                  >
                    <span
                      className="flex size-8 items-center justify-center rounded-full shadow-sm"
                      style={resolved === "dark" ? { background: p.dark, color: "#111418" } : { background: p.light, color: "#ffffff" }}
                    >
                      {active && <Check className="size-4" aria-hidden />}
                    </span>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Select label={t("settings.language")} value={locale} onChange={(e) => setLocale(e.target.value as Locale)} hint="Перевод на английский и польский пока частичный">
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="pl">Polski</option>
          </Select>
        </Card>
        <Card className="divide-y divide-border p-0">
          <HomeScreenRow />
          <Link to="/profile/notifications" className="flex items-center gap-3 px-4 py-3.5">
            <Bell className="size-5 text-accent" /> Уведомления
          </Link>
          <Link to="/profile/apple-pay" className="flex items-center gap-3 px-4 py-3.5">
            <Smartphone className="size-5 text-accent" /> Apple Pay → расходы
          </Link>
          {aiEnabled && (
            <Link to="/profile/ai" className="flex items-center gap-3 px-4 py-3.5">
              <Sparkles className="size-5 text-accent" /> AI-ассистент и память
            </Link>
          )}
        </Card>
        {aiEnabled && family && isAdmin && <Switch label="AI выполняет простые команды сразу" description="Например, «добавь 45 zł за продукты». Удаление и массовые изменения всегда требуют подтверждения." checked={family.ai_auto_execute} onChange={(v) => patch.mutate({ ai_auto_execute: v })} />}
      </Section>

      <DevicesSection />

      <Section title="Приглашение в другую семью">
        <Card>
          <p className="mb-3 text-sm text-muted">Если вам прислали ссылку-приглашение, вставьте её сюда — вы присоединитесь к той семье. Текущая семья останется в списке, между ними можно переключаться.</p>
          <InviteCodeForm />
        </Card>
      </Section>

      <Section title="Опасная зона">
        <div className="grid gap-2">
          {role !== "owner" && (
            <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => setLeave(true)}>
              Покинуть семью
            </Button>
          )}
          {role === "owner" && (
            <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>
              Удалить семейное пространство
            </Button>
          )}
          {me.auth_method === "dev" && (
            <Button variant="ghost" onClick={() => logout()}>
              Выйти (dev)
            </Button>
          )}
          {me.auth_method === "device" && (
            <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => disablePush().finally(() => logout())}>
              Выйти на этом устройстве
            </Button>
          )}
        </div>
      </Section>

      <Sheet open={invite !== null} onOpenChange={(v) => !v && setInvite(null)} title="Приглашение создано" description="Одноразовое, действует 72 часа">
        {invite && (
          <div className="space-y-3">
            <div className="break-all rounded-2xl bg-surface-2 p-3 font-mono text-sm">{inviteLink ?? invite.start_param}</div>
            {inviteLink ? (
              <p className="text-sm text-muted">Партнёр нажимает на ссылку, в чате бота — «Старт», затем «Присоединиться». Если что-то пошло не так, ссылку можно вставить в приложении: «Профиль» → «Приглашение в другую семью».</p>
            ) : (
              <p className="text-xs text-muted">Ссылка недоступна: не указан TELEGRAM_BOT_USERNAME. Передайте код — его можно вставить в приложении в поле «Ссылка или код приглашения».</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(inviteLink ?? invite.start_param).then(() => toast.show("Скопировано"))}>
                Копировать
              </Button>
              <Button icon={<Share2 className="size-4" />} onClick={share}>
                Отправить
              </Button>
            </div>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={removeMember !== null}
        onOpenChange={(v) => !v && setRemoveMember(null)}
        danger
        title={`Удалить ${removeMember?.first_name ?? ""} из семьи?`}
        description="Участник потеряет доступ. Его личные записи в этой семье будут удалены, общие останутся."
        confirmLabel="Удалить"
        loading={remove.isPending}
        onConfirm={() => removeMember && remove.mutate(removeMember)}
      />
      <ConfirmDialog open={leave} onOpenChange={setLeave} danger title="Покинуть семью?" description="Вы потеряете доступ к общим данным. Ваши личные записи в этой семье будут удалены." confirmLabel="Покинуть" loading={leaveMut.isPending} onConfirm={() => leaveMut.mutate()} />
      <ConfirmDialog
        open={del}
        onOpenChange={(v) => (setDel(v), setConfirmName(""))}
        danger
        title="Удалить семейное пространство?"
        description={<>Все данные семьи — финансы, календарь, документы — будут удалены безвозвратно для всех участников. Введите название «{family?.name}» для подтверждения.</>}
        confirmLabel="Удалить навсегда"
        confirmDisabled={confirmName !== family?.name}
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      >
        <Input aria-label="Название семьи" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={family?.name} />
      </ConfirmDialog>
    </div>
  );
}
