/*
 * Which page of «Листочек дня» belongs to a date. Pure and deterministic: the same family and
 * the same local date always give the same page (so every member sees one page, and reloads
 * do not change it). Within a year no phrase repeats; seasonal phrases appear only in their
 * season, spread evenly through it; pictures follow the season and never repeat on two
 * consecutive days.
 */
import { ART_BY_SEASON } from "./art-manifest";
import type { Season, ThemeKey } from "./content";

export interface DailyContent {
  PHRASES: Record<ThemeKey, readonly string[]>;
  SEASONAL: Record<Season, readonly string[]>;
  IDEAS: readonly string[];
}

export interface DailyPhrase {
  id: string;
  text: string;
  theme: ThemeKey | Season;
}

export interface DailyPage extends DailyPhrase {
  /** Local date, YYYY-MM-DD. */
  date: string;
  season: Season;
  /** Illustration id: public/daily/<art>.svg */
  art: string;
  idea: string;
}

/** Northern-hemisphere meteorological seasons (Poland, Belarus…). */
export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parse(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Bad date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** 0-based day of the year of a calendar date (no time zones involved). */
export function dayOfYear(date: string): number {
  const { y, m, d } = parse(date);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000);
}

// FNV-1a + mulberry32: tiny, stable across browsers.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface YearPlan {
  phrases: DailyPhrase[];
  arts: string[];
  ideas: string[];
}

const plans = new Map<string, YearPlan>();

function yearPlan(content: DailyContent, seed: string, year: number): YearPlan {
  const key = `${seed}|${year}`;
  const cached = plans.get(key);
  if (cached) return cached;
  const random = rng(hash(key));
  const days = isLeapYear(year) ? 366 : 365;
  const seasonOfDay = Array.from({ length: days }, (_, i) => seasonOf(new Date(Date.UTC(year, 0, 1 + i)).getUTCMonth() + 1));

  // General phrases: shuffle each theme, then take one from each theme in turn, so the
  // same theme does not come twice in a row.
  const themes = shuffled(Object.keys(content.PHRASES) as ThemeKey[], random);
  const lists = themes.map((t) => shuffled(content.PHRASES[t].map((text, i) => ({ id: `${t}-${i + 1}`, text, theme: t })), random));
  const general: DailyPhrase[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) general.push(l[i]!);

  const phrases: (DailyPhrase | undefined)[] = new Array(days);
  const arts: string[] = new Array(days);
  for (const season of ["spring", "summer", "autumn", "winter"] as Season[]) {
    const dayIdx = seasonOfDay.flatMap((s, i) => (s === season ? [i] : []));
    const seasonal = shuffled(content.SEASONAL[season].map((text, i) => ({ id: `${season}-${i + 1}`, text, theme: season })), random);
    seasonal.forEach((phrase, j) => {
      phrases[dayIdx[Math.floor(((j + 0.5) * dayIdx.length) / seasonal.length)]!] = phrase;
    });
    const pool = shuffled(ART_BY_SEASON[season], random);
    dayIdx.forEach((day, j) => (arts[day] = pool[j % pool.length]!));
  }
  let next = 0;
  for (let i = 0; i < days; i++) phrases[i] ??= general[next++ % general.length];
  const ideaPool = shuffled(content.IDEAS, random);
  const plan: YearPlan = { phrases: phrases as DailyPhrase[], arts, ideas: Array.from({ length: days }, (_, i) => ideaPool[i % ideaPool.length]!) };
  plans.set(key, plan);
  return plan;
}

/** The page for a local date (YYYY-MM-DD in the family's time zone) of a family (seed). */
export function pageFor(content: DailyContent, seed: string, date: string): DailyPage {
  const { y, m } = parse(date);
  const plan = yearPlan(content, seed, y);
  const day = dayOfYear(date);
  return { ...plan.phrases[day]!, date, season: seasonOf(m), art: plan.arts[day]!, idea: plan.ideas[day]! };
}

/** All phrases with their ids (for showing saved favourites). */
export function allPhrases(content: DailyContent): Map<string, DailyPhrase> {
  const map = new Map<string, DailyPhrase>();
  for (const [t, list] of Object.entries(content.PHRASES)) list.forEach((text, i) => map.set(`${t}-${i + 1}`, { id: `${t}-${i + 1}`, text, theme: t as ThemeKey }));
  for (const [s, list] of Object.entries(content.SEASONAL)) list.forEach((text, i) => map.set(`${s}-${i + 1}`, { id: `${s}-${i + 1}`, text, theme: s as Season }));
  return map;
}
