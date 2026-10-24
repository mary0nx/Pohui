import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border/70 bg-surface p-4 shadow-card", className)} {...rest} />;
}

export function CardHeader({ title, to, action, icon }: { title: string; to?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        {icon}
        {title}
      </h2>
      {to ? (
        <Link to={to} className="text-sm font-medium text-accent">
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
          {title && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
