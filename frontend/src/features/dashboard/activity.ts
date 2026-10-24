const LABELS: Record<string, string> = {
  "transaction.create.app": "добавил(а) операцию",
  "transaction.create.ai": "добавил(а) операцию через ассистента",
  "transaction.create.scheduled": "оплатил(а) регулярный платёж",
  "transaction.update": "изменил(а) операцию",
  "transaction.delete": "удалил(а) операцию",
  "transaction.import": "импортировал(а) операции",
  "scheduled.auto_pay": "автоплатёж записан",
  "scheduled.skip": "пропустил(а) платёж",
  "recurring.create": "добавил(а) регулярный платёж",
  "budget.upsert": "обновил(а) бюджет",
  "goal.create": "создал(а) цель накоплений",
  "goal.contribute": "пополнил(а) накопления",
  "event.create": "добавил(а) событие",
  "event.update": "изменил(а) событие",
  "event.delete": "удалил(а) событие",
  "shopping.item.add": "добавил(а) в покупки",
  "shopping.item.bought": "купил(а)",
  "shopping.list.create": "создал(а) список покупок",
  "task.create": "создал(а) задачу",
  "task.done": "выполнил(а) задачу",
  "task.comment": "прокомментировал(а) задачу",
  "member.join": "присоединился(-ась) к семье",
  "document.create": "добавил(а) документ",
  "pantry.add": "добавил(а) продукт",
  "recipe.create": "добавил(а) рецепт",
};

export function activityLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  if (action.startsWith("life.")) return action.endsWith(".create") ? "добавил(а) запись" : "обновил(а) запись";
  return "внёс(ла) изменение";
}
