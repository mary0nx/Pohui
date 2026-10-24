import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, History, Loader2, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { Badge, Button, Card, IconButton, Sheet, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { haptic, isInsideTelegram } from "@/lib/telegram";
import type { AiMessage, AiStatus, ChatResponse, Conversation, Proposal } from "@/types/api";

interface Bubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  actions?: ChatResponse["actions"];
  error?: boolean;
}

const SUGGESTIONS = ["Сколько мы потратили на продукты в этом месяце?", "Добавь молоко, хлеб и яйца в покупки", "Какие счета нужно оплатить на этой неделе?", "Какие задачи остались невыполненными?", "Составь меню на три дня с учётом продуктов дома"];

export function AssistantPage() {
  const { f, familyId } = useFamily();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: ["ai-status", familyId], queryFn: () => api<AiStatus>(f("/ai/status")) });
  const conversations = useQuery({ queryKey: ["ai-conversations", familyId], queryFn: () => api<Conversation[]>(f("/ai/conversations")), enabled: historyOpen });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles]);

  const send = useMutation({
    mutationFn: (message: string) => api<ChatResponse>(f("/ai/chat"), { body: { message, conversation_id: conversationId } }),
    onMutate: (message) => {
      setBubbles((b) => [...b, { id: `u-${Date.now()}`, role: "user", content: message }]);
      setText("");
    },
    onSuccess: (r) => {
      setConversationId(r.conversation_id);
      setBubbles((b) => [...b, { id: `a-${Date.now()}`, role: "assistant", content: r.reply, proposals: r.proposals, actions: r.actions }]);
      if (r.actions.some((a) => a.status === "executed")) {
        haptic("success");
        void qc.invalidateQueries();
      }
      void qc.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e, message) => {
      setBubbles((b) => [...b, { id: `e-${Date.now()}`, role: "assistant", content: errorMessage(e), error: true }]);
      setText(message);
    },
  });

  const resolve = useMutation({
    mutationFn: ({ p, confirm }: { p: Proposal; confirm: boolean }) => api<Proposal>(f(`/ai/proposals/${p.id}/${confirm ? "confirm" : "cancel"}`), { method: "POST" }),
    onSuccess: (updated) => {
      setBubbles((b) => b.map((x) => ({ ...x, proposals: x.proposals?.map((p) => (p.id === updated.id ? updated : p)) })));
      if (updated.status === "executed") {
        haptic("success");
        toast.show("Выполнено");
        void qc.invalidateQueries();
      } else if (updated.status === "failed") toast.show(updated.error ?? "Не выполнено", "error");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const openConversation = async (c: Conversation) => {
    const msgs = await api<AiMessage[]>(f(`/ai/conversations/${c.id}/messages`));
    setConversationId(c.id);
    setBubbles(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    setHistoryOpen(false);
  };

  const unavailable = status.data && (!status.data.available || !status.data.enabled_for_family);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="w-20">
          {!isInsideTelegram() && (
            <button type="button" onClick={() => navigate("/")} className="text-sm font-medium text-accent">
              Назад
            </button>
          )}
        </div>
        <p className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="size-4 text-accent" /> Ассистент
        </p>
        <div className="flex">
          <IconButton label="История диалогов" onClick={() => setHistoryOpen(true)}>
            <History className="size-5" />
          </IconButton>
          <IconButton label="Новый диалог" onClick={() => (setConversationId(null), setBubbles([]))}>
            <MessageSquarePlus className="size-5" />
          </IconButton>
        </div>
      </header>

      <div className="flex-1 space-y-3 py-4">
        {unavailable && (
          <Card className="border-warning/40 bg-warning-soft text-sm">
            <p className="font-semibold text-warning">AI-ассистент недоступен</p>
            <p className="mt-1 text-muted">{status.data?.reason}. Остальные разделы работают как обычно.</p>
            {status.data?.available && (
              <Link to="/profile/ai" className="mt-2 inline-block font-medium text-accent">
                Настройки AI
              </Link>
            )}
          </Card>
        )}
        {bubbles.length === 0 && !unavailable && (
          <div className="space-y-3 pt-6">
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-accent-soft text-accent">
                <Sparkles className="size-7" />
              </span>
              <p className="mt-3 font-semibold">Чем помочь?</p>
              <p className="text-sm text-muted">Я вижу только то, что доступно вам, и прошу подтверждение для важных действий.</p>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send.mutate(s)} className="block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm transition hover:border-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {bubbles.map((b) => (
          <div key={b.id} className={cn("flex flex-col", b.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[15px]",
                b.role === "user" ? "rounded-br-lg bg-accent text-accent-fg" : b.error ? "rounded-bl-lg bg-danger-soft text-danger" : "rounded-bl-lg bg-surface shadow-card",
              )}
            >
              {b.content}
            </div>
            {b.actions?.filter((a) => a.status === "executed").map((a, i) => (
              <span key={i} className="mt-1 inline-flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="size-3.5" /> {a.summary}
              </span>
            ))}
            {b.proposals?.map((p) => <ProposalCard key={p.id} p={p} busy={resolve.isPending && resolve.variables?.p.id === p.id} onResolve={(confirm) => resolve.mutate({ p, confirm })} />)}
          </div>
        ))}
        {send.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Думаю…
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !send.isPending) send.mutate(text.trim());
        }}
      >
        <textarea
          aria-label="Сообщение ассистенту"
          rows={1}
          maxLength={2000}
          value={text}
          disabled={Boolean(unavailable)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !send.isPending) send.mutate(text.trim());
            }
          }}
          placeholder="Спросите что-нибудь…"
          className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border border-border bg-surface px-4 py-3 focus:border-accent focus:outline-none"
        />
        <Button type="submit" aria-label="Отправить" className="size-12 shrink-0 rounded-full px-0" disabled={!text.trim() || Boolean(unavailable)} loading={send.isPending}>
          {!send.isPending && <Send className="size-5" />}
        </Button>
      </form>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="Диалоги">
        <ul className="divide-y divide-border">
          {(conversations.data ?? []).map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full py-3 text-left" onClick={() => openConversation(c)}>
                <p className="truncate text-[15px]">{c.title ?? "Без названия"}</p>
                <p className="text-xs text-muted">
                  {c.channel === "bot" ? "из Telegram-бота · " : ""}
                  {timeAgo(c.updated_at)}
                </p>
              </button>
            </li>
          ))}
          {conversations.data?.length === 0 && <p className="py-4 text-sm text-muted">Диалогов пока нет.</p>}
        </ul>
      </Sheet>
    </div>
  );
}

function ProposalCard({ p, busy, onResolve }: { p: Proposal; busy: boolean; onResolve: (confirm: boolean) => void }) {
  const pending = p.status === "pending";
  return (
    <Card className="mt-2 w-[85%] border-accent/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{p.summary}</p>
        {!pending && (
          <Badge tone={p.status === "executed" ? "success" : p.status === "failed" ? "danger" : "neutral"}>
            {p.status === "executed" ? "выполнено" : p.status === "failed" ? "ошибка" : p.status === "cancelled" ? "отменено" : p.status === "expired" ? "истекло" : p.status}
          </Badge>
        )}
      </div>
      {p.details.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
          {p.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {p.error && <p className="mt-1.5 text-sm text-danger">{p.error}</p>}
      {pending && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" block icon={<X className="size-4" />} disabled={busy} onClick={() => onResolve(false)}>
            Отмена
          </Button>
          <Button size="sm" block icon={<Check className="size-4" />} loading={busy} onClick={() => onResolve(true)}>
            Подтвердить
          </Button>
        </div>
      )}
    </Card>
  );
}
