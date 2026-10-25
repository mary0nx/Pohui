import { ChevronRight } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/cn";

export type CardTone = "plain" | "coral" | "peach" | "mint" | "sage" | "lavender" | "lemon" | "forest";

/* Soft surfaces with a light warm shadow — no heavy outlines. Tints are pastel, so body
 * text keeps its contrast on every tone. */
const tones: Record<CardTone, string> = {
  plain: "bg-surface",
  coral: "bg-peach",
  peach: "bg-peach-soft",
  mint: "bg-mint",
  sage: "bg-sage-soft",
  lavender: "bg-lavender",
  lemon: "bg-lemon-soft",
  forest: "bg-forest-soft",
};

/** Soft, rounded surface. Tinted tones are for highlighted cards, never for whole screens. */
export function Card({ className, tone = "plain", interactive, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: CardTone; interactive?: boolean }) {
  return <div className={cn("rounded-card p-4 shadow-card", tones[tone], interactive && "press hover:shadow-sheet", className)} {...rest} />;
}

export function CardHeader({ title, to, action, icon }: { title: string; to?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
        {icon}
        {title}
      </h2>
      {to ? (
        <Link to={to} className="press inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-sm font-bold text-coral-ink hover:bg-peach-soft">
          Все <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-1">
          {title && <h3 className="text-sm font-bold text-muted">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Round colored badge for a section icon: the playful accent of a card. */
export function IconBadge({ children, tone = "coral", className }: { children: ReactNode; tone?: Exclude<CardTone, "plain"> | "accent"; className?: string }) {
  const bg = {
    accent: "bg-accent text-accent-fg",
    coral: "bg-peach text-peach-ink",
    peach: "bg-peach text-peach-ink",
    mint: "bg-mint text-mint-ink",
    sage: "bg-sage-soft text-sage-ink",
    lavender: "bg-lavender text-lavender-ink",
    lemon: "bg-lemon text-lemon-ink",
    forest: "bg-forest-soft text-forest-ink",
  }[tone];
  return <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", bg, className)}>{children}</span>;
}
