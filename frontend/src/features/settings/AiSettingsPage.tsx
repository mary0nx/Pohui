import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateMark, VisibilityPicker } from "@/components/Visibility";
import { Button, Card, ErrorState, IconButton, LoadingBlock, ProgressBar, Section, Sheet, Switch, Textarea, useToast } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import type { AiStatus, Conversation, Family, Memory, Visibility } from "@/types/api";

export function AiSettingsPage() {
  const { f, familyId, family, role } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: ["ai-status", familyId], queryFn: () => api<AiStatus>(f("/ai/status")) });
  const memories = useQuery({ queryKey: ["ai-memories", familyId], queryFn: () => api<Memory[]>(f("/ai/memories")) });
  const conversations = useQuery({ queryKey: ["ai-conversations", familyId], queryFn: () => api<Conversation[]>(f("/ai/conversations")) });
  const log = useQuery({ queryKey: ["ai-actions", familyId], queryFn: () => api<{ action: string; summary: string | null; created_at: string }[]>(f("/ai/actions")) });
  const [memForm, setMemForm] = useState<{ id?: string; content: string; visibility: Visibility } | null>(null);
  const [summary, setSummary] = useState<{ id: string; content: string } | null>(null);
  const isAdmin = role !== "member";

  const invalidate = (k: string) => qc.invalidateQueries({ queryKey: [k] });
  const saveMem = useMutation({
    mutationFn: (v: NonNullable<typeof memForm>) => (v.id ? api(f(`/ai/memories/${v.id}`), { method: "PATCH", body: { content: v.content } }) : api(f("/ai/memories"), { body: v })),
    onSuccess: async () => (setMemForm(null), await invalidate("ai-memories")),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const delMem = useMutation({ mutationFn: (id: string) => api(f(`/ai/memories/${id}`), { method: "DELETE" }), onSuccess: () => invalidate("ai-memories") });
  const saveSummary = useMutation({
    mutationFn: (v: NonNullable<typeof summary>) => api(f(`/ai/conversations/${v.id}`), { method: "PATCH", body: { content: v.content } }),
    onSuccess: async () => (setSummary(null), await invalidate("ai-conversations")),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const delConv = useMutation({ mutationFn: (id: string) => api(f(`/ai/conversations/${id}`), { method: "DELETE" }), onSuccess: () => invalidate("ai-conversations") });
  const patch = useMutation({
    mutationFn: (body: Partial<Family>) => api(f(""), { method: "PATCH", body }),
    onSuccess: () => Promise.all([invalidate("family"), invalidate("ai-status")]),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="AI-ассистент" back="/profile" />
      {status.isPending ? (
        <LoadingBlock rows={1} />
      ) : status.isError ? (
        <ErrorState error={status.error} />
      ) : (
        <Card className="space-y-3">
          <p className="text-sm">{status.data.available ? "AI подключён на сервере." : "AI не настроен на сервере: нужны OPENAI_API_KEY и AI_MODEL. Остальные функции работают без него."}</p>
          <div>
            <p className="mb-1 text-xs text-muted">
              Ваши запросы сегодня: {status.data.requests_today} из {status.data.requests_limit}
            </p>
            <ProgressBar value={(status.data.requests_today / status.data.requests_limit) * 100} />
          </div>
          {isAdmin && family && (
            <>
              <Switch label="Включить AI для семьи" checked={family.ai_enabled} onChange={(v) => patch.mutate({ ai_enabled: v })} />
              <Switch label="Простые команды без подтверждения" checked={family.ai_auto_execute} onChange={(v) => patch.mutate({ ai_auto_execute: v })} description="Удаление и важные изменения всегда требуют подтверждения" />
            </>
          )}
        </Card>
      )}

      <Section title="Долгосрочная память" action={<Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setMemForm({ content: "", visibility: "family" })}>Добавить</Button>}>
        <Card className="divide-y divide-border p-0">
          {(memories.data ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted">Ассистент запоминает предпочтения только с вашего подтверждения.</p>}
          {(memories.data ?? []).map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-4 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left text-[15px]" onClick={() => setMemForm({ id: m.id, content: m.content, visibility: m.visibility })}>
                {m.content} {m.visibility === "private" && <PrivateMark />}
              </button>
              <IconButton label="Удалить" onClick={() => delMem.mutate(m.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Мои диалоги и сводки">
        <Card className="divide-y divide-border p-0">
          {(conversations.data ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted">Диалогов пока нет. Партнёр ваши диалоги не видит.</p>}
          {(conversations.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-4 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSummary({ id: c.id, content: c.summary ?? "" })}>
                <p className="truncate text-[15px]">{c.title ?? "Диалог"}</p>
                <p className="truncate text-xs text-muted">{c.summary ? `Сводка: ${c.summary}` : timeAgo(c.updated_at)}</p>
              </button>
              <IconButton label="Удалить диалог" onClick={() => delConv.mutate(c.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Журнал действий AI">
        <Card className="space-y-2">
          {(log.data ?? []).length === 0 && <p className="text-sm text-muted">Действий пока не было.</p>}
          {(log.data ?? []).slice(0, 20).map((a, i) => (
            <p key={i} className="text-sm">
              {a.summary ?? a.action} <span className="text-xs text-subtle">· {timeAgo(a.created_at)}</span>
            </p>
          ))}
        </Card>
      </Section>

      <Sheet open={memForm !== null} onOpenChange={(v) => !v && setMemForm(null)} title="Предпочтение" footer={<Button block loading={saveMem.isPending} disabled={(memForm?.content.trim().length ?? 0) < 3} onClick={() => saveMem.mutate(memForm!)}>Сохранить</Button>}>
        {memForm && (
          <div className="space-y-3">
            <Textarea aria-label="Текст" rows={3} value={memForm.content} onChange={(e) => setMemForm({ ...memForm, content: e.target.value })} placeholder="Например: по пятницам ужинаем вне дома" />
            {!memForm.id && <VisibilityPicker value={memForm.visibility} onChange={(v) => setMemForm({ ...memForm, visibility: v })} />}
          </div>
        )}
      </Sheet>
      <Sheet open={summary !== null} onOpenChange={(v) => !v && setSummary(null)} title="Сводка диалога" description="Ассистент использует её как контекст" footer={<Button block loading={saveSummary.isPending} disabled={(summary?.content.trim().length ?? 0) < 3} onClick={() => saveSummary.mutate(summary!)}>Сохранить</Button>}>
        {summary && <Textarea aria-label="Сводка" rows={6} value={summary.content} onChange={(e) => setSummary({ ...summary, content: e.target.value })} />}
      </Sheet>
    </div>
  );
}
