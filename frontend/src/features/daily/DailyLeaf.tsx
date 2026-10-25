import { Heart, Share2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useFamily, useSession } from "@/app/session";
import { Art, type ArtName } from "@/components/illustrations/Art";
import { Button, Sheet, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { haptic } from "@/lib/telegram";

import { useDailyArt, useDailyFavorites, useDailyPage, useToggleFavorite } from "./api";
import type { Season } from "./content";
import { THEME_LABELS } from "./labels";
import type { DailyPage } from "./schedule";
import { shareDaily } from "./share";

const LOOK: Record<Season, { tint: string; paper: string; ink: string; fallback: ArtName }> = {
  spring: { tint: "bg-mint", paper: "bg-mint-soft", ink: "text-mint-ink", fallback: "plant" },
  summer: { tint: "bg-lemon", paper: "bg-lemon-soft", ink: "text-lemon-ink", fallback: "pot" },
  autumn: { tint: "bg-peach", paper: "bg-peach-soft", ink: "text-peach-ink", fallback: "mugs" },
  winter: { tint: "bg-lavender", paper: "bg-lavender-soft", ink: "text-lavender-ink", fallback: "house" },
};

/** The page's illustration, inlined so it follows the light/dark theme. While it loads the
 *  box keeps its size (no layout jump); if it cannot load, a built-in picture stands in. */
export function DailyArt({ page, className, alive, inset = "p-[6%]" }: { page: DailyPage; className?: string; alive?: boolean; inset?: string }) {
  const art = useDailyArt(page.art);
  const look = LOOK[page.season];
  return (
    <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden", look.tint, className)} aria-hidden>
      {art.data ? (
        <div className={cn("h-full w-full [&>svg]:h-full [&>svg]:w-full", inset, alive && "ill-alive")} dangerouslySetInnerHTML={{ __html: art.data }} />
      ) : art.isError ? (
        <Art name={look.fallback} className="h-[86%] w-[86%]" />
      ) : null}
    </div>
  );
}

/** «Листочек дня»: a small tear-off calendar page on the home screen. */
export function DailyCard() {
  const { tz } = useFamily();
  const { page, failed } = useDailyPage();
  const [open, setOpen] = useState(false);
  // A new page slides in when the day changes while the app is open (not on first show).
  const first = useRef<string | null>(null);
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    if (!page) return;
    if (first.current === null) first.current = page.date;
    else if (first.current !== page.date) setTurned(true);
  }, [page]);

  if (failed) return null; // the home screen works without it
  if (!page) return <div className="h-[118px] rounded-[26px] bg-surface shadow-card" aria-hidden />;
  const look = LOOK[page.season];
  const day = formatDate(page.date, tz, { day: "numeric" });
  const month = formatDate(page.date, tz, { month: "short" }).replace(".", "");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("select");
          setOpen(true);
        }}
        aria-label={`Листочек дня, ${formatDate(page.date, tz)}: ${page.text} Открыть страницу`}
        className="press daily-perf relative block w-full overflow-hidden rounded-[26px] bg-surface text-left shadow-card"
      >
        <div key={page.date} className={cn("flex items-center gap-3 p-3.5 pt-4", turned && "animate-leaf-in")}>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-[11px] font-extrabold uppercase tracking-[0.1em]", look.ink)}>{THEME_LABELS[page.theme]}</p>
            <p className="mt-1 line-clamp-3 text-[15px] font-bold leading-snug text-heading">{page.text}</p>
          </div>
          <div className="relative">
            <DailyArt page={page} alive inset="p-0.5" className="size-[88px] rounded-[20px]" />
            <span className="absolute -left-2 -top-1.5 flex min-w-[38px] flex-col items-center rounded-xl bg-surface px-1.5 pb-1 pt-0.5 leading-none shadow-card">
              <span className="tabular text-[17px] font-extrabold text-coral-ink">{day}</span>
              <span className="text-[10px] font-bold text-muted">{month}</span>
            </span>
          </div>
        </div>
      </button>
      <DailySheet page={page} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DailySheet({ page, open, onOpenChange }: { page: DailyPage; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { tz } = useFamily();
  const { meta } = useSession();
  const toast = useToast();
  const art = useDailyArt(page.art);
  const favorites = useDailyFavorites(open);
  const toggle = useToggleFavorite();
  const [showSaved, setShowSaved] = useState(false);
  const saved = favorites.data?.some((f) => f.phrase_id === page.id) ?? false;
  const fullDate = formatDate(page.date, tz, { weekday: "long", day: "numeric", month: "long" });
  const others = (favorites.data ?? []).filter((f) => f.phrase_id !== page.id);
  const look = LOOK[page.season];

  const share = async () => {
    const result = await shareDaily(page, art.data, formatDate(page.date, tz), meta?.bot_username ?? null);
    if (result === "copied") toast.show("Текст скопирован — можно вставить в чат");
    else if (result === "failed") toast.show("Не получилось поделиться", "error");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Листочек дня" description={fullDate.charAt(0).toUpperCase() + fullDate.slice(1)}>
      <div className="space-y-4 pb-1">
        <div className={cn("overflow-hidden rounded-[28px]", look.paper)}>
          <DailyArt page={page} alive className="aspect-[6/5] max-h-[230px] w-full" />
          <div className="px-5 pb-5 pt-4">
            <p className={cn("text-xs font-extrabold uppercase tracking-[0.1em]", look.ink)}>{THEME_LABELS[page.theme]}</p>
            <p className="mt-1.5 text-[21px] font-extrabold leading-snug text-heading">{page.text}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-2xl bg-surface-2 p-3.5">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-coral-ink" aria-hidden />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Маленькая идея на сегодня</p>
            <p className="mt-0.5 text-[15px] text-text">{page.idea}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={saved ? "soft" : "secondary"}
            aria-pressed={saved}
            disabled={favorites.isPending || toggle.isPending}
            icon={<Heart className={cn("size-4", saved && "fill-current")} />}
            onClick={() => {
              haptic(saved ? "light" : "success");
              toggle.mutate({ save: !saved, id: page.id, text: page.text, day: page.date });
            }}
          >
            {saved ? "В избранном" : "В избранное"}
          </Button>
          <Button variant="secondary" icon={<Share2 className="size-4" />} onClick={() => void share()}>
            Поделиться
          </Button>
        </div>
        {others.length > 0 && (
          <div>
            <button type="button" className="press text-sm font-bold text-coral-ink" aria-expanded={showSaved} onClick={() => setShowSaved((v) => !v)}>
              {showSaved ? "Скрыть избранное" : `Избранные фразы · ${others.length}`}
            </button>
            {showSaved && (
              <ul className="animate-tab-in mt-2 divide-y divide-border rounded-2xl bg-surface-2" aria-label="Избранные фразы">
                {others.map((f) => (
                  <li key={f.phrase_id} className="flex items-start gap-2 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-heading">{f.text}</p>
                      <p className="text-xs text-muted">{formatDate(f.day, tz)}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Убрать из избранного: ${f.text}`}
                      className="press -mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted"
                      onClick={() => toggle.mutate({ save: false, id: f.phrase_id, text: f.text, day: f.day })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
