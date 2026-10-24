import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Minus, Plus, ShoppingCart, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useAiEnabled, useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, LoadingBlock, Segmented, Select, Sheet, Textarea, useToast } from "@/components/ui";
import { formatDate, formatQty } from "@/lib/format";
import { addDays, todayIn, weekdayIndex } from "@/lib/time";
import type { Ingredient, MealEntry, MealType, PantryItem, Recipe, Visibility } from "@/types/api";

type Tab = "pantry" | "recipes" | "menu";

function useKitchenInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all(["pantry", "recipes", "meal-plan", "shopping-lists", "shopping-list", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function KitchenPage() {
  const [tab, setTab] = useState<Tab>("menu");
  return (
    <div className="space-y-4">
      <PageHeader title="Кухня" back="/home" />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "menu", label: "Меню" },
          { value: "pantry", label: "Продукты" },
          { value: "recipes", label: "Рецепты" },
        ]}
      />
      {tab === "pantry" && <PantryTab />}
      {tab === "recipes" && <RecipesTab />}
      {tab === "menu" && <MenuTab />}
    </div>
  );
}

function PantryTab() {
  const { f, familyId, tz } = useFamily();
  const toast = useToast();
  const invalidate = useKitchenInvalidate();
  const q = useQuery({ queryKey: ["pantry", familyId], queryFn: () => api<PantryItem[]>(f("/kitchen/pantry")) });
  const [form, setForm] = useState<{ id?: string; name: string; quantity: string; unit: string; expires_on: string } | null>(null);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof form>) => {
      const body = { name: v.name.trim(), quantity: v.quantity ? v.quantity.replace(",", ".") : null, unit: v.unit || null, expires_on: v.expires_on || null };
      return v.id ? api(f(`/kitchen/pantry/${v.id}`), { method: "PATCH", body }) : api(f("/kitchen/pantry"), { body });
    },
    onSuccess: async () => {
      setForm(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const adjust = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: string }) => api(f(`/kitchen/pantry/${id}/adjust`), { body: { delta } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(f(`/kitchen/pantry/${id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setForm(null);
      await invalidate();
    },
  });

  return (
    <div className="space-y-3">
      {q.isPending ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<UtensilsCrossed className="size-6" />} title="Запасы не заполнены" text="Добавьте продукты, которые есть дома, — меню и список покупок учтут их." />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {q.data.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => setForm({ id: p.id, name: p.name, quantity: p.quantity ?? "", unit: p.unit ?? "", expires_on: p.expires_on ?? "" })}>
                <span className="block truncate text-[15px]">{p.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {formatQty(p.quantity, p.unit) || "количество не указано"}
                  {p.expires_on && <span className={p.expired ? "text-danger" : p.expiring_soon ? "text-warning" : ""}>· до {formatDate(p.expires_on, tz, { day: "numeric", month: "short" })}</span>}
                </span>
              </button>
              {p.expired && <Badge tone="danger">просрочен</Badge>}
              {p.quantity !== null && (
                <div className="flex items-center">
                  <IconButton label={`Уменьшить ${p.name}`} disabled={Number(p.quantity) <= 0} onClick={() => adjust.mutate({ id: p.id, delta: "-1" })}>
                    <Minus className="size-4" />
                  </IconButton>
                  <IconButton label={`Увеличить ${p.name}`} onClick={() => adjust.mutate({ id: p.id, delta: "1" })}>
                    <Plus className="size-4" />
                  </IconButton>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setForm({ name: "", quantity: "", unit: "шт", expires_on: "" })}>
        Добавить продукт
      </Button>
      <Sheet
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={form?.id ? "Продукт" : "Новый продукт"}
        footer={
          <div className="flex gap-2">
            {form?.id && (
              <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={() => remove.mutate(form.id!)}>
                Удалить
              </Button>
            )}
            <Button block loading={save.isPending} disabled={!form?.name.trim()} onClick={() => save.mutate(form!)}>
              Сохранить
            </Button>
          </div>
        }
      >
        {form && (
          <div className="space-y-3">
            <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Количество" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              <Input label="Единица" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="шт, кг, л" />
            </div>
            <Input label="Годен до" type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

interface RecipeForm {
  id?: string;
  title: string;
  servings: string;
  prep_minutes: string;
  instructions: string;
  ingredients: Ingredient[];
  visibility: Visibility;
}

function RecipesTab() {
  const { f, familyId } = useFamily();
  const aiEnabled = useAiEnabled();
  const toast = useToast();
  const invalidate = useKitchenInvalidate();
  const q = useQuery({ queryKey: ["recipes", familyId], queryFn: () => api<Recipe[]>(f("/kitchen/recipes")) });
  const [form, setForm] = useState<RecipeForm | null>(null);

  const save = useMutation({
    mutationFn: (v: RecipeForm) => {
      const body = {
        title: v.title.trim(),
        servings: Number(v.servings) || 2,
        prep_minutes: v.prep_minutes ? Number(v.prep_minutes) : null,
        instructions: v.instructions || null,
        ingredients: v.ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), quantity: i.quantity ? i.quantity.replace(",", ".") : null, unit: i.unit || null })),
      };
      return v.id ? api(f(`/kitchen/recipes/${v.id}`), { method: "PATCH", body }) : api(f("/kitchen/recipes"), { body: { ...body, visibility: v.visibility } });
    },
    onSuccess: async () => {
      setForm(null);
      toast.show("Рецепт сохранён");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(f(`/kitchen/recipes/${id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setForm(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const blank: RecipeForm = { title: "", servings: "2", prep_minutes: "", instructions: "", ingredients: [{ name: "", quantity: "", unit: "" }], visibility: "family" };
  return (
    <div className="space-y-3">
      {q.isPending ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card>
          <EmptyState icon={<ChefHat className="size-6" />} title="Рецептов пока нет" text={aiEnabled ? "Сохраните любимые блюда или попросите ассистента предложить меню." : "Сохраните любимые блюда, чтобы быстро собирать меню и покупки."} />
        </Card>
      ) : (
        q.data.map((r) => (
          <Card key={r.id} className="cursor-pointer" onClick={() => setForm({ id: r.id, title: r.title, servings: String(r.servings), prep_minutes: r.prep_minutes ? String(r.prep_minutes) : "", instructions: r.instructions ?? "", ingredients: r.ingredients.length ? r.ingredients : blank.ingredients, visibility: r.visibility })}>
            <p className="flex items-center gap-1.5 font-semibold">
              {r.title} {r.visibility === "private" && <PrivateMark />} {r.source === "ai" && <Badge tone="accent">AI</Badge>}
            </p>
            <p className="text-sm text-muted">
              {r.servings} порц.{r.prep_minutes ? ` · ${r.prep_minutes} мин` : ""} · {r.ingredients.length} ингредиентов
            </p>
          </Card>
        ))
      )}
      <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setForm(blank)}>
        Новый рецепт
      </Button>
      <Sheet
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={form?.id ? "Рецепт" : "Новый рецепт"}
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
            <div className="grid grid-cols-2 gap-3">
              <Input label="Порций" inputMode="numeric" value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value.replace(/\D/g, "") })} />
              <Input label="Время, мин" inputMode="numeric" value={form.prep_minutes} onChange={(e) => setForm({ ...form, prep_minutes: e.target.value.replace(/\D/g, "") })} />
            </div>
            <p className="px-1 text-sm font-medium text-muted">Ингредиенты</p>
            {form.ingredients.map((ing, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_56px_auto] gap-1.5">
                <Input aria-label="Ингредиент" placeholder="Мука" value={ing.name} onChange={(e) => setForm({ ...form, ingredients: form.ingredients.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input aria-label="Количество" inputMode="decimal" placeholder="200" value={ing.quantity ?? ""} onChange={(e) => setForm({ ...form, ingredients: form.ingredients.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} />
                <Input aria-label="Ед." placeholder="г" value={ing.unit ?? ""} onChange={(e) => setForm({ ...form, ingredients: form.ingredients.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
                <IconButton label="Удалить ингредиент" onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { name: "", quantity: "", unit: "" }] })}>
              Ингредиент
            </Button>
            <Textarea label="Приготовление" rows={4} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            {!form.id && <VisibilityPicker value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} />}
          </div>
        )}
      </Sheet>
    </div>
  );
}

const MEALS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Завтрак" },
  { value: "lunch", label: "Обед" },
  { value: "dinner", label: "Ужин" },
];

function MenuTab() {
  const { f, familyId, tz } = useFamily();
  const toast = useToast();
  const invalidate = useKitchenInvalidate();
  const today = todayIn(tz);
  const weekStart = addDays(today, -weekdayIndex(today));
  const [offset, setOffset] = useState(0);
  const from = addDays(weekStart, offset * 7);
  const to = addDays(from, 6);
  const plan = useQuery({ queryKey: ["meal-plan", familyId, from], queryFn: () => api<MealEntry[]>(f("/kitchen/meal-plan"), { query: { date_from: from, date_to: to } }) });
  const recipes = useQuery({ queryKey: ["recipes", familyId], queryFn: () => api<Recipe[]>(f("/kitchen/recipes")) });
  const [slot, setSlot] = useState<{ day: string; meal_type: MealType; title: string; recipe_id: string; servings: string; id?: string } | null>(null);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof slot>) => api(f("/kitchen/meal-plan"), { method: "PUT", body: { day: v.day, meal_type: v.meal_type, title: v.title || null, recipe_id: v.recipe_id || null, servings: Number(v.servings) || 2 } }),
    onSuccess: async () => {
      setSlot(null);
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(f(`/kitchen/meal-plan/${id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setSlot(null);
      await invalidate();
    },
  });
  const toShopping = useMutation({
    mutationFn: () => api<{ added: string[]; covered_by_pantry: string[] }>(f("/kitchen/meal-plan/shopping-list"), { body: { date_from: from, date_to: to } }),
    onSuccess: async (r) => {
      toast.show(r.added.length ? `В покупки добавлено: ${r.added.length}${r.covered_by_pantry.length ? `, есть дома: ${r.covered_by_pantry.length}` : ""}` : "Всё нужное уже есть дома");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setOffset(offset - 1)}>
          ← Неделя
        </Button>
        <span className="text-sm font-semibold">
          {formatDate(from, tz, { day: "numeric", month: "short" })} – {formatDate(to, tz, { day: "numeric", month: "short" })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOffset(offset + 1)}>
          Неделя →
        </Button>
      </div>
      {plan.isPending ? (
        <LoadingBlock rows={4} />
      ) : plan.isError ? (
        <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
      ) : (
        days.map((day) => (
          <Card key={day} className={day === today ? "border-accent/50" : ""}>
            <p className="mb-2 text-sm font-semibold">{formatDate(day, tz, { weekday: "long", day: "numeric", month: "short" })}</p>
            <div className="grid grid-cols-3 gap-2">
              {MEALS.map((m) => {
                const entry = plan.data.find((e) => e.day === day && e.meal_type === m.value);
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSlot({ day, meal_type: m.value, title: entry?.title ?? "", recipe_id: entry?.recipe_id ?? "", servings: String(entry?.servings ?? 2), id: entry?.id })}
                    className={`min-h-16 rounded-2xl p-2 text-left text-xs transition ${entry ? "bg-accent-soft text-accent-strong" : "border border-dashed border-border text-subtle"}`}
                  >
                    <span className="block text-[11px] uppercase opacity-70">{m.label}</span>
                    <span className="line-clamp-2 text-[13px] font-medium">{entry?.title ?? "+"}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        ))
      )}
      <Button block icon={<ShoppingCart className="size-4" />} loading={toShopping.isPending} onClick={() => toShopping.mutate()}>
        Ингредиенты недели в покупки
      </Button>
      <p className="px-1 text-xs text-muted">Учитываются рецепты с ингредиентами и продукты дома. Запасы при этом не списываются.</p>
      <Sheet
        open={slot !== null}
        onOpenChange={(v) => !v && setSlot(null)}
        title={slot ? `${MEALS.find((m) => m.value === slot.meal_type)?.label}, ${formatDate(slot.day, tz, { day: "numeric", month: "short" })}` : ""}
        footer={
          <div className="flex gap-2">
            {slot?.id && (
              <Button variant="secondary" onClick={() => remove.mutate(slot.id!)}>
                Очистить
              </Button>
            )}
            <Button block loading={save.isPending} disabled={!slot?.title.trim() && !slot?.recipe_id} onClick={() => save.mutate(slot!)}>
              Сохранить
            </Button>
          </div>
        }
      >
        {slot && (
          <div className="space-y-3">
            <Select label="Рецепт" value={slot.recipe_id} onChange={(e) => setSlot({ ...slot, recipe_id: e.target.value, title: recipes.data?.find((r) => r.id === e.target.value)?.title ?? slot.title })}>
              <option value="">Без рецепта</option>
              {(recipes.data ?? []).filter((r) => r.visibility === "family").map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </Select>
            <Input label="Блюдо" value={slot.title} onChange={(e) => setSlot({ ...slot, title: e.target.value })} placeholder="Например, суп" />
            <Input label="Порций" inputMode="numeric" value={slot.servings} onChange={(e) => setSlot({ ...slot, servings: e.target.value.replace(/\D/g, "") })} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
