import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, History, ListPlus, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { api, errorMessage, newIdempotencyKey } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, LoadingBlock, Segmented, Sheet, Textarea, useToast } from "@/components/ui";
import { shortDayLabel, WeekPlanner } from "@/components/WeekPlanner";
import { cn } from "@/lib/cn";
import { formatMoney, formatQty, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/telegram";
import type { HistoryEntry, ShoppingItem, ShoppingListDetail } from "@/types/api";

import { useListDetail, useShoppingInvalidate } from "./api";

export function ShoppingListPage() {
  const { listId } = useParams();
  const { f, currency, familyId, memberName, tz } = useFamily();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "week" ? "week" : "list";
  const [dayAdd, setDayAdd] = useState<{ day: string; text: string } | null>(null);
  const q = useListDetail(listId);
  const qc = useQueryClient();
  const invalidate = useShoppingInvalidate();
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [bulk, setBulk] = useState<string | null>(null);
  const [edit, setEdit] = useState<ShoppingItem | null>(null);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const idem = useRef(newIdempotencyKey());
  const key = ["shopping-list", familyId, listId];

  const add = useMutation({
    mutationFn: (name: string) => api<ShoppingItem[]>(f(`/shopping/lists/${listId}/items/bulk`), { body: { text: name }, idempotencyKey: idem.current }),
    onSuccess: async () => {
      idem.current = newIdempotencyKey();
      setText("");
      haptic("light");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const addBulk = useMutation({
    mutationFn: (t: string) => api<ShoppingItem[]>(f(`/shopping/lists/${listId}/items/bulk`), { body: { text: t }, idempotencyKey: newIdempotencyKey() }),
    onSuccess: async (items) => {
      toast.show(`Добавлено: ${items.length}`);
      setBulk(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const addForDay = useMutation({
    mutationFn: (v: { day: string; text: string }) =>
      api<ShoppingItem[]>(f(`/shopping/lists/${listId}/items/bulk`), { body: { text: v.text, planned_for: v.day }, idempotencyKey: newIdempotencyKey() }),
    onSuccess: async (items, v) => {
      haptic("light");
      toast.show(`${shortDayLabel(v.day)}: добавлено ${items.length}`);
      setDayAdd(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const toggle = useMutation({
    mutationFn: (item: ShoppingItem) => api<ShoppingItem>(f(`/shopping/lists/${listId}/items/${item.id}`), { method: "PATCH", body: { status: item.status === "needed" ? "bought" : "needed" } }),
    onMutate: async (item) => {
      haptic("select");
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ShoppingListDetail>(key);
      if (prev) qc.setQueryData<ShoppingListDetail>(key, { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, status: item.status === "needed" ? "bought" : "needed" } : i)) });
      return { prev };
    },
    onError: (e, _item, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.show(errorMessage(e), "error");
    },
    onSettled: () => invalidate(),
  });
  const saveItem = useMutation({
    mutationFn: (item: ShoppingItem) =>
      api(f(`/shopping/lists/${listId}/items/${item.id}`), {
        method: "PATCH",
        body: {
          name: item.name,
          quantity: item.quantity || null,
          unit: item.unit || null,
          note: item.note || null,
          estimated_price: item.estimated_price || null,
          store: item.store || null,
          category: item.category || null,
          planned_for: item.planned_for || null,
        },
      }),
    onSuccess: async () => {
      setEdit(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const deleteItem = useMutation({
    mutationFn: (item: ShoppingItem) => api(f(`/shopping/lists/${listId}/items/${item.id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setEdit(null);
      await invalidate();
    },
  });
  const clearBought = useMutation({ mutationFn: () => api(f(`/shopping/lists/${listId}/clear-bought`), { method: "POST" }), onSuccess: () => invalidate() });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api(f(`/shopping/lists/${listId}`), { method: "PATCH", body: { archived } }),
    onSuccess: async () => {
      await invalidate();
      setMenu(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(f(`/shopping/lists/${listId}`), { method: "DELETE", query: { confirm: true } }),
    onSuccess: async () => {
      await invalidate();
      navigate("/home/shopping");
    },
  });

  const grouped = useMemo(() => {
    const items = q.data?.items ?? [];
    const needed = items.filter((i) => i.status === "needed");
    const bought = items.filter((i) => i.status === "bought");
    const byCat = new Map<string, ShoppingItem[]>();
    for (const i of needed) byCat.set(i.category ?? "", [...(byCat.get(i.category ?? "") ?? []), i]);
    const byDay = new Map<string, ShoppingItem[]>();
    for (const i of items) if (i.planned_for) byDay.set(i.planned_for, [...(byDay.get(i.planned_for) ?? []), i]);
    return { byCat: [...byCat.entries()], bought, byDay };
  }, [q.data]);

  if (q.isPending) return <LoadingBlock rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={list.name}
        subtitle={`${list.items_needed} нужно купить${Number(list.estimated_total) > 0 ? ` · ≈ ${formatMoney(list.estimated_total, currency, { compact: true })}` : ""}`}
        back="/home/shopping"
        action={
          <IconButton label="Меню списка" onClick={() => setMenu(true)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
        }
      />
      <Segmented
        value={view}
        onChange={(v) => setParams(v === "week" ? { view: "week" } : {}, { replace: true })}
        options={[
          { value: "list", label: "Список" },
          { value: "week", label: "По дням" },
        ]}
      />
      {view === "week" ? (
        <WeekPlanner
          tz={tz}
          addLabel="Добавить покупку"
          onAdd={(day) => (list.archived_at ? toast.show("Список в архиве", "error") : setDayAdd({ day, text: "" }))}
          renderDay={(day) => {
            const items = grouped.byDay.get(day);
            if (!items?.length) return null;
            return (
              <div className="divide-y divide-border">
                {items.map((i) => (
                  <ItemRow key={i.id} item={i} onToggle={() => toggle.mutate(i)} onEdit={() => setEdit(i)} meta={memberName(i.added_by)} showDay={false} />
                ))}
              </div>
            );
          }}
        />
      ) : (
        <>
          {list.archived_at ? (
            <Card className="flex items-center justify-between">
              <span className="text-sm text-muted">Список в архиве</span>
              <Button size="sm" variant="soft" onClick={() => archive.mutate(false)}>
                Восстановить
              </Button>
            </Card>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) add.mutate(text.trim());
              }}
            >
              <Input aria-label="Новый товар" placeholder="Молоко 2 л, хлеб…" value={text} onChange={(e) => setText(e.target.value)} className="flex-1" enterKeyHint="send" />
              <Button type="submit" aria-label="Добавить" className="w-12 px-0" loading={add.isPending} disabled={!text.trim()}>
                <Send className="size-5" />
              </Button>
              <Button type="button" variant="secondary" aria-label="Добавить списком" className="w-12 px-0" onClick={() => setBulk("")}>
                <ListPlus className="size-5" />
              </Button>
            </form>
          )}

          {list.items.length === 0 ? (
            <Card>
              <EmptyState title="Список пуст" text="Введите товары через запятую: «молоко, хлеб, яйца 10 шт»." />
            </Card>
          ) : (
            <>
              {grouped.byCat.map(([cat, items]) => (
                <section key={cat || "none"}>
                  {cat && <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h3>}
                  <Card className="divide-y divide-border p-0">
                    {items.map((i) => (
                      <ItemRow key={i.id} item={i} onToggle={() => toggle.mutate(i)} onEdit={() => setEdit(i)} meta={memberName(i.added_by)} />
                    ))}
                  </Card>
                </section>
              ))}
              {grouped.bought.length > 0 && (
                <section>
                  <div className="mb-1.5 flex items-center justify-between px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Куплено · {grouped.bought.length}</h3>
                    <button type="button" className="text-sm font-medium text-accent" onClick={() => clearBought.mutate()}>
                      Очистить
                    </button>
                  </div>
                  <Card className="divide-y divide-border p-0 opacity-70">
                    {grouped.bought.map((i) => (
                      <ItemRow key={i.id} item={i} onToggle={() => toggle.mutate(i)} onEdit={() => setEdit(i)} meta={i.bought_by ? `купил(а) ${memberName(i.bought_by)}` : ""} />
                    ))}
                  </Card>
                </section>
              )}
            </>
          )}
        </>
      )}

      <Sheet
        open={dayAdd !== null}
        onOpenChange={(v) => !v && setDayAdd(null)}
        title={dayAdd ? `Купить: ${shortDayLabel(dayAdd.day)}` : ""}
        description="Через запятую или с новой строки. Утром в этот день придёт напоминание."
        footer={
          <Button block loading={addForDay.isPending} disabled={!dayAdd?.text.trim()} onClick={() => dayAdd && addForDay.mutate({ day: dayAdd.day, text: dayAdd.text.trim() })}>
            Добавить
          </Button>
        }
      >
        <Textarea
          aria-label="Что купить"
          rows={4}
          placeholder={"Молоко 2 л, хлеб\nЯйца 10 шт"}
          value={dayAdd?.text ?? ""}
          onChange={(e) => dayAdd && setDayAdd({ ...dayAdd, text: e.target.value })}
        />
      </Sheet>

      <Sheet
        open={bulk !== null}
        onOpenChange={(v) => !v && setBulk(null)}
        title="Добавить списком"
        description="Каждый товар с новой строки или через запятую"
        footer={
          <Button block loading={addBulk.isPending} disabled={!bulk?.trim()} onClick={() => addBulk.mutate(bulk!)}>
            Добавить
          </Button>
        }
      >
        <Textarea aria-label="Товары" rows={8} placeholder={"Молоко 2 л\nХлеб\nЯйца 10 шт"} value={bulk ?? ""} onChange={(e) => setBulk(e.target.value)} />
      </Sheet>

      <Sheet
        open={edit !== null}
        onOpenChange={(v) => !v && setEdit(null)}
        title="Товар"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={() => deleteItem.mutate(edit!)}>
              Удалить
            </Button>
            <Button block loading={saveItem.isPending} disabled={!edit?.name.trim()} onClick={() => saveItem.mutate(edit!)}>
              Сохранить
            </Button>
          </div>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Input label="Название" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Количество" inputMode="decimal" value={edit.quantity ?? ""} onChange={(e) => setEdit({ ...edit, quantity: e.target.value.replace(",", ".") })} />
              <Input label="Единица" placeholder="шт, кг, л" value={edit.unit ?? ""} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={`Цена, ${currency}`} inputMode="decimal" value={edit.estimated_price ?? ""} onChange={(e) => setEdit({ ...edit, estimated_price: e.target.value.replace(",", ".") })} />
              <Input label="Магазин" value={edit.store ?? ""} onChange={(e) => setEdit({ ...edit, store: e.target.value })} />
            </div>
            <Input label="Категория" placeholder="Молочное, овощи…" value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            <Input
              label="День покупки"
              type="date"
              hint="Утром в этот день придёт напоминание. Оставьте пустым, если день не важен."
              value={edit.planned_for ?? ""}
              onChange={(e) => setEdit({ ...edit, planned_for: e.target.value || null })}
            />
            <Input label="Комментарий" value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            <p className="text-xs text-muted">Добавил(а): {memberName(edit.added_by)}</p>
          </div>
        )}
      </Sheet>

      <Sheet open={menu} onOpenChange={setMenu} title={list.name}>
        <div className="grid gap-2">
          <Button
            variant="secondary"
            icon={<History className="size-4" />}
            onClick={async () => {
              setHistory(await api<HistoryEntry[]>(f(`/shopping/lists/${listId}/history`)));
              setMenu(false);
            }}
          >
            История изменений
          </Button>
          {!list.archived_at && (
            <Button variant="secondary" icon={<Archive className="size-4" />} onClick={() => archive.mutate(true)}>
              Архивировать
            </Button>
          )}
          <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => (setMenu(false), setConfirmDelete(true))}>
            Удалить список
          </Button>
        </div>
      </Sheet>

      <Sheet open={history !== null} onOpenChange={(v) => !v && setHistory(null)} title="История изменений">
        <ul className="space-y-2.5">
          {(history ?? []).map((h, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium">{h.actor_name ?? "—"}</span> <span className="text-muted">{h.summary}</span>
              <span className="block text-xs text-subtle">{timeAgo(h.created_at)}</span>
            </li>
          ))}
          {history?.length === 0 && <p className="text-sm text-muted">Пока пусто.</p>}
        </ul>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="Удалить список?"
        description={`Список «${list.name}» и ${list.items_total} товаров будут удалены без возможности восстановления. Можно вместо этого архивировать.`}
        confirmLabel="Удалить"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function ItemRow({ item, onToggle, onEdit, meta, showDay = true }: { item: ShoppingItem; onToggle: () => void; onEdit: () => void; meta: string; showDay?: boolean }) {
  const bought = item.status === "bought";
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={bought}
        aria-label={bought ? `Вернуть ${item.name}` : `Купить ${item.name}`}
        onClick={onToggle}
        className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition", bought ? "border-accent bg-accent text-accent-fg" : "border-border")}
      >
        {bought && <Check className="size-4" />}
      </button>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 py-1 text-left">
        <span className={cn("block truncate text-[15px]", bought && "line-through")}>{item.name}</span>
        <span className="block truncate text-xs text-muted">
          {[showDay && item.planned_for && `на ${shortDayLabel(item.planned_for)}`, formatQty(item.quantity, item.unit), item.store, item.note, meta].filter(Boolean).join(" · ")}
        </span>
      </button>
    </div>
  );
}
