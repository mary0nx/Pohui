import { describe, expect, it } from "vitest";

import { formatMoney, plural } from "@/lib/format";
import { addDays, addMonths, weekdayIndex, zonedDate, zonedTime, zonedToIso } from "@/lib/time";

describe("time helpers", () => {
  it("converts wall time to ISO with the right offset on both sides of DST", () => {
    expect(zonedToIso("2026-07-01", "15:00", "Europe/Warsaw")).toBe("2026-07-01T15:00:00+02:00");
    expect(zonedToIso("2026-11-07", "15:00", "Europe/Warsaw")).toBe("2026-11-07T15:00:00+01:00");
    expect(zonedToIso("2026-11-07", "09:30", "America/New_York")).toBe("2026-11-07T09:30:00-05:00");
  });

  it("reads local date and time of an instant", () => {
    expect(zonedDate("2026-10-24T23:30:00Z", "Europe/Warsaw")).toBe("2026-10-25");
    expect(zonedTime("2026-10-24T23:30:00Z", "Europe/Warsaw")).toBe("01:30");
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(weekdayIndex("2026-10-26")).toBe(0); // Monday
  });
});

describe("format helpers", () => {
  it("formats money from decimal strings without float arithmetic on input", () => {
    expect(formatMoney("45.50", "PLN")).toMatch(/45,50\s?zł|45,50\s?PLN/);
    expect(formatMoney("-10", "PLN", { sign: true })).toMatch(/^−/);
    expect(formatMoney("45.5", "PLN", { compact: true })).toMatch(/45,5/);
  });

  it("pluralizes Russian nouns", () => {
    expect(plural(1, "товар", "товара", "товаров")).toBe("товар");
    expect(plural(3, "товар", "товара", "товаров")).toBe("товара");
    expect(plural(11, "товар", "товара", "товаров")).toBe("товаров");
    expect(plural(25, "товар", "товара", "товаров")).toBe("товаров");
  });
});
