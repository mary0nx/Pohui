import { Check, Search } from "lucide-react";
import { useState } from "react";

import { Chips, Input, Sheet, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CatalogItem } from "@/types/api";

import { useCatalogCategories, useCatalogSearch, useDebounced } from "./api";
import { ProductThumb } from "./thumb";

/** Browse the product catalogue by category or search it, and add products in one tap. */
export function CatalogSheet({
  open,
  onOpenChange,
  inList,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Catalogue ids already needed in the list (shown with a check). */
  inList: Set<string>;
  onPick: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const q = useDebounced(query, 350);
  const cats = useCatalogCategories();
  const res = useCatalogSearch(q, { category: q ? null : category || null, limit: 250, enabled: open });
  const items = res.data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Каталог товаров" description="Нажмите на товар, чтобы добавить его в список">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input aria-label="Поиск в каталоге" className="pl-10" placeholder="Молоко, mleko, яйца…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!query && (
          <Chips
            value={category}
            onChange={setCategory}
            options={[{ value: "", label: "Все" }, ...(cats.data ?? []).map((c) => ({ value: c.key, label: c.label }))]}
          />
        )}
        {res.isPending ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))}
          </div>
        ) : res.isError ? (
          <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">Каталог не загрузился. Можно добавить товар, написав его название в поле над списком.</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">В каталоге такого нет — закройте окно и впишите название в поле: товар добавится и без картинки.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2" aria-label="Товары каталога">
            {items.map((p) => {
              const added = inList.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    aria-label={added ? `${p.name}: уже в списке, добавить ещё` : `Добавить ${p.name}`}
                    className={cn("press relative flex w-full flex-col items-center gap-1.5 rounded-2xl bg-surface p-2 pb-2.5 text-center shadow-card", added && "ring-2 ring-sage")}
                  >
                    <ProductThumb image={p.image} category={p.category_label} size={60} />
                    <span className="line-clamp-2 text-xs font-semibold leading-tight text-heading">{p.name}</span>
                    {added && (
                      <span className="animate-check absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-sage text-forest-ink" aria-hidden>
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="px-1 pb-1 text-[11px] text-subtle">Изображения: Twemoji, CC-BY 4.0</p>
      </div>
    </Sheet>
  );
}
