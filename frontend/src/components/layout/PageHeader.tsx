import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { Art, type ArtName } from "@/components/illustrations/Art";
import { isInsideTelegram } from "@/lib/telegram";

/** Section header. `art` adds the section's small illustration — its own color accent. */
export function PageHeader({ title, subtitle, back, action, art }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode; art?: ArtName }) {
  const navigate = useNavigate();
  // Inside Telegram the native BackButton is used; elsewhere show our own.
  const showBack = back && !isInsideTelegram();
  return (
    <header className="flex items-center justify-between gap-2 pb-4 pt-6">
      <div className="flex min-w-0 items-center gap-1">
        {showBack && (
          <button type="button" aria-label="Назад" onClick={() => navigate(back)} className="press -ml-1 mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted shadow-card hover:text-text">
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {art && <Art name={art} className="animate-art-in hidden h-[52px] w-[62px] min-[375px]:block" />}
        {action}
      </div>
    </header>
  );
}
