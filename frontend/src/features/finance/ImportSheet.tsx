import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { Button, Select, Sheet, useToast } from "@/components/ui";
import type { ImportResult } from "@/types/api";

import { useAccounts, useFinanceInvalidate } from "./api";

export function ImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { f } = useFamily();
  const accounts = useAccounts();
  const invalidate = useFinanceInvalidate();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [account, setAccount] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("account_id", account || accounts.data?.[0]?.id || "");
    form.set("dry_run", String(dryRun));
    setBusy(true);
    try {
      const res = await api<ImportResult>(f("/finance/import"), { form });
      setPreview(res);
      if (!dryRun) {
        await invalidate();
        toast.show(`Импортировано операций: ${res.created}`);
        onOpenChange(false);
        setPreview(null);
        setFile(null);
      }
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Импорт из CSV"
      description="Колонки: дата, сумма (минус — расход), описание, категория"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" block disabled={!file} loading={busy && !preview} onClick={() => run(true)}>
            Проверить
          </Button>
          <Button block disabled={!preview || preview.created === 0} loading={busy && Boolean(preview)} onClick={() => run(false)}>
            Импортировать
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select label="Счёт" value={account} onChange={(e) => setAccount(e.target.value)}>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border text-sm text-muted">
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setPreview(null))} />
          {file ? file.name : "Выберите CSV-файл"}
        </label>
        {preview && (
          <div className="rounded-2xl bg-surface-2 p-3 text-sm">
            <p>Будет добавлено: <b>{preview.created}</b></p>
            <p>Уже импортировано ранее: {preview.skipped_duplicates}</p>
            {preview.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-danger">
                {preview.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-muted">Подключение банков не поддерживается: данные вводятся вручную или импортируются из выписки CSV.</p>
      </div>
    </Sheet>
  );
}
