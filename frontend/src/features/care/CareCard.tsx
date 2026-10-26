import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

import { useCare, useCarePreview } from "./api";

/** Home screen: one compact line with today's weather and advice, only when the feature is on. */
export function CareCard() {
  const care = useCare();
  const on = care.data?.enabled === true;
  const preview = useCarePreview(on);
  const w = preview.data?.weather;
  if (!on || !w) return null;
  return (
    <Link to="/profile/care" className="flex items-center gap-3 rounded-[22px] bg-mint-soft px-4 py-3 shadow-card" aria-label={`Погода сегодня: ${w.line} ${w.tips}`}>
      <span className="text-2xl" aria-hidden>
        {w.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-mint-ink">{w.line.replace(/^.*?Погода: /, "").replace(/\.$/, "")}</span>
        <span className="line-clamp-1 text-xs text-muted">{w.tips.replace(/^🧥 Совет: /, "")}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
