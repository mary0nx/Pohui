/*
 * Which icon a transaction shows: the shop's logo, or an illustration of its kind/category.
 * Display only — it never changes a transaction's kind, amount, category or anything stored.
 *
 * Three different things are kept apart:
 *  - the shop (where the money went): Lidl, ORLEN, Allegro…  → its logo;
 *  - the category (what for): groceries, transport…           → an illustration if the shop is unknown;
 *  - the payment method (how): card, Apple Pay, BLIK…          → never replaces a known shop.
 */
import { BRAND_LOGOS } from "./brandLogos";
import { BRANDS, type BrandEntry } from "./catalog";
import type { CategoryArt, MerchantCategory } from "./types";

export type { BrandEntry } from "./catalog";
export type { CategoryArt, MerchantCategory } from "./types";

/** Lower case, no Polish/other diacritics, no apostrophes, punctuation → spaces. */
export function normalizeMerchantText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Groups of brand / family categories that may describe the same purchase. A "strict" alias
// (an ordinary word such as "play" or "temu") is rejected when the transaction's own category
// clearly says something else.
type Domain = "grocery" | "food" | "transport" | "shopping" | "health" | "bills" | "travel" | "entertainment";

const BRAND_DOMAINS: Record<MerchantCategory, readonly Domain[] | null> = {
  grocery: ["grocery", "shopping"],
  restaurant: ["food", "grocery"],
  food_delivery: ["food", "grocery"],
  transport: ["transport", "travel"],
  fuel: ["transport", "travel"],
  travel: ["travel", "transport"],
  marketplace: ["shopping", "entertainment", "grocery"],
  fashion: ["shopping"],
  retail: ["shopping", "grocery", "entertainment"],
  discount_retail: ["shopping", "grocery"],
  home: ["shopping", "bills"],
  sports: ["shopping", "entertainment"],
  electronics: ["shopping", "entertainment"],
  digital: ["entertainment", "bills", "shopping"],
  drugstore: ["health", "shopping"],
  pharmacy: ["health"],
  health: ["health"],
  fitness: ["health", "entertainment"],
  delivery: ["shopping", "bills"],
  entertainment: ["entertainment"],
  telecom: ["bills"],
  utilities: ["bills"],
  subscription: ["bills", "entertainment"],
  payment_method: null,
  payments: null,
  banking: null,
};

/** Default family categories carry lucide icon names (backend families/defaults.py). */
const ICON_DOMAIN: Record<string, Domain> = {
  "shopping-basket": "grocery",
  utensils: "food",
  car: "transport",
  "heart-pulse": "health",
  sparkles: "health",
  zap: "bills",
  wifi: "bills",
  repeat: "bills",
  home: "bills",
  shirt: "shopping",
  sofa: "shopping",
  gift: "shopping",
  plane: "travel",
  "party-popper": "entertainment",
};

const NAME_DOMAIN: [RegExp, Domain][] = [
  [/продукт|бакале|spozyw|zakupy spoz|grocer|groceries|supermarket/, "grocery"],
  [/кафе|ресторан|еда|restaur|kawiarn|jedzenie|food|cafe/, "food"],
  [/транспорт|такси|бензин|топлив|авто|transport|paliw|fuel|taxi/, "transport"],
  [/здоров|аптек|красот|zdrow|apteka|lekarz|health|beauty|uroda/, "health"],
  [/коммунал|связь|интернет|подписк|жиль|аренд|rachunk|media|abonament|czynsz|bills|utilit|subscript/, "bills"],
  [/путешеств|отпуск|podroz|travel|wakacj/, "travel"],
  [/развлеч|кино|игр|rozrywk|kino|entertain/, "entertainment"],
  [/одежд|обув|дом и быт|подар|ubrani|odziez|dom|prezent|shopping|cloth/, "shopping"],
];

export interface TxCategoryInfo {
  name?: string | null;
  icon?: string | null;
}

function categoryDomain(category: TxCategoryInfo | null | undefined): Domain | null {
  if (!category) return null;
  if (category.icon && ICON_DOMAIN[category.icon]) return ICON_DOMAIN[category.icon]!;
  const name = normalizeCyr(category.name ?? "");
  for (const [re, domain] of NAME_DOMAIN) if (re.test(name)) return domain;
  return null;
}

