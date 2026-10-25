import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ART_BY_SEASON } from "@/features/daily/art-manifest";
import * as content from "@/features/daily/content";
import { allPhrases, dayOfYear, isLeapYear, pageFor, seasonOf } from "@/features/daily/schedule";
import { addDays } from "@/lib/time";

const FAMILY = "8c0f2a49-9d1b-4a83-a6a5-2c1d0b7f3e11";

function year(y: number, seed = FAMILY) {
  const pages = [];
  for (let d = `${y}-01-01`; d.startsWith(String(y)); d = addDays(d, 1)) pages.push(pageFor(content, seed, d));
  return pages;
}

describe("daily leaf collection", () => {
  it("has at least 365 original, unique, short phrases in 10 themes, plus seasonal ones", () => {
    const phrases = [...allPhrases(content).values()];
    expect(phrases.length).toBeGreaterThanOrEqual(365);
    expect(Object.keys(content.PHRASES)).toHaveLength(10);
    expect(new Set(phrases.map((p) => p.text)).size).toBe(phrases.length);
    expect(new Set(phrases.map((p) => p.id)).size).toBe(phrases.length);
    for (const p of phrases) expect(p.text.length).toBeLessThanOrEqual(90);
    for (const s of ["spring", "summer", "autumn", "winter"] as const) expect(content.SEASONAL[s].length).toBeGreaterThanOrEqual(10);
  });

  it("has 40 local illustrations, 10 per season, without scripts", () => {
    const ids = Object.values(ART_BY_SEASON).flat();
    expect(ids).toHaveLength(40);
    for (const [season, list] of Object.entries(ART_BY_SEASON)) {
      expect(list.length).toBe(10);
      for (const id of list) {
        expect(id.startsWith(season)).toBe(true);
        const file = join(__dirname, "../../public/daily", `${id}.svg`);
        expect(existsSync(file)).toBe(true);
        const svg = readFileSync(file, "utf8");
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).not.toMatch(/<script|\son\w+=|href=/i);
        expect(svg.length).toBeLessThan(8000);
      }
    }
  });
});

describe("page of the day", () => {
  it("is the same for every member of a family and on every reload of a day", () => {
    const a = pageFor(content, FAMILY, "2026-10-25");
    const b = pageFor(content, FAMILY, "2026-10-25");
    expect(b).toEqual(a);
    expect(a.date).toBe("2026-10-25");
    expect(a.season).toBe("autumn");
    // The next day brings a new page.
    expect(pageFor(content, FAMILY, "2026-10-26").id).not.toBe(a.id);
  });

  it("never repeats a phrase within a year, also in leap years", () => {
    for (const y of [2026, 2028]) {
      const pages = year(y);
      expect(pages).toHaveLength(isLeapYear(y) ? 366 : 365);
      expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
    }
    expect(pageFor(content, FAMILY, "2028-02-29").date).toBe("2028-02-29");
    expect(dayOfYear("2028-12-31")).toBe(365);
    expect(dayOfYear("2026-12-31")).toBe(364);
  });

  it("keeps seasonal phrases and pictures in their season and varies pictures daily", () => {
    const pages = year(2027);
    for (const p of pages) {
      const month = Number(p.date.slice(5, 7));
      expect(p.season).toBe(seasonOf(month));
      expect(p.art.startsWith(p.season)).toBe(true);
      if (["spring", "summer", "autumn", "winter"].includes(p.theme)) expect(p.theme).toBe(p.season);
    }
    for (let i = 1; i < pages.length; i++) expect(pages[i]!.art).not.toBe(pages[i - 1]!.art);
    // All 56 seasonal phrases appear, spread through their seasons.
    expect(pages.filter((p) => p.theme === p.season).length).toBe(56);
  });

  it("does not show the same theme two days in a row on ordinary days", () => {
    const pages = year(2026).filter((p) => p.theme !== p.season);
    let same = 0;
    for (let i = 1; i < pages.length; i++) if (pages[i]!.theme === pages[i - 1]!.theme) same++;
    expect(same).toBeLessThan(5);
  });

  it("crosses month and year boundaries", () => {
    expect(seasonOf(12)).toBe("winter");
    expect(pageFor(content, FAMILY, "2026-12-31").season).toBe("winter");
    expect(pageFor(content, FAMILY, "2027-01-01").season).toBe("winter");
    expect(pageFor(content, FAMILY, "2027-03-01").season).toBe("spring");
    expect(pageFor(content, FAMILY, "2027-02-28").season).toBe("winter");
  });

  it("gives other families their own order", () => {
    const mine = year(2026).map((p) => p.id);
    const theirs = year(2026, "another-family").map((p) => p.id);
    expect(mine).not.toEqual(theirs);
  });
});
