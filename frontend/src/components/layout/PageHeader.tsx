import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { isInsideTelegram } from "@/lib/telegram";

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  const navigate = useNavigate();
  // Inside Telegram the native BackButton is used; elsewhere show our own.
  const showBack = back && !isInsideTelegram();
  return (
    <header className="flex items-center justify-between gap-2 pb-4 pt-5">
      <div className="flex min-w-0 items-center gap-1">
        {showBack && (
          <button type="button" aria-label="Назад" onClick={() => navigate(back)} className="-ml-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2">
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}
