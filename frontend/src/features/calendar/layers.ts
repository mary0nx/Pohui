import { useEffect, useState } from "react";

import type { HolidayKind } from "@/lib/holidays";
import { cloudGet, cloudSet } from "@/lib/telegram";

const STORAGE = "familyos.calendar-layers";
export const LAYERS: { kind: HolidayKind; label: string; mark: string }[] = [
  { kind: "public", label: "Выходные праздники Польши", mark: "★" },
  { kind: "trading", label: "Торговые воскресенья", mark: "🛒" },
  { kind: "catholic", label: "Великие католические праздники", mark: "✝" },
  { kind: "orthodox", label: "Великие православные праздники", mark: "☦" },
];
const ALL = LAYERS.map((l) => l.kind);

function parse(raw: string | null): HolidayKind[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v.filter((k) => ALL.includes(k as HolidayKind)) as HolidayKind[]) : null;
  } catch {
    return null;
  }
}

function readLocal(): HolidayKind[] {
  try {
    return parse(localStorage.getItem(STORAGE)) ?? ALL;
  } catch {
    return ALL;
  }
}

/** Which holiday layers the user shows; per user, synced through Telegram CloudStorage. */
export function useCalendarLayers(): [HolidayKind[], (kinds: HolidayKind[]) => void] {
  const [kinds, setKinds] = useState<HolidayKind[]>(readLocal);
  useEffect(() => {
    let cancelled = false;
    void cloudGet(STORAGE).then((raw) => {
      const v = parse(raw);
      if (!cancelled && v) setKinds(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const update = (next: HolidayKind[]) => {
    setKinds(next);
    const raw = JSON.stringify(next);
    try {
      localStorage.setItem(STORAGE, raw);
    } catch {
      /* ignore */
    }
    cloudSet(STORAGE, raw);
  };
  return [kinds, update];
}
