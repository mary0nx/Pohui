import { useMutation } from "@tanstack/react-query";
import { Archive, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { api, errorMessage } from "@/api/client";
import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingBlock, Sheet, Switch, useToast } from "@/components/ui";
import type { ShoppingList } from "@/types/api";

import { useLists, useShoppingInvalidate } from "./api";

export function ShoppingListsPage() {
  const { f } = useFamily();
  const [archived, setArchived] = useState(false);
  const lists = useLists(archived);
  const invalidate = useShoppingInvalidate();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (n: string) => api<ShoppingList>(f("/shopping/lists"), { body: { name: n } }),
    onSuccess: async (l) => {
      await invalidate();
      setName(null);
      navigate(`/home/shopping/${l.id}`);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  return (
    <div className="space-y-3">
      <PageHeader
        title="Покупки"
        back="/home"
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setName("")}>
            Список
          </Button>
        }
      />
      {lists.isPending ? (
        <LoadingBlock />
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => lists.refetch()} />
      ) : lists.data.length === 0 ? (
        <Card>
          <EmptyState icon={<ShoppingCart className="size-6" />} title="Списков пока нет" action={<Button onClick={() => setName("")}>Создать список</Button>} />
        </Card>
      ) : (
        lists.data.map((l) => (
          <Link key={l.id} to={`/home/shopping/${l.id}`}>
            <Card className="flex items-center justify-between transition active:scale-[0.99]">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {l.name} {l.archived_at && <Archive className="size-4 text-subtle" />}
                </p>
                <p className="text-sm text-muted">
                  {l.items_needed} из {l.items_total} нужно купить
                </p>
              </div>
              {l.items_needed > 0 && <Badge tone="accent">{l.items_needed}</Badge>}
            </Card>
          </Link>
        ))
      )}
      <Switch checked={archived} onChange={setArchived} label="Показать архив" />
      <Sheet
        open={name !== null}
        onOpenChange={(v) => !v && setName(null)}
        title="Новый список"
        footer={
          <Button block loading={create.isPending} disabled={!name?.trim()} onClick={() => create.mutate(name!.trim())}>
            Создать
          </Button>
        }
      >
        <Input label="Название" autoFocus placeholder="Дача, праздник, хозтовары…" value={name ?? ""} onChange={(e) => setName(e.target.value)} />
      </Sheet>
    </div>
  );
}
