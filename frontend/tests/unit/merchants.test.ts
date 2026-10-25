import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_LOGOS } from "@/features/finance/merchants/brandLogos";
import { BRANDS } from "@/features/finance/merchants/catalog";
import { matchMerchant, merchantTitle, normalizeMerchantText, transactionIcon, type TxLike } from "@/features/finance/merchants/registry";

const PUBLIC = join(__dirname, "../../public");
const GROCERIES = { name: "Продукты", icon: "shopping-basket" };
const id = (text: string, field?: "merchant" | "description") => matchMerchant(text, { field })?.brand.id ?? null;
const icon = (tx: Partial<TxLike>) => transactionIcon({ kind: "expense", ...tx });
const src = (tx: Partial<TxLike>) => icon(tx).src.replace(/^.*\/assets\//, "");

describe("merchant catalogue and assets", () => {
  it("has at least 144 brands with unique, file-safe ids", () => {
    expect(BRANDS.length).toBeGreaterThanOrEqual(144);
    const ids = BRANDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BRANDS) {
      expect(b.id).toMatch(/^[a-z0-9_]+$/);
      expect(b.aliases.length).toBeGreaterThan(0);
    }
  });

  it("lists exactly the logo files that exist, and every logo belongs to a brand", () => {
    const files = readdirSync(join(PUBLIC, "assets/brands")).filter((f) => f.endsWith(".svg")).map((f) => f.replace(".svg", ""));
    expect(new Set(files)).toEqual(new Set(BRAND_LOGOS));
    const ids = new Set(BRANDS.map((b) => b.id));
    for (const f of files) {
      expect(ids.has(f)).toBe(true);
      const svg = readFileSync(join(PUBLIC, "assets/brands", `${f}.svg`), "utf8");
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 64 64"/);
      expect(svg).not.toMatch(/<script|<foreignObject|<image|\son\w+=|href="(?!#)/i); // only links inside the file
    }
  });

  it("has every category illustration", () => {
    for (const a of ["grocery-basket", "store", "food", "transport", "fuel", "electronics", "health", "delivery", "transfer", "topup", "bank-fee", "cash", "bills"]) {
      expect(existsSync(join(PUBLIC, "assets/categories", `${a}.svg`))).toBe(true);
    }
  });
});

describe("recognising the shop", () => {
  it.each([
    ["LIDL POLSKA 1234", "lidl"], // 1
    ["BIEDRONKA 1234", "biedronka"], // 2
    ["ŻABKA N123", "zabka"], // 3
    ["Allegro.pl", "allegro"], // 4
    ["MPK SP. Z O.O.", "mpk"], // 5
    ["RTV EURO AGD", "rtv_euro_agd"],
    ["MCDONALDS 0442 WROCLAW", "mcdonalds"],
    ["ORLEN STACJA 123", "orlen"],
    ["x-kom sp. z o.o.", "xkom"],
    ["H&M HENNES 0123", "hm"],
    ["PAYPAL *ALIEXPRESS", "aliexpress"],
  ])("%s → %s", (text, brand) => {
    expect(id(text)).toBe(brand);
  });

  it("finds every brand of the catalogue by its own name", () => {
    const wrong = BRANDS.filter((b) => id(b.name) !== b.id).map((b) => `${b.name} → ${id(b.name)}`);
    expect(wrong).toEqual([]);
  });

  it("6: prefers Uber Eats over Uber, Google Play over Google", () => {
    expect(id("UBER EATS")).toBe("uber_eats");
    expect(id("UBER *TRIP")).toBe("uber");
    expect(id("GOOGLE *PLAY")).toBe("google_play");
    expect(id("Google Play Store")).toBe("google_play");
  });

  it("16: ignores case, Polish letters and extra spaces", () => {
    expect(normalizeMerchantText("  ŻaBkA   Polska  Sp. z o.o. ")).toBe("zabka polska sp z o o");
    expect(id("  zabka   polska ")).toBe("zabka");
    expect(id("INTERMARCHÉ")).toBe("intermarche");
    expect(id("społem psś")).toBe("spolem");
  });

  it("17: long names and terminal ids", () => {
    expect(id("POS 4821 KARTA *1234 BIEDRONKA NR 3412 UL. LEGNICKA 58 WROCLAW PL 2026-10-25")).toBe("biedronka");
    expect(id("STARBUCKS COFFEE POLAND SP Z O O GALERIA DOMINIKANSKA 52-012 WROCLAW")).toBe("starbucks");
  });

  it("does not mistake ordinary words for brands", () => {
    // temu = "ago", netto = net amount, groszek = peas, lot = flight, play/plus are plain words.
    expect(id("Zakupy 2 dni temu", "description")).toBeNull();
    expect(id("Faktura kwota netto 100", "description")).toBeNull();
    expect(id("groszek konserwowy", "description")).toBeNull();
    expect(id("lot do Londynu", "description")).toBeNull();
    expect(id("Kawiarnia Plus Minus")).toBeNull();
    expect(id("Sklep spożywczy ABCXYZ")).toBeNull();
    expect(id("Shellfish bar")).toBeNull();
    // …but they work as the start of the merchant field.
    expect(id("PLAY P4 SP Z O O")).toBe("play");
    expect(id("BP STACJA 21")).toBe("bp");
    expect(id("TEMU.COM")).toBe("temu");
  });

  it("drops an ambiguous merchant word that contradicts the transaction category", () => {
    expect(matchMerchant("PLUS 24", { category: GROCERIES })).toBeNull();
    expect(matchMerchant("PLUS 24", { category: { name: "Связь и интернет", icon: "wifi" } })?.brand.id).toBe("plus");
  });
});

describe("transaction icon", () => {
  it("7: a known grocery shop with a logo shows the logo", () => {
    const i = icon({ merchant: "LIDL POLSKA 1234", category: GROCERIES });
    expect(i.type).toBe("logo");
    expect(src({ merchant: "LIDL POLSKA 1234" })).toBe("brands/lidl.svg");
    expect(src({ merchant: "ŻABKA N123" })).toBe("brands/zabka.svg");
  });

  it("a known grocery shop without a logo file shows the grocery basket, not a broken image", () => {
    expect(BRAND_LOGOS.has("biedronka")).toBe(false);
    const i = icon({ merchant: "BIEDRONKA 1234" });
    expect(i).toMatchObject({ type: "art", art: "grocery-basket" });
    expect(i.brand?.name).toBe("Biedronka");
  });

  it("8: an unknown grocery shop shows the grocery basket", () => {
    expect(src({ merchant: "Delikatesy S.c.", category: GROCERIES })).toBe("categories/grocery-basket.svg");
    expect(src({ merchant: "Sklep U Ani", category: { name: "Продукты", icon: null } })).toBe("categories/grocery-basket.svg");
  });

  it("9 & 18: unknown shops show the store, or the category's picture", () => {
    expect(src({ merchant: "Pracownia Ceramiki Kowalski", category: { name: "Подарки", icon: "gift" } })).toBe("categories/store.svg");
    expect(src({ merchant: "Nieznany sprzedawca" })).toBe("categories/store.svg"); // 18: no category at all
    expect(src({ merchant: "Taxi Wrocław 19191", category: { name: "Транспорт", icon: "car" } })).toBe("categories/transport.svg");
  });

  it("10: Lidl paid with Apple Pay shows Lidl, not Apple Pay", () => {
    expect(src({ merchant: "Apple Pay", description: "LIDL POLSKA 1234 · Mastercard ••4821" })).toBe("brands/lidl.svg");
    expect(src({ merchant: "LIDL", description: "Apple Pay" })).toBe("brands/lidl.svg");
    // Apple Pay alone is how it was paid, not where: the category decides.
    expect(src({ merchant: "Apple Pay", category: GROCERIES })).toBe("categories/grocery-basket.svg");
  });

  it("11: an Apple Pay / Revolut top-up shows the top-up picture", () => {
    expect(src({ kind: "income", merchant: "Apple Pay", description: "Doładowanie" })).toBe("categories/topup.svg");
    expect(src({ kind: "income", description: "Zasilenie konta Revolut" })).toBe("categories/topup.svg");
  });

  it("12: a transfer between people shows the transfer picture", () => {
    expect(src({ kind: "transfer" })).toBe("categories/transfer.svg");
    expect(src({ merchant: "MARIIA BABANIUK", description: "Przelew na telefon BLIK" })).toBe("categories/transfer.svg");
    expect(src({ kind: "income", description: "Przelew od Jan Kowalski" })).toBe("categories/transfer.svg");
  });

  it("13: bank fees and cash withdrawals have their own pictures", () => {
    expect(src({ description: "Prowizja za przelew natychmiastowy" })).toBe("categories/bank-fee.svg");
    expect(src({ merchant: "mBank", description: "Opłata za kartę" })).toBe("categories/bank-fee.svg");
    expect(src({ description: "Wypłata z bankomatu Euronet 1234" })).toBe("categories/cash.svg");
    expect(src({ description: "Opłata za parking", category: { name: "Транспорт", icon: "car" } })).toBe("categories/transport.svg");
  });

  it("14: a refund keeps the shop it came from", () => {
    expect(icon({ kind: "refund", merchant: "ZALANDO SE" })).toMatchObject({ type: "logo", brand: { id: "zalando" } });
    expect(icon({ kind: "refund", merchant: "Mały sklepik", category: GROCERIES })).toMatchObject({ type: "art", art: "grocery-basket" });
  });

  it("uses the official brand name as the title, keeps the merchant text otherwise", () => {
    expect(merchantTitle({ kind: "expense", merchant: "MCDONALDS 0442 WROCLAW" })).toBe("McDonald's");
    expect(merchantTitle({ kind: "expense", merchant: "Delikatesy S.c." })).toBe("Delikatesy S.c.");
    expect(merchantTitle({ kind: "expense", merchant: "Apple Pay" })).toBe("Apple Pay");
    expect(merchantTitle({ kind: "transfer", merchant: "x" })).toBeNull();
  });

  it("19: never changes the transaction itself", () => {
    const tx = Object.freeze({ kind: "expense" as const, merchant: "LIDL POLSKA 1234", description: "Apple Pay", category: Object.freeze({ ...GROCERIES }) });
    const before = JSON.stringify(tx);
    transactionIcon(tx);
    merchantTitle(tx);
    expect(JSON.stringify(tx)).toBe(before);
  });
});
