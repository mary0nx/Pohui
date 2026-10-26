/*
 * «Листочек дня» as a home-screen / lock-screen widget on iPhone.
 *
 * iOS widgets need a native app, so the widget runs in Scriptable (a free App Store app that
 * shows JavaScript widgets). The app generates the widget script with the family's pages for
 * the next WIDGET_DAYS days already inside, computed by the same schedule as the card on the
 * home screen: the widget shows exactly the app's page, works offline and needs no key,
 * password or server request. Phrases are public content; nothing private goes into it.
 */
import { addDays } from "@/lib/time";

import type { Season } from "./content";
import { THEME_LABELS } from "./labels";
import { pageFor, type DailyContent } from "./schedule";

export const WIDGET_DAYS = 400;
export const SCRIPTABLE_APP_STORE = "https://apps.apple.com/app/scriptable/id1405459188";

const SEASON_CODE: Record<Season, string> = { spring: "p", summer: "s", autumn: "a", winter: "w" };

/** date → [season code, theme label, phrase] */
export function widgetPages(content: DailyContent, seed: string, from: string, days = WIDGET_DAYS): Record<string, [string, string, string]> {
  const out: Record<string, [string, string, string]> = {};
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const page = pageFor(content, seed, date);
    out[date] = [SEASON_CODE[page.season], THEME_LABELS[page.theme], page.text];
  }
  return out;
}

export function buildWidgetScript(opts: { content: DailyContent; seed: string; from: string; timeZone: string; appUrl: string; days?: number }): string {
  const pages = widgetPages(opts.content, opts.seed, opts.from, opts.days);
  const last = addDays(opts.from, (opts.days ?? WIDGET_DAYS) - 1);
  // JSON is valid JavaScript, so every value below is a safe literal.
  const lit = (v: unknown) => JSON.stringify(v);
  return `// Family OS — «Листочек дня». Виджет для приложения Scriptable.
// Создан ${opts.from}, страницы до ${last}. Потом скопируйте новый скрипт: Family OS → «Профиль» → «Виджет».
// Внутри только фразы дня: ни ключей, ни личных данных.
const APP = ${lit(opts.appUrl)};
const TZ = ${lit(opts.timeZone)};
const LAST = ${lit(last)};
const PAGES = ${lit(pages)};
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const LOOK = {
  p: { bg: ["#eef8f2", "#1f3a2f"], ink: ["#2e6b55", "#a9dfc6"], emoji: "🌱" },
  s: { bg: ["#fdf6d8", "#37321c"], ink: ["#7a5a00", "#f3dc85"], emoji: "☀️" },
  a: { bg: ["#fff2ec", "#3a2a25"], ink: ["#a8402f", "#ffb9a5"], emoji: "🍂" },
  w: { bg: ["#f5f1fe", "#2b2843"], ink: ["#5b45b0", "#cdbff7"], emoji: "❄️" },
};
const TEXT = Color.dynamic(new Color("#1f3b33"), new Color("#f1efe9"));

function today() {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (e) {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
}

const date = today();
const page = PAGES[date];
const size = config.widgetFamily || "medium";
const w = new ListWidget();
w.url = APP;
const tomorrow = new Date();
tomorrow.setHours(24, 0, 30, 0);
w.refreshAfterDate = tomorrow;

if (!page) {
  w.addText("Листочки в виджете закончились (" + LAST + ").").font = Font.mediumSystemFont(13);
  w.addSpacer(4);
  w.addText("Family OS → «Профиль» → «Виджет» → скопируйте новый скрипт.").font = Font.systemFont(11);
} else if (size.startsWith("accessory")) {
  // Lock screen: the system tints it, only the words matter.
  const t = w.addText(page[2]);
  t.font = Font.mediumSystemFont(12);
  t.minimumScaleFactor = 0.6;
} else {
  const look = LOOK[page[0]];
  const ink = Color.dynamic(new Color(look.ink[0]), new Color(look.ink[1]));
  w.backgroundColor = Color.dynamic(new Color(look.bg[0]), new Color(look.bg[1]));
  w.setPadding(14, 14, 12, 14);
  const [y, m, d] = date.split("-").map(Number);
  const head = w.addStack();
  head.centerAlignContent();
  const day = head.addText(String(d));
  day.font = Font.heavyRoundedSystemFont(size === "small" ? 22 : 26);
  day.textColor = ink;
  head.addSpacer(6);
  const sub = head.addStack();
  sub.layoutVertically();
  const month = sub.addText(MONTHS[m - 1]);
  month.font = Font.semiboldRoundedSystemFont(11);
  month.textColor = ink;
  const theme = sub.addText(look.emoji + " " + page[1]);
  theme.font = Font.mediumRoundedSystemFont(10);
  theme.textColor = ink;
  theme.lineLimit = 1;
  w.addSpacer(size === "small" ? 6 : 10);
  const t = w.addText(page[2]);
  t.font = Font.semiboldRoundedSystemFont(size === "large" ? 22 : size === "small" ? 13 : 16);
  t.textColor = TEXT;
  t.minimumScaleFactor = 0.55;
  w.addSpacer();
  const foot = w.addText("Family OS · Листочек дня");
  foot.font = Font.mediumRoundedSystemFont(9);
  foot.textColor = ink;
  foot.textOpacity = 0.75;
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
