import { Copy, ExternalLink, Share2 } from "lucide-react";
import { useMemo } from "react";

import { useFamily } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, ErrorState, LoadingBlock, Section, useToast } from "@/components/ui";
import { useDailyContent, useToday } from "@/features/daily/api";
import type { Season } from "@/features/daily/content";
import { THEME_LABELS } from "@/features/daily/labels";
import { pageFor } from "@/features/daily/schedule";
import { buildWidgetScript, SCRIPTABLE_APP_STORE, WIDGET_DAYS } from "@/features/daily/widget";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/time";
import { openExternal } from "@/lib/telegram";

const FILE_NAME = "Листочек дня.js";
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const LOOK: Record<Season, { paper: string; ink: string }> = {
  spring: { paper: "bg-mint-soft", ink: "text-mint-ink" },
  summer: { paper: "bg-lemon-soft", ink: "text-lemon-ink" },
  autumn: { paper: "bg-peach-soft", ink: "text-peach-ink" },
  winter: { paper: "bg-lavender-soft", ink: "text-lavender-ink" },
};

/** «Листочек дня» on the iPhone home screen or lock screen through the Scriptable app. */
export function WidgetPage() {
  const { familyId, tz } = useFamily();
  const toast = useToast();
  const date = useToday(tz);
  const content = useDailyContent();
  // Built before the tap: iOS lets a page write to the clipboard only right inside the tap.
  const script = useMemo(
    () => (content.data ? buildWidgetScript({ content: content.data, seed: familyId, from: date, timeZone: tz, appUrl: `${window.location.origin}/` }) : null),
    [content.data, familyId, date, tz],
  );
  const page = content.data ? pageFor(content.data, familyId, date) : null;

  if (content.isPending) return <LoadingBlock />;
  if (content.isError || !script || !page) return <ErrorState error={content.error ?? new Error("Не удалось загрузить фразы")} onRetry={() => content.refetch()} />;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.show("Скрипт скопирован — вставьте его в Scriptable");
    } catch {
      toast.show("Не получилось скопировать. Попробуйте «Сохранить файлом».", "error");
    }
  };
  const file = typeof File !== "undefined" ? new File([script], FILE_NAME, { type: "text/javascript" }) : null;
  const canShareFile = Boolean(file && navigator.canShare?.({ files: [file] }));
  const shareFile = async () => {
    try {
      await navigator.share({ files: [file!], title: FILE_NAME });
    } catch {
      /* closed by the user */
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Виджет" back="/profile" art="calendar" />
      <Card className="space-y-3">
        <p className="font-semibold">«Листочек дня» на экране iPhone</p>
        <p className="text-sm text-muted">Фраза дня на экране «Домой» или на экране блокировки iPhone — та же, что на главной Family OS, и одна на всю семью. Нажатие на виджет открывает Family OS.</p>
        <div className={cn("rounded-[22px] p-4", LOOK[page.season].paper)} aria-label="Так будет выглядеть виджет">
          <p className={cn("flex items-baseline gap-2", LOOK[page.season].ink)}>
            <span className="text-2xl font-black">{Number(date.slice(8))}</span>
            <span className="text-xs font-semibold">
              {MONTHS[Number(date.slice(5, 7)) - 1]} · {THEME_LABELS[page.theme]}
            </span>
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-snug">{page.text}</p>
          <p className={cn("mt-3 text-[10px] font-medium opacity-80", LOOK[page.season].ink)}>Family OS · Листочек дня</p>
        </div>
      </Card>

      <Section title="Как добавить (один раз, около 2 минут)">
        <Card className="space-y-4 text-sm">
          <div className="space-y-2">
            <p>
              <b>1.</b> Установите бесплатное приложение <b>Scriptable</b> из App Store: оно умеет показывать свои виджеты. iPhone не даёт сайтам и Telegram-приложениям ставить виджеты напрямую.
            </p>
            <Button variant="secondary" icon={<ExternalLink className="size-4" />} onClick={() => openExternal(SCRIPTABLE_APP_STORE)}>
              Scriptable в App Store
            </Button>
          </div>
          <div className="space-y-2">
            <p>
              <b>2.</b> Скопируйте скрипт виджета:
            </p>
            <div className="grid gap-2">
              <Button icon={<Copy className="size-4" />} onClick={copy}>
                Скопировать скрипт
              </Button>
              {canShareFile && (
                <Button variant="ghost" icon={<Share2 className="size-4" />} onClick={shareFile}>
                  Сохранить файлом (в «Файлы» → iCloud Drive → Scriptable)
                </Button>
              )}
            </div>
          </div>
          <p>
            <b>3.</b> Откройте Scriptable → <b>«+»</b> вверху справа → нажмите на пустое поле и выберите «Вставить» → вверху нажмите на название «Untitled Script» и назовите <b>«Листочек дня»</b> → «Done». Можно нажать ▶ внизу: появится пример виджета.
          </p>
          <p>
            <b>4.</b> На экране «Домой» долго нажмите на пустое место → «Изменить» → <b>«Добавить виджет»</b> → найдите <b>Scriptable</b> → выберите размер (маленький, средний или большой) → «Добавить виджет».
          </p>
          <p>
            <b>5.</b> Пока значки покачиваются, нажмите на новый виджет → в поле <b>Script</b> выберите «Листочек дня». Поле «When Interacting» можно не трогать: нажатие на виджет и так откроет Family OS. Нажмите мимо карточки, затем «Готово».
          </p>
          <p className="text-muted">
            На экран блокировки: долго нажмите на экран блокировки → «Настроить» → «Экран блокировки» → поле виджетов → Scriptable → выберите тот же скрипт.
          </p>
        </Card>
      </Section>
      <p className="px-1 text-xs text-muted">
        В скрипте страницы на {WIDGET_DAYS} дней — до {formatDate(addDays(date, WIDGET_DAYS - 1), tz, { day: "numeric", month: "long", year: "numeric" })}. Он работает без интернета и без входа: внутри только фразы, никаких ключей и личных данных. Когда листочки закончатся, виджет напомнит скопировать новый скрипт. Супруге — то же самое на её телефоне: фразы у вас будут одинаковые.
      </p>
    </div>
  );
}
