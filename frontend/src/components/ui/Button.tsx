import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg font-bold shadow-[0_8px_18px_-8px_color-mix(in_srgb,var(--accent)_75%,transparent)] hover:brightness-[1.03] active:shadow-[var(--shadow-press)]",
  secondary: "bg-surface text-text font-semibold shadow-card hover:bg-surface-2",
  soft: "bg-accent-soft text-accent-strong font-semibold hover:brightness-[0.98]",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-danger text-white font-semibold hover:brightness-95 dark:text-[#2b0f0b]",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-full gap-1.5",
  md: "h-11 px-5 text-[15px] rounded-full gap-2",
  lg: "h-12 px-6 text-base rounded-full gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "press inline-flex select-none items-center justify-center font-medium disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("press inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
