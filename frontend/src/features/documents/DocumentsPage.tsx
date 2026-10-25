import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily, useSession } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, LoadingBlock, Select, Sheet, Switch, Textarea, useToast } from "@/components/ui";
import { fileSize, formatDate } from "@/lib/format";
import { openExternal } from "@/lib/telegram";
import { addDays, todayIn } from "@/lib/time";
import type { DocumentItem, Visibility } from "@/types/api";

const CATEGORIES: Record<string, string> = { id: "Удостоверения", finance: "Финансы", home: "Жильё", car: "Авто", health: "Здоровье", insurance: "Страховки", other: "Другое" };

interface UploadForm {
  title: string;
  category: string;
  document_date: string;
  expires_on: string;
  remind: string;
  notes: string;
  visibility: Visibility;
  file: File | null;
}

export function DocumentsPage() {
  const { f, familyId, tz, userId, role } = useFamily();
  const { meta } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [upload, setUpload] = useState<UploadForm | null>(null);
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const docs = useQuery({ queryKey: ["documents", familyId, q, archived], queryFn: () => api<DocumentItem[]>(f("/documents"), { query: { q: q.trim() || undefined, archived } }), placeholderData: (p) => p });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["documents"] });
  const maxMb = meta?.max_upload_mb ?? 15;
  const uploadsEnabled = meta?.uploads_enabled !== false;

  const create = useMutation({
    mutationFn: async (v: UploadForm) => {
      if (v.file) {
        const form = new FormData();
        form.set("file", v.file);
        form.set("title", v.title.trim());
        if (v.category) form.set("category", v.category);
        if (v.document_date) form.set("document_date", v.document_date);
        if (v.expires_on) form.set("expires_on", v.expires_on);
        if (v.remind && v.expires_on) form.set("remind_days_before", v.remind);
        if (v.notes) form.set("notes", v.notes);
        form.set("visibility", v.visibility);
        return api<DocumentItem>(f("/documents/upload"), { form });
      }
      return api<DocumentItem>(f("/documents"), {
        body: { title: v.title.trim(), category: v.category || null, document_date: v.document_date || null, expires_on: v.expires_on || null, remind_days_before: v.remind && v.expires_on ? Number(v.remind) : null, notes: v.notes || null, visibility: v.visibility },
      });
    },
    onSuccess: async () => {
      setUpload(null);
      toast.show("Документ сохранён");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const download = useMutation({
    mutationFn: (d: DocumentItem) => api<{ url: string }>(f(`/documents/${d.id}/download-link`), { method: "POST" }),
    onSuccess: (r) => openExternal(r.url),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const archive = useMutation({
    mutationFn: (d: DocumentItem) => api(f(`/documents/${d.id}`), { method: "PATCH", body: { archived: !d.archived_at } }),
    onSuccess: async () => {
      setSelected(null);
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (d: DocumentItem) => api(f(`/documents/${d.id}`), { method: "DELETE" }),
    onSuccess: async () => {
      setConfirm(false);
      setSelected(null);
      toast.show("Документ удалён");
      await invalidate();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const today = todayIn(tz);
  const openUpload = () => setUpload({ title: "", category: "", document_date: "", expires_on: "", remind: "30", notes: "", visibility: "family", file: null });
  const tooBig = upload?.file ? upload.file.size > maxMb * 1024 * 1024 : false;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Документы"
        back="/home"
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={openUpload}>
            Документ
          </Button>
        }
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input aria-label="Поиск документов" className="pl-10" placeholder="Поиск по названию и заметкам" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {docs.isPending ? (
        <LoadingBlock />
      ) : docs.isError ? (
        <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
      ) : docs.data.length === 0 ? (
        <Card>
          <EmptyState
            art="docs"
            title={q ? "Ничего не найдено" : "Документов пока нет"}
            text="Паспорта, страховки, договоры — храните их с напоминанием о сроке действия."
            action={
              !q && (
                <Button icon={<Plus className="size-4" />} onClick={openUpload}>
                  Добавить документ
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {docs.data.map((d) => {
            const expiring = d.expires_on && d.expires_on <= addDays(today, 30);
            return (
              <button key={d.id} type="button" onClick={() => setSelected(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-muted">
                  <FileText className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                    {d.title} {d.visibility === "private" && <PrivateMark />}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[d.category ? CATEGORIES[d.category] ?? d.category : null, d.has_file ? fileSize(d.size_bytes) : "без файла", d.expires_on ? `до ${formatDate(d.expires_on, tz)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {d.expires_on && d.expires_on < today ? <Badge tone="danger">истёк</Badge> : expiring ? <Badge tone="warning">скоро</Badge> : null}
              </button>
            );
          })}
        </Card>
      )}
      <Switch checked={archived} onChange={setArchived} label="Показать архив" />
      <p className="px-1 text-xs text-muted">Файлы не публикуются по постоянным ссылкам: скачивание — по временной ссылке после проверки доступа.</p>

      <Sheet
        open={upload !== null}
        onOpenChange={(v) => !v && setUpload(null)}
        title="Новый документ"
        footer={
          <Button block loading={create.isPending} disabled={!upload?.title.trim() || tooBig} onClick={() => create.mutate(upload!)}>
            Сохранить
          </Button>
        }
      >
        {upload && (
          <div className="space-y-3">
            <Input label="Название" value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} placeholder="Паспорт Анны" />
            {uploadsEnabled ? (
              <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-sm text-muted">
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,text/plain" className="sr-only" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null, title: upload.title || (e.target.files?.[0]?.name.replace(/\.[^.]+$/, "") ?? "") })} />
                <Upload className="size-5" />
                {upload.file ? `${upload.file.name} (${fileSize(upload.file.size)})` : `PDF, JPEG, PNG, WebP, HEIC или текст, до ${maxMb} МБ`}
              </label>
            ) : (
              <p className="rounded-2xl bg-lemon-soft p-3 text-sm text-lemon-ink">
                Прикреплять файлы пока нельзя: хранилище документов ещё не подключено. Сохраните документ без файла — напоминание о сроке действия всё равно придёт.
              </p>
            )}
            {tooBig && <p className="text-sm text-danger">Файл больше {maxMb} МБ</p>}
            <Select label="Категория" value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value })}>
              <option value="">Без категории</option>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Дата документа" type="date" value={upload.document_date} onChange={(e) => setUpload({ ...upload, document_date: e.target.value })} />
              <Input label="Действует до" type="date" value={upload.expires_on} onChange={(e) => setUpload({ ...upload, expires_on: e.target.value })} />
            </div>
            {upload.expires_on && (
              <Select label="Напомнить" value={upload.remind} onChange={(e) => setUpload({ ...upload, remind: e.target.value })}>
                <option value="">Не напоминать</option>
                <option value="7">За неделю</option>
                <option value="30">За месяц</option>
                <option value="90">За 3 месяца</option>
              </Select>
            )}
            <Textarea label="Заметки" rows={2} value={upload.notes} onChange={(e) => setUpload({ ...upload, notes: e.target.value })} />
            <VisibilityPicker value={upload.visibility} onChange={(v) => setUpload({ ...upload, visibility: v })} />
          </div>
        )}
      </Sheet>

      <Sheet open={selected !== null} onOpenChange={(v) => !v && setSelected(null)} title={selected?.title ?? ""}>
        {selected && (
          <div className="space-y-3">
            <div className="space-y-1 text-sm text-muted">
              {selected.category && <p>Категория: {CATEGORIES[selected.category] ?? selected.category}</p>}
              {selected.document_date && <p>Дата: {formatDate(selected.document_date, tz)}</p>}
              {selected.expires_on && <p>Действует до: {formatDate(selected.expires_on, tz)}</p>}
              {selected.original_filename && <p>Файл: {selected.original_filename} ({fileSize(selected.size_bytes)})</p>}
              {selected.notes && <p className="whitespace-pre-wrap text-text">{selected.notes}</p>}
            </div>
            <div className="grid gap-2">
              {selected.has_file && (
                <Button icon={<Download className="size-4" />} loading={download.isPending} onClick={() => download.mutate(selected)}>
                  Скачать
                </Button>
              )}
              <Button variant="secondary" icon={<Archive className="size-4" />} onClick={() => archive.mutate(selected)}>
                {selected.archived_at ? "Вернуть из архива" : "В архив"}
              </Button>
              {(selected.created_by === userId || role !== "member") && (
                <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
                  Удалить
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        danger
        title="Удалить документ?"
        description="Документ и его файл будут удалены без возможности восстановления."
        confirmLabel="Удалить навсегда"
        loading={remove.isPending}
        onConfirm={() => selected && remove.mutate(selected)}
      />
    </div>
  );
}
