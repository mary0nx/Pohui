import { useQuery } from "@tanstack/react-query";
import { ChefHat, FileText, Heart, ListChecks, ShoppingCart } from "lucide-react";
import { Link } from "react-router";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui";
import type { ShoppingList, TaskStats } from "@/types/api";

export function HouseholdPage() {
  const { f, familyId } = useFamily();
  const lists = useQuery({ queryKey: ["shopping-lists", familyId, false], queryFn: () => api<ShoppingList[]>(f("/shopping/lists")) });
  const stats = useQuery({ queryKey: ["task-stats", familyId], queryFn: () => api<TaskStats>(f("/tasks/stats")) });
  const needed = (lists.data ?? []).reduce((s, l) => s + l.items_needed, 0);
  const tiles = [
    { to: "/home/shopping", icon: ShoppingCart, title: "Покупки", text: lists.data ? `${needed} нужно купить` : "Списки покупок" },
    { to: "/home/tasks", icon: ListChecks, title: "Задачи", text: stats.data ? `${stats.data.open_total} открыто` : "Домашние дела" },
    { to: "/home/kitchen", icon: ChefHat, title: "Кухня", text: "Продукты, рецепты, меню" },
    { to: "/home/documents", icon: FileText, title: "Документы", text: "Сроки и файлы" },
    { to: "/home/life", icon: Heart, title: "Вместе", text: "Цели, идеи, привычки" },
  ];
  return (
    <div>
      <PageHeader title="Покупки и дом" />
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to}>
            <Card className="h-full transition active:scale-[0.98]">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <t.icon className="size-5" />
              </span>
              <p className="mt-3 font-semibold">{t.title}</p>
              <p className="text-sm text-muted">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
