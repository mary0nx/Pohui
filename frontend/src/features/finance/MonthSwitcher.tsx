import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton } from "@/components/ui";
import { formatMonth } from "@/lib/format";
import { addMonths } from "@/lib/time";

export function MonthSwitcher({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface px-1 py-1 shadow-card">
      <IconButton label="Предыдущий месяц" onClick={() => onChange(addMonths(month, -1))}>
        <ChevronLeft className="size-5" />
      </IconButton>
      <span className="text-[15px] font-semibold">{formatMonth(month)}</span>
      <IconButton label="Следующий месяц" disabled={max !== undefined && month >= max} className="disabled:opacity-30" onClick={() => onChange(addMonths(month, 1))}>
        <ChevronRight className="size-5" />
      </IconButton>
    </div>
  );
}
