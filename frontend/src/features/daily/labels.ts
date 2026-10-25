import type { Season, ThemeKey } from "./content";

/** Kept apart from content.ts so the home screen can show labels without loading the phrases. */
export const THEME_LABELS: Record<ThemeKey | Season, string> = {
  self: "Забота о себе",
  family: "Семья и близость",
  joys: "Маленькие радости",
  rest: "Отдых без вины",
  thanks: "Благодарность",
  home: "Уют и дом",
  support: "Если день трудный",
  steps: "Маленькие шаги",
  kindness: "Доброта",
  nature: "Природа рядом",
  spring: "Весна",
  summer: "Лето",
  autumn: "Осень",
  winter: "Зима",
};
