import { Store, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

import { artSrc, type TxIcon } from "./registry";

/**
 * Round transaction icon: the shop's logo or a category illustration (both local SVGs).
 * If a file cannot load it falls back step by step — logo → category illustration → built-in
 * icon — so a broken image or an empty circle is never shown.
 */
export function MerchantIcon({ icon, refund, size = 44, className }: { icon: TxIcon; refund?: boolean; size?: number; className?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [icon.src]);
  const src = step === 0 ? icon.src : step === 1 && icon.type === "logo" ? artSrc(icon.fallback) : null;
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} data-icon={src ?? "builtin"} aria-hidden>
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full rounded-full object-contain"
          onError={() => setStep((s) => (s === 0 && icon.type === "logo" ? 1 : 2))}
        />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-surface-2 text-muted">
          <Store className="size-[45%]" />
        </span>
      )}
      {refund && (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full bg-surface text-income shadow-card">
          <Undo2 className="size-3" strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}
