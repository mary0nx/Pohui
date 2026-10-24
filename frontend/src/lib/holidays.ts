/**
 * Calendar layers computed on the device (no server data): Polish public holidays (days off),
 * Polish trading Sundays and the great Catholic and Orthodox feasts.
 *
 * Trading Sundays follow the Act on restricting Sunday trade as amended in 2025 (Wigilia became
 * a public holiday and a third December trading Sunday was added): the last Sunday of January,
 * April, June and August, the Sunday before Easter and the three Sundays before 24 December.
 */
import { addDays, weekdayIndex } from "./time";

export type HolidayKind = "public" | "trading" | "catholic" | "orthodox";

export interface Holiday {
  date: string;
  name: string;
  kind: HolidayKind;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function catholicEaster(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** Orthodox Easter Sunday as a Gregorian date (Julian computus + 13 days, valid 1900–2099). */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(ymd(year, month, day), 13);
}

function lastSunday(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = ymd(year, month, lastDay);
  return addDays(last, -((weekdayIndex(last) + 1) % 7));
}

export function polishPublicHolidays(year: number): Holiday[] {
  const easter = catholicEaster(year);
  const list: [string, string][] = [
    [ymd(year, 1, 1), "Новый год (Nowy Rok)"],
    [ymd(year, 1, 6), "Богоявление (Trzech Króli)"],
    [easter, "Пасха (Wielkanoc)"],
    [addDays(easter, 1), "Пасхальный понедельник (Poniedziałek Wielkanocny)"],
    [ymd(year, 5, 1), "Праздник труда (Święto Pracy)"],
    [ymd(year, 5, 3), "День Конституции 3 мая"],
    [addDays(easter, 49), "Троица (Zielone Świątki)"],
    [addDays(easter, 60), "Божье Тело (Boże Ciało)"],
    [ymd(year, 8, 15), "Успение Богородицы (Wniebowzięcie NMP)"],
    [ymd(year, 11, 1), "День всех святых (Wszystkich Świętych)"],
    [ymd(year, 11, 11), "День независимости (Święto Niepodległości)"],
    [ymd(year, 12, 25), "Рождество (Boże Narodzenie)"],
    [ymd(year, 12, 26), "Второй день Рождества"],
  ];
  // 24 December is a statutory day off from 2025.
  if (year >= 2025) list.push([ymd(year, 12, 24), "Сочельник (Wigilia)"]);
  return list.map(([date, name]) => ({ date, name, kind: "public" as const }));
}

export function polishTradingSundays(year: number): Holiday[] {
  const easter = catholicEaster(year);
  const sundays = [lastSunday(year, 1), addDays(easter, -7), lastSunday(year, 4), lastSunday(year, 6), lastSunday(year, 8)];
  let advent = addDays(ymd(year, 12, 23), -((weekdayIndex(ymd(year, 12, 23)) + 1) % 7));
  const december: string[] = [];
  for (let i = 0; i < (year >= 2025 ? 3 : 2); i++) {
    december.unshift(advent);
    advent = addDays(advent, -7);
  }
  // Trade stays closed if such a Sunday is a public holiday (e.g. Easter on the last April Sunday).
  const closed = new Set(polishPublicHolidays(year).map((h) => h.date));
  return [...sundays, ...december].filter((d) => !closed.has(d)).map((date) => ({ date, name: "Торговое воскресенье", kind: "trading" as const }));
}

/** Great Catholic feasts that are not already Polish public holidays. */
export function catholicFeasts(year: number): Holiday[] {
  const easter = catholicEaster(year);
  const list: [string, string][] = [
    [ymd(year, 2, 2), "Сретение (Matki Bożej Gromnicznej)"],
    [addDays(easter, -46), "Пепельная среда (Popielec)"],
    [ymd(year, 3, 25), "Благовещение (Zwiastowanie Pańskie)"],
    [addDays(easter, -7), "Вербное воскресенье (Niedziela Palmowa)"],
    [addDays(easter, -3), "Великий четверг (Wielki Czwartek)"],
    [addDays(easter, -2), "Страстная пятница (Wielki Piątek)"],
    [addDays(easter, -1), "Великая суббота (Wielka Sobota)"],
    [addDays(easter, 42), "Вознесение (Wniebowstąpienie)"],
    [ymd(year, 11, 2), "День поминовения (Zaduszki)"],
    [ymd(year, 12, 8), "Непорочное зачатие (Niepokalane Poczęcie)"],
  ];
  return list.map(([date, name]) => ({ date, name, kind: "catholic" as const }));
}

/** Pascha, the twelve great feasts and the other great feasts of the Orthodox calendar. */
export function orthodoxFeasts(year: number): Holiday[] {
  const pascha = orthodoxEaster(year);
  const list: [string, string][] = [
    [ymd(year, 1, 7), "Рождество Христово (правосл.)"],
    [ymd(year, 1, 14), "Обрезание Господне (правосл.)"],
    [ymd(year, 1, 19), "Крещение Господне (правосл.)"],
    [ymd(year, 2, 15), "Сретение Господне (правосл.)"],
    [ymd(year, 4, 7), "Благовещение (правосл.)"],
    [addDays(pascha, -7), "Вход Господень в Иерусалим (правосл.)"],
    [pascha, "Пасха (правосл.)"],
    [addDays(pascha, 39), "Вознесение Господне (правосл.)"],
    [addDays(pascha, 49), "Троица (правосл.)"],
    [ymd(year, 7, 7), "Рождество Иоанна Предтечи (правосл.)"],
    [ymd(year, 7, 12), "Петра и Павла (правосл.)"],
    [ymd(year, 8, 19), "Преображение Господне (правосл.)"],
    [ymd(year, 8, 28), "Успение Богородицы (правосл.)"],
    [ymd(year, 9, 11), "Усекновение главы Иоанна Предтечи (правосл.)"],
    [ymd(year, 9, 21), "Рождество Богородицы (правосл.)"],
    [ymd(year, 9, 27), "Воздвижение Креста (правосл.)"],
    [ymd(year, 10, 14), "Покров Богородицы (правосл.)"],
    [ymd(year, 12, 4), "Введение во храм (правосл.)"],
  ];
  return list.map(([date, name]) => ({ date, name, kind: "orthodox" as const }));
}

const BUILDERS: Record<HolidayKind, (year: number) => Holiday[]> = {
  public: polishPublicHolidays,
  trading: polishTradingSundays,
  catholic: catholicFeasts,
  orthodox: orthodoxFeasts,
};

/** Holidays of the enabled kinds within [from, to] (YYYY-MM-DD), grouped by date. */
export function holidaysBetween(from: string, to: string, kinds: HolidayKind[]): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>();
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const kind of kinds) {
      for (const h of BUILDERS[kind](year)) {
        if (h.date >= from && h.date <= to) map.set(h.date, [...(map.get(h.date) ?? []), h]);
      }
    }
  }
  return map;
}
