import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/cn";

export type CardTone = "plain" | "coral" | "mint" | "lavender" | "lemon" | "forest";

const tones: Record<CardTone, string> = {
  plain: "bg-surface border border-border/70",
  coral: "bg-coral-soft border border-transparent",
  mint: "bg-mint-soft border border-transparent",
  lavender: "bg-lavender-soft border border-transparent",
  lemon: "bg-lemon-soft border border-transparent",
  forest: "bg-forest-soft border border-transparent",
};

/** Soft, rounded surface. Tinted tones are for highlighted cards, never for whole screens. */
export function Card({ className, tone = "plain", interactive, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: CardTone; interactive?: boolean }) {
  return <div className={cn("rounded-card p-4 shadow-card", tones[tone], interactive && "press hover:shadow-lg", className)} {...rest} />;
}

export function CardHeader({ title, to, action, icon }: { title: string; to?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold">
        {icon}
        {title}
      </h2>
      {to ? (
        <Link to={to} className="press rounded-full px-2.5 py-1 text-sm font-semibold text-accent-strong hover:bg-accent-soft">
          Все
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
          {title && <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{title}</h3>}
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
    coral: "bg-coral text-on-bright",
    mint: "bg-mint text-on-bright",
    lavender: "bg-lavender text-on-bright",
    lemon: "bg-lemon text-on-bright",
    forest: "bg-forest text-cream",
  }[tone];
  return <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", bg, className)}>{children}</span>;
}
