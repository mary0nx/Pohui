import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { Button, Chips, Input, Sheet, Switch, useToast } from "@/components/ui";
import { addDays, addMonths } from "@/lib/time";

import { LAYERS, useCalendarLayers } from "./layers";

const PRESETS = [
  { value: "ДДННВВВВ", label: "2 дня · 2 ночи · 4 вых." },
  { value: "ДНВВ", label: "День · ночь · 2 вых." },
  { value: "ДДВВ", label: "2 дня · 2 вых." },
  { value: "НННВВВ", label: "3 ночи · 3 вых." },
  { value: "ДДДДДВВ", label: "5 дней · 2 вых." },
];
const TO_CODE: Record<string, string> = { Д: "D", Н: "N", В: "O" };

/** Д/Н/В letters (as typed) to the API's D/N/O pattern; null if invalid. */
export function toPatternCode(text: string): string | null {
  const letters = text.toUpperCase().replace(/[\s·.,-]/g, "");
  if (!letters || letters.length > 62) return null;
  const code = [...letters].map((ch) => TO_CODE[ch]).join("");
  if (code.length !== letters.length || !/[DN]/.test(code)) return null;
  return code;
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function ShiftSheet({
  open,
  onOpenChange,
  defaultDay,
  editing,
  onEditingChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDay: string;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
}) {
  const { f } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const [layers, setLayers] = useCalendarLayers();
  const [pattern, setPattern] = useState(PRESETS[0]!.value);
  const [anchor, setAnchor] = useState(defaultDay);
  const [start, setStart] = useState(monthStart(defaultDay));
  const [end, setEnd] = useState(addDays(addMonths(defaultDay.slice(0, 7), 7) + "-01", -1));

  useEffect(() => {
    if (!open) return;
    setAnchor(defaultDay);
    setStart(monthStart(defaultDay));
    setEnd(addDays(`${addMonths(defaultDay.slice(0, 7), 7)}-01`, -1));
  }, [open, defaultDay]);

  const code = toPatternCode(pattern);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["shifts"] });
  const generate = useMutation({
    mutationFn: () => api<{ day_shifts: number; night_shifts: number }>(f("/calendar/shifts/generate"), { body: { pattern: code, anchor, start, end } }),
    onSuccess: async (r) => {
      await invalidate();
      toast.show(`График заполнен: дневных ${r.day_shifts}, ночных ${r.night_shifts}`);
      onOpenChange(false);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const clear = useMutation({
    mutationFn: () => api(f("/calendar/shifts"), { method: "DELETE", query: { date_from: start, date_to: end } }),
    onSuccess: async () => {
      await invalidate();
      toast.show("Смены за период удалены");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Рабочий график и праздники"
      footer={
        <Button block loading={generate.isPending} disabled={!code || !anchor || !start || !end || end < start} onClick={() => generate.mutate()}>
          Заполнить график
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="px-1 text-sm font-medium">Шаблон смен</p>
          <Chips value={PRESETS.some((p) => p.value === pattern) ? pattern : ""} onChange={setPattern} options={PRESETS} />
          <Input
            label="Или свой: Д — день, Н — ночь, В — выходной"
            value={pattern}
            onChange={(e) => setPattern(e.target.value.toUpperCase())}
            error={pattern && !code ? "Только буквы Д, Н, В и хотя бы одна смена" : undefined}
          />
        </div>
        <Input label="Первый день шаблона" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} hint="День, с которого начинается цикл — первая буква шаблона." />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Заполнить с" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="по" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <p className="px-1 text-xs text-muted">Смены в этом периоде заменятся по шаблону. Отдельные дни потом можно поменять в календаре.</p>
        <Switch
          label="Править смены касанием"
          description="В месяце нажимайте на день: дневная → ночная → выходной"
          checked={editing}
          onChange={(v) => {
            onEditingChange(v);
            if (v) onOpenChange(false);
          }}
        />
        <Button variant="ghost" className="text-danger" loading={clear.isPending} onClick={() => clear.mutate()}>
          Удалить смены за период
        </Button>
        <div className="space-y-1 border-t border-border pt-3">
          <p className="px-1 text-sm font-medium">Показывать в календаре</p>
          {LAYERS.map((l) => (
            <Switch
              key={l.kind}
              label={`${l.mark} ${l.label}`}
              checked={layers.includes(l.kind)}
              onChange={(v) => setLayers(v ? [...layers, l.kind] : layers.filter((k) => k !== l.kind))}
            />
          ))}
        </div>
      </div>
    </Sheet>
  );
}
