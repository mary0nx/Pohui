import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./Button";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Bottom sheet: the most comfortable pattern for forms inside Telegram on phones. */
export function Sheet({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="animate-sheet-in fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface shadow-2xl outline-none"
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Закрыть" className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && <div className="border-t border-border px-5 pb-[calc(12px+var(--safe-bottom))] pt-3">{footer}</div>}
          {!footer && <div className="h-[calc(8px+var(--safe-bottom))]" />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Подтвердить", danger, loading, onConfirm, children, confirmDisabled }: ConfirmProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="animate-fade-in fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-5 shadow-2xl outline-none">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className={cn("mt-2 text-[15px] text-muted", !description && "sr-only")}>{description ?? title}</div>
          </Dialog.Description>
          {children && <div className="mt-3">{children}</div>}
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" block onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button variant={danger ? "danger" : "primary"} block loading={loading} disabled={confirmDisabled} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
