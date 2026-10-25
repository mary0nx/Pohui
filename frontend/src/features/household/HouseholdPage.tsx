import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Art, type ArtName } from "@/components/illustrations/Art";
import { Card, type CardTone } from "@/components/ui";
import type { ShoppingList, TaskStats } from "@/types/api";

export function HouseholdPage() {
  const { f, familyId } = useFamily();
  const lists = useQuery({ queryKey: ["shopping-lists", familyId, false], queryFn: () => api<ShoppingList[]>(f("/shopping/lists")) });
  const stats = useQuery({ queryKey: ["task-stats", familyId], queryFn: () => api<TaskStats>(f("/tasks/stats")) });
  const needed = (lists.data ?? []).reduce((s, l) => s + l.items_needed, 0);
  // Each part of the home has its own tint and picture; the layout stays the same.
  const tiles: { to: string; art: ArtName; tone: Exclude<CardTone, "plain">; title: string; text: string }[] = [
    { to: "/home/shopping", art: "basket", tone: "mint", title: "Покупки", text: lists.data ? `${needed} нужно купить` : "Списки покупок" },
    { to: "/home/tasks", art: "checklist", tone: "lemon", title: "Задачи", text: stats.data ? `${stats.data.open_total} открыто` : "Домашние дела" },
    { to: "/home/kitchen", art: "pot", tone: "peach", title: "Кухня", text: "Продукты, рецепты, меню" },
    { to: "/home/documents", art: "docs", tone: "lavender", title: "Документы", text: "Сроки и файлы" },
    { to: "/home/life", art: "mugs", tone: "sage", title: "Вместе", text: "Цели, идеи, привычки" },
  ];
  return (
    <div>
      <PageHeader title="Покупки и дом" art="house" />
      <div className="stagger grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="rounded-card">
            <Card tone={t.tone} interactive className="h-full">
              <Art name={t.art} className="-ml-1 h-[58px] w-[70px]" />
              <p className="mt-2 text-base font-extrabold text-heading">{t.title}</p>
              <p className="text-sm text-muted">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
