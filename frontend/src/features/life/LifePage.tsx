import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Heart, Lightbulb, NotebookPen, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Badge, Button, Card, Chips, EmptyState, ErrorState, Input, LoadingBlock, Sheet, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";
import { haptic } from "@/lib/telegram";
import type { Habit, LifeItem, LifeKind, Visibility } from "@/types/api";

const KINDS: Record<LifeKind | "habit", { label: string; icon: typeof Heart; empty: string; privateDefault: boolean }> = {
  goal: { label: "Цели", icon: Target, empty: "Общие цели: переезд, путешествие, ремонт…", privateDefault: false },
  idea: { label: "Идеи и выходные", icon: Lightbulb, empty: "Идеи совместных занятий и планы на выходные.", privateDefault: false },
  habit: { label: "Привычки", icon: Check, empty: "Совместные привычки: прогулка, спорт, вечер без телефонов.", privateDefault: false },
  journal: { label: "Хорошие моменты", icon: Heart, empty: "Журнал приятных событий — то, что хочется запомнить.", privateDefault: true },
  wish: { label: "Желания", icon: Gift, empty: "Список желаний — подсказка для подарков.", privateDefault: true },
  note: { label: "Заметки", icon: NotebookPen, empty: "Личные заметки видны только вам.", privateDefault: true },
};

interface ItemForm {
  id?: string;
  kind: LifeKind;
  title: string;
  body: string;
  planned_for: string;
  happened_on: string;
  price: string;
  url: string;
  visibility: Visibility;
}

export function LifePage() {
  const [kind, setKind] = useState<LifeKind | "habit">("goal");
  return (
    <div className="space-y-3">
      <PageHeader title="Вместе" back="/home" />
      <Chips value={kind} onChange={setKind} options={Object.entries(KINDS).map(([value, v]) => ({ value: value as LifeKind | "habit", label: v.label }))} />
      {kind === "habit" ? <Habits /> : <Items kind={kind} />}
    </div>
  );
}

