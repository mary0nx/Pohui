import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "react-router";

import { api } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, EmptyState, ErrorState, LoadingBlock } from "@/components/ui";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import type { NotificationItem } from "@/types/api";

export function InboxPage() {
  const { familyId } = useFamily();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inbox", familyId], queryFn: () => api<{ items: NotificationItem[]; unread: number }>("/notifications") });
  const readAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["inbox"] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]),
  });
  const read = (n: NotificationItem) => !n.read_at && api(`/notifications/${n.id}/read`, { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["dashboard"] }));
  return (
    <div className="space-y-3">
      <PageHeader
        title="Уведомления"
        back="/"
        action={
          (q.data?.unread ?? 0) > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => readAll.mutate()}>
              Прочитать все
            </Button>
          ) : undefined
        }
      />
      {q.isPending ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell className="size-6" />} title="Уведомлений нет" text="Здесь появятся напоминания о событиях, платежах и задачах." />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {q.data.items.map((n) => {
            const body = (
              <div className={cn("px-4 py-3", !n.read_at && "bg-accent-soft/40")}>
                <p className="text-[15px] font-medium">{n.title}</p>
                {n.body && <p className="whitespace-pre-wrap text-sm text-muted">{n.body}</p>}
                <p className="mt-0.5 text-xs text-subtle">{timeAgo(n.scheduled_for)}</p>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => read(n)} className="block">
                {body}
              </Link>
            ) : (
              <button key={n.id} type="button" onClick={() => read(n)} className="block w-full text-left">
                {body}
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
