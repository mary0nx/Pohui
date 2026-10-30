import { ShoppingBasket } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/* Shopping-list category (Russian label, as stored on items) → fallback picture and tint.
 * Same keys as backend/app/modules/catalog/data.py CATEGORIES. */
const CATEGORY_LOOK: Record<string, { image: string; tint: string }> = {
  "Овощи и зелень": { image: "1f966", tint: "bg-mint" },
  "Фрукты и ягоды": { image: "1f34e", tint: "bg-peach" },
  "Молочные продукты и яйца": { image: "1f95b", tint: "bg-lavender" },
  "Мясо и птица": { image: "1f969", tint: "bg-peach" },
  "Рыба и морепродукты": { image: "1f41f", tint: "bg-lavender" },
  "Хлеб и выпечка": { image: "1f35e", tint: "bg-lemon-soft" },
  "Крупы, макароны и бакалея": { image: "1f35a", tint: "bg-lemon-soft" },
  "Замороженные продукты": { image: "1f9ca", tint: "bg-lavender" },
  Напитки: { image: "1f9c3", tint: "bg-mint" },
  "Сладости и снеки": { image: "1f36b", tint: "bg-peach" },
  "Соусы, специи и консервы": { image: "1f96b", tint: "bg-lemon-soft" },
  "Бытовая химия": { image: "1f9fd", tint: "bg-lavender" },
  "Гигиена и уход": { image: "1f9f4", tint: "bg-mint" },
};

/** "local:<code>" → bundled image; an https URL (allow-listed by the server) as is.
 * A Twemoji code point (hex) is a flat `.svg` glyph; a named ref ("asparagus") is a full
 * `.png` illustration that fills the tile. */
export function imageSrc(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const local = /^local:([0-9a-z][0-9a-z-]*)$/.exec(ref);
  if (local) {
    const code = local[1] ?? "";
    const ext = /^[0-9a-f]+(?:-[0-9a-f]+)*$/.test(code) ? "svg" : "png";
    return `/products/${code}.${ext}`;
  }
  return ref.startsWith("https://") ? ref : null;
}

/** Product thumbnail on a soft tinted tile. Falls back to the category picture, then to an
 * icon — an item without a picture still looks intentional. */
export function ProductThumb({ image, category, size = 44, className }: { image?: string | null; category?: string | null; size?: number; className?: string }) {
  const look = (category && CATEGORY_LOOK[category]) || null;
  const candidates = [imageSrc(image), look ? `/products/${look.image}.svg` : null].filter((x): x is string => Boolean(x));
  const [failed, setFailed] = useState(0);
  const src = candidates[failed];
  // A named PNG illustration carries its own soft backdrop and fills the whole tile; a
  // Twemoji glyph sits small and centred on the category tint.
  const fullBleed = !!src && src.endsWith(".png");
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
