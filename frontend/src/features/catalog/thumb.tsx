import { ShoppingBasket } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/* Shopping-list category (Russian label, as stored on items) → fallback picture and tint.
 * Same keys and files as backend/app/modules/catalog/data.py CATEGORIES. */
const CATEGORY_LOOK: Record<string, { image: string; tint: string }> = {
  "Овощи и зелень": { image: "category-vegetables.svg", tint: "bg-mint" },
  "Фрукты и ягоды": { image: "category-fruits.svg", tint: "bg-peach" },
  "Молочные продукты и яйца": { image: "category-dairy.svg", tint: "bg-lavender" },
  "Мясо и птица": { image: "category-meat.svg", tint: "bg-peach" },
  "Рыба и морепродукты": { image: "category-fish.svg", tint: "bg-lavender" },
  "Хлеб и выпечка": { image: "category-bakery.svg", tint: "bg-lemon-soft" },
  "Крупы, макароны и бакалея": { image: "category-grocery.svg", tint: "bg-lemon-soft" },
  "Замороженные продукты": { image: "category-frozen.svg", tint: "bg-lavender" },
  Напитки: { image: "category-drinks.svg", tint: "bg-mint" },
  "Сладости и снеки": { image: "category-sweets.svg", tint: "bg-peach" },
  "Соусы, специи и консервы": { image: "category-pantry.svg", tint: "bg-lemon-soft" },
  "Бытовая химия": { image: "category-household.svg", tint: "bg-lavender" },
  "Гигиена и уход": { image: "category-hygiene.svg", tint: "bg-mint" },
};

/** "local:<file>" → the product's own bundled illustration at /products/<file>; an https URL
 * (allow-listed by the server) as is. Anything else — including the retired Twemoji codes
 * ("local:1f95b") older items may still carry — gives no picture, so the category one shows. */
export function imageSrc(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const local = /^local:([0-9a-z][0-9a-z-]*\.(?:svg|png))$/.exec(ref);
  if (local) return `/products/${local[1]}`;
  return ref.startsWith("https://") ? ref : null;
}

/** Product thumbnail. A bundled illustration is a finished tile (its own pastel backdrop) and
 * fills the whole thumbnail; an external picture sits centred on the category tint. Falls back to
 * the category picture, then to an icon — an item without a picture still looks intentional. */
export function ProductThumb({ image, category, size = 44, className }: { image?: string | null; category?: string | null; size?: number; className?: string }) {
  const look = (category && CATEGORY_LOOK[category]) || null;
  const candidates = [imageSrc(image), look ? `/products/${look.image}` : null].filter((x): x is string => Boolean(x));
  const [failed, setFailed] = useState(0);
  const src = candidates[failed];
  const fullBleed = !!src && src.startsWith("/products/");
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl", fullBleed ? "bg-surface-2" : (look?.tint ?? "bg-surface-2"), className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((n) => n + 1)}
          style={fullBleed ? { width: size, height: size, objectFit: "cover" } : { width: size * 0.62, height: size * 0.62 }}
        />
      ) : (
        <ShoppingBasket className="text-muted" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </span>
  );
}