/** Normalisation that keeps Cyrillic letters (family category names are Russian). */
function normalizeCyr(text: string): string {
  return text.toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

interface CompiledAlias {
  brand: BrandEntry;
  alias: string;
  strict: boolean;
  re: RegExp;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ALIASES: CompiledAlias[] = BRANDS.flatMap((brand) =>
  brand.aliases.map((raw) => {
    const strict = raw.startsWith("=");
    const alias = normalizeMerchantText(strict ? raw.slice(1) : raw);
    // Strict: only at the very beginning of the merchant field. Otherwise a whole-word match
    // anywhere (merchant or description), so "lidl polska 1234" and "zakupy w lidl" both work.
    const re = strict ? new RegExp(`^${escape(alias)}(?: |$)`) : new RegExp(`(?:^| )${escape(alias)}(?: |$)`);
    return { brand, alias, strict, re };
  }),
)
  .filter((a) => a.alias.length >= 2)
  // The most specific phrase first: "uber eats" before "uber", "google play" before "google".
  .sort((a, b) => b.alias.length - a.alias.length);

const INTERMEDIARY: ReadonlySet<MerchantCategory> = new Set(["payment_method", "payments", "banking"]);

export function isIntermediary(brand: BrandEntry): boolean {
  return INTERMEDIARY.has(brand.category);
}

export interface MerchantMatch {
  brand: BrandEntry;
  alias: string;
}

const cache = new Map<string, MerchantMatch | null>();

/**
 * The brand named in a text. `field: "merchant"` (the structured merchant field, also the
 * default for a bare string) allows strict aliases; descriptions only match unambiguous ones.
 * A real shop wins over a payment provider in the same text ("PAYPAL *ALIEXPRESS" → AliExpress).
 */
export function matchMerchant(input: string | null | undefined, opts: { field?: "merchant" | "description"; category?: TxCategoryInfo | null } = {}): MerchantMatch | null {
  if (!input?.trim()) return null;
  const field = opts.field ?? "merchant";
  const domain = categoryDomain(opts.category);
  const key = `${field}|${domain ?? ""}|${input}`;
  if (cache.has(key)) return cache.get(key)!;
  let text = normalizeMerchantText(input);
  let shop: MerchantMatch | null = null;
  let intermediary: MerchantMatch | null = null;
  for (const a of ALIASES) {
    if (a.strict && field !== "merchant") continue;
    if (!a.re.test(text)) continue;
    if (a.strict && domain) {
      const allowed = BRAND_DOMAINS[a.brand.category];
      if (allowed && !allowed.includes(domain)) continue;
    }
    if (isIntermediary(a.brand)) {
      intermediary ??= { brand: a.brand, alias: a.alias };
      // Its words are not a shop: "apple pay" must not also match the Apple store.
      text = text.replace(a.re, " ").trim();
    } else {
      shop = { brand: a.brand, alias: a.alias };
      break;
    }
  }
  const result = shop ?? intermediary;
  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}

// ---- operations that are not purchases ------------------------------------------------------
const FEE = /\b(prowizja|prowizje|oplata (bankowa|miesieczna|za karte|za karty|za prowadzenie|za obsluge|za przelew|za wyplate)|oplata manipulacyjna|bank fee|card fee|fee|commission|komisja)\b/;
const FEE_RU = /комисси|плата за обслуживание|обслуживание карты/;
const CASH = /\b(bankomat|bankomatu|wyplata gotowki|wyplata z bankomatu|wyplata kartkowa|atm|euronet|cash withdrawal|wplatomat)\b/;
const CASH_RU = /снятие наличных|банкомат/;
const TOPUP = /\b(doladowanie|zasilenie|top up|topup|wplata wlasna|wplata na konto)\b/;
const TOPUP_RU = /пополнени/;
const TRANSFER = /\b(przelew|przelew na telefon|blik na telefon|przelew blik|transfer|zwrot od|przelew od|przelew do)\b/;
const TRANSFER_RU = /перевод/;

export type TxKindLike = "income" | "expense" | "refund" | "transfer";

export interface TxLike {
  kind: TxKindLike;
  merchant?: string | null;
  description?: string | null;
  category?: TxCategoryInfo | null;
}

export type TxIcon =
  | { type: "logo"; src: string; brand: BrandEntry; fallback: CategoryArt }
  | { type: "art"; src: string; art: CategoryArt; brand: BrandEntry | null };

export const artSrc = (art: CategoryArt): string => `${import.meta.env.BASE_URL}assets/categories/${art}.svg`;
export const logoSrc = (id: string): string => `${import.meta.env.BASE_URL}assets/brands/${BRAND_LOGOS.get(id) ?? `${id}.svg`}`;

const BRAND_ART: Record<MerchantCategory, CategoryArt> = {
  grocery: "grocery-basket",
  restaurant: "food",
  food_delivery: "food",
  transport: "transport",
  travel: "transport",
  fuel: "fuel",
  electronics: "electronics",
  digital: "electronics",
  drugstore: "health",
  pharmacy: "health",
  health: "health",
  fitness: "health",
  delivery: "delivery",
  telecom: "bills",
  utilities: "bills",
  subscription: "bills",
  payment_method: "topup",
  payments: "transfer",
  banking: "bank-fee",
  marketplace: "store",
  fashion: "store",
  retail: "store",
  discount_retail: "store",
  home: "store",
  sports: "store",
  entertainment: "store",
};

const DOMAIN_ART: Record<Domain, CategoryArt> = {
  grocery: "grocery-basket",
  food: "food",
  transport: "transport",
  health: "health",
  bills: "bills",
  travel: "transport",
  entertainment: "store",
  shopping: "store",
};

/** The illustration for a known brand without a logo file, or for the category. */
export function brandArt(brand: BrandEntry): CategoryArt {
  return BRAND_ART[brand.category];
}

function art(a: CategoryArt, brand: BrandEntry | null = null): TxIcon {
  return { type: "art", art: a, src: artSrc(a), brand };
}

function shopIcon(brand: BrandEntry): TxIcon {
  return BRAND_LOGOS.has(brand.id) ? { type: "logo", src: logoSrc(brand.id), brand, fallback: brandArt(brand) } : art(brandArt(brand), brand);
}

/** The icon of a transaction (see the rules at the top of the file). */
export function transactionIcon(tx: TxLike): TxIcon {
  if (tx.kind === "transfer") return art("transfer"); // between the family's own accounts
  const merchant = tx.merchant?.trim() || null;
  const description = tx.description?.trim() || null;
  const words = normalizeMerchantText(`${merchant ?? ""} ${description ?? ""}`);
  const raw = `${merchant ?? ""} ${description ?? ""}`.toLowerCase();
  // The merchant field first; the description only if it names no shop (e.g. merchant "Apple Pay").
  const fromMerchant = matchMerchant(merchant, { field: "merchant", category: tx.category });
  const fromDescription = fromMerchant && !isIntermediary(fromMerchant.brand) ? null : matchMerchant(description, { field: "description", category: tx.category });
  const found = [fromMerchant, fromDescription].filter((m): m is MerchantMatch => m !== null);
  const shop = found.find((m) => !isIntermediary(m.brand))?.brand ?? null;
  const match = found[0] ?? null;

  if (tx.kind === "expense" && (FEE.test(words) || FEE_RU.test(raw))) return art("bank-fee");
  if (tx.kind === "expense" && (CASH.test(words) || CASH_RU.test(raw))) return art("cash");
  if (shop) return shopIcon(shop); // purchases and their refunds keep the shop
  if (tx.kind === "income" && (TOPUP.test(words) || TOPUP_RU.test(raw) || match)) return art("topup");
  if (TRANSFER.test(words) || TRANSFER_RU.test(raw)) return art("transfer"); // money to / from a person
  const domain = categoryDomain(tx.category);
  if (domain) return art(DOMAIN_ART[domain]);
  return art(tx.kind === "income" ? "topup" : "store");
}

/** The name shown for the transaction: the brand's official name when recognised. */
export function merchantTitle(tx: TxLike): string | null {
  if (tx.kind === "transfer") return null;
  const icon = transactionIcon(tx);
  const brand = icon.brand;
  if (brand && !isIntermediary(brand)) return brand.name;
  return tx.merchant?.trim() || null;
}