function Items({ kind }: { kind: LifeKind }) {
  const { f, familyId, tz, currency } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const meta = KINDS[kind];
  const q = useQuery({ queryKey: ["life", familyId, kind], queryFn: () => api<LifeItem[]>(f("/life/items"), { query: { kind } }) });
  const [form, setForm] = useState<ItemForm | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["life"] });
  const save = useMutation({
    mutationFn: (v: ItemForm) => {
      const body = { title: v.title.trim(), body: v.body || null, planned_for: v.planned_for || null, happened_on: v.happened_on || null, price: v.price ? v.price.replace(",", ".") : null, url: v.url || null };
      return v.id ? api(f(`/life/items/${v.id}`), { method: "PATCH", body }) : api(f("/life/items"), { body: { ...body, kind: v.kind, visibility: v.visibility } });
    },
    onSuccess: async () => {
      setForm(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const toggle = useMutation({
    mutationFn: (i: LifeItem) => api(f(`/life/items/${i.id}`), { method: "PATCH", body: { status: i.status === "done" ? "open" : "done" } }),
    onSuccess: async (_d, i) => {
      if (i.status !== "done" && i.kind === "goal") toast.show("Цель достигнута! 🎉");
      haptic("success");
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(f(`/life/items/${id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setForm(null);
      await invalidate();
    },
  });
  const blank: ItemForm = { kind, title: "", body: "", planned_for: "", happened_on: "", price: "", url: "", visibility: meta.privateDefault ? "private" : "family" };
  const done = (q.data ?? []).filter((i) => i.status === "done");
  const open = (q.data ?? []).filter((i) => i.status !== "done");

  return (
    <div className="space-y-3">
      {q.isPending ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<meta.icon className="size-6" />} title="Пока пусто" text={meta.empty} />
        </Card>
      ) : (
        <>
          {open.map((i) => (
            <LifeCard key={i.id} item={i} onOpen={() => setForm({ id: i.id, kind: i.kind, title: i.title, body: i.body ?? "", planned_for: i.planned_for ?? "", happened_on: i.happened_on ?? "", price: i.price ?? "", url: i.url ?? "", visibility: i.visibility })} onToggle={kind === "goal" || kind === "idea" || kind === "wish" ? () => toggle.mutate(i) : undefined} tz={tz} currency={currency} />
          ))}
          {done.length > 0 && (
            <>
              <h3 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{kind === "goal" ? "История достижений" : "Готово"}</h3>
              {done.map((i) => (
                <LifeCard key={i.id} item={i} onOpen={() => setForm({ id: i.id, kind: i.kind, title: i.title, body: i.body ?? "", planned_for: i.planned_for ?? "", happened_on: i.happened_on ?? "", price: i.price ?? "", url: i.url ?? "", visibility: i.visibility })} onToggle={() => toggle.mutate(i)} tz={tz} currency={currency} />
              ))}
            </>
          )}
        </>
      )}
      <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setForm(blank)}>
        Добавить
      </Button>
      <Sheet
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={form?.id ? meta.label : `Новая запись: ${meta.label.toLowerCase()}`}
        footer={
          <div className="flex gap-2">
            {form?.id && (
              <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={() => remove.mutate(form.id!)}>
                Удалить
              </Button>
            )}
            <Button block loading={save.isPending} disabled={!form?.title.trim()} onClick={() => save.mutate(form!)}>
              Сохранить
            </Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-3">
            <Input label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea label={kind === "journal" ? "Что было хорошего" : "Описание"} rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            {(kind === "idea" || kind === "goal") && <Input label={kind === "idea" ? "Когда (план)" : "Срок"} type="date" value={form.planned_for} onChange={(e) => setForm({ ...form, planned_for: e.target.value })} />}
            {kind === "journal" && <Input label="Дата" type="date" value={form.happened_on} onChange={(e) => setForm({ ...form, happened_on: e.target.value })} />}
            {kind === "wish" && (
              <div className="grid grid-cols-2 gap-3">
                <Input label={`Цена, ${currency}`} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <Input label="Ссылка" inputMode="url" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              </div>
            )}
            {!form.id && <VisibilityPicker value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} />}
            {form.visibility === "private" && <p className="text-xs text-muted">Запись не попадёт партнёру ни в списки, ни в поиск, ни в AI, ни в уведомления.</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function LifeCard({ item, onOpen, onToggle, tz, currency }: { item: LifeItem; onOpen: () => void; onToggle?: () => void; tz: string; currency: string }) {
  const done = item.status === "done";
  return (
    <Card className="flex items-start gap-3">
      {onToggle && (
        <button type="button" role="checkbox" aria-checked={done} aria-label={done ? "Вернуть" : "Отметить выполненным"} onClick={onToggle} className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2", done ? "border-success bg-success text-white" : "border-border")}>
          {done && <Check className="size-4" />}
        </button>
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={cn("flex items-center gap-1.5 font-medium", done && "text-muted line-through")}>
          {item.title} {item.visibility === "private" && <PrivateMark />}
        </p>
        {item.body && <p className="line-clamp-2 text-sm text-muted">{item.body}</p>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {item.planned_for && <Badge>{formatDate(item.planned_for, tz)}</Badge>}
          {item.happened_on && item.kind === "journal" && <Badge>{formatDate(item.happened_on, tz)}</Badge>}
          {item.price && <Badge tone="accent">{formatMoney(item.price, currency, { compact: true })}</Badge>}
          {done && item.done_at && <Badge tone="success">{formatDate(item.done_at, tz)}</Badge>}
        </div>
      </button>
    </Card>
  );
}

function Habits() {
  const { f, familyId } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["habits", familyId], queryFn: () => api<Habit[]>(f("/life/habits")) });
  const [form, setForm] = useState<{ title: string; target: string; visibility: Visibility } | null>(null);
  const set = (data: Habit[]) => qc.setQueryData(["habits", familyId], data);
  const check = useMutation({
    mutationFn: (h: Habit) => api<Habit[]>(f(`/life/habits/${h.id}/${h.checked_today_by_me ? "uncheck" : "checkin"}`), { body: {} }),
    onSuccess: (data) => (haptic("success"), set(data)),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const create = useMutation({
    mutationFn: (v: NonNullable<typeof form>) => api<Habit[]>(f("/life/habits"), { body: { title: v.title.trim(), target_per_week: Number(v.target) || 3, visibility: v.visibility } }),
    onSuccess: (data) => (set(data), setForm(null)),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  return (
    <div className="space-y-3">
      {q.isPending ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Check className="size-6" />} title="Привычек нет" text={KINDS.habit.empty} />
        </Card>
      ) : (
        q.data.map((h) => (
          <Card key={h.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-medium">
                {h.title} {h.visibility === "private" && <PrivateMark />}
              </p>
              <p className="text-sm text-muted">
                На этой неделе: {h.week_count} из {h.target_per_week}
              </p>
              <div className="mt-1.5 flex gap-1">
                {Array.from({ length: h.target_per_week }, (_, i) => (
                  <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < h.week_count ? "bg-accent" : "bg-surface-2")} />
                ))}
              </div>
            </div>
            <Button size="sm" variant={h.checked_today_by_me ? "soft" : "secondary"} loading={check.isPending && check.variables?.id === h.id} onClick={() => check.mutate(h)}>
              {h.checked_today_by_me ? "Сегодня ✓" : "Отметить"}
            </Button>
          </Card>
        ))
      )}
      <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setForm({ title: "", target: "3", visibility: "family" })}>
        Новая привычка
      </Button>
      <Sheet open={form !== null} onOpenChange={(v) => !v && setForm(null)} title="Новая привычка" footer={<Button block loading={create.isPending} disabled={!form?.title.trim()} onClick={() => create.mutate(form!)}>Создать</Button>}>
        {form && (
          <div className="space-y-3">
            <Input label="Привычка" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Вечерняя прогулка" />
            <Input label="Раз в неделю" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/[^1-7]/g, "").slice(0, 1) })} />
            <VisibilityPicker value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
