import { useQuery } from "@tanstack/react-query";
import { ChefHat, FileText, Heart, ListChecks, ShoppingCart } from "lucide-react";
import { Link } from "react-router";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, IconBadge, type CardTone } from "@/components/ui";
import type { ShoppingList, TaskStats } from "@/types/api";

export function HouseholdPage() {
  const { f, familyId } = useFamily();
  const lists = useQuery({ queryKey: ["shopping-lists", familyId, false], queryFn: () => api<ShoppingList[]>(f("/shopping/lists")) });
  const stats = useQuery({ queryKey: ["task-stats", familyId], queryFn: () => api<TaskStats>(f("/tasks/stats")) });
  const needed = (lists.data ?? []).reduce((s, l) => s + l.items_needed, 0);
  const tiles: { to: string; icon: typeof ShoppingCart; tone: Exclude<CardTone, "plain">; title: string; text: string }[] = [
    { to: "/home/shopping", icon: ShoppingCart, tone: "mint", title: "Покупки", text: lists.data ? `${needed} нужно купить` : "Списки покупок" },
    { to: "/home/tasks", icon: ListChecks, tone: "lemon", title: "Задачи", text: stats.data ? `${stats.data.open_total} открыто` : "Домашние дела" },
    { to: "/home/kitchen", icon: ChefHat, tone: "coral", title: "Кухня", text: "Продукты, рецепты, меню" },
    { to: "/home/documents", icon: FileText, tone: "lavender", title: "Документы", text: "Сроки и файлы" },
    { to: "/home/life", icon: Heart, tone: "forest", title: "Вместе", text: "Цели, идеи, привычки" },
  ];
  return (
    <div>
      <PageHeader title="Покупки и дом" />
      <div className="stagger grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="rounded-card">
            <Card tone={t.tone} interactive className="h-full">
              <IconBadge tone={t.tone}>
                <t.icon className="size-5" />
              </IconBadge>
              <p className="mt-3 text-base font-extrabold">{t.title}</p>
              <p className="text-sm text-muted">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
