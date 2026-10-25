import { ChevronDown } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const control =
  "w-full rounded-2xl border border-border bg-surface px-4 text-text shadow-[var(--shadow-press)] placeholder:text-subtle transition-[border-color,box-shadow] duration-200 focus:border-[var(--focus)] focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--focus)_18%,transparent)] disabled:opacity-60";

export function Field({ label, error, hint, children, htmlFor }: { label?: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block px-1 text-sm font-semibold text-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="px-1 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="px-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const input = <input ref={ref} id={inputId} aria-invalid={Boolean(error)} className={cn(control, "h-12", error && "border-danger", className)} {...rest} />;
  if (!label && !error && !hint) return input;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={inputId}>
      {input}
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, error, hint, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={inputId}>
      <textarea ref={ref} id={inputId} aria-invalid={Boolean(error)} className={cn(control, "min-h-24 py-3", error && "border-danger", className)} {...rest} />
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, className, id, children, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={inputId}>
      <div className="relative">
        <select ref={ref} id={inputId} className={cn(control, "h-12 appearance-none pr-8", className)} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      </div>
    </Field>
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-12 items-center justify-between gap-3", disabled && "opacity-60")}>
      <span>
        <span className="block text-[15px]">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("press relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200", checked ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border")}
      >
        <span
          className="absolute left-1 top-1 size-6 rounded-full bg-white shadow-md transition-transform duration-300 ease-[var(--ease-spring)]"
          style={{ transform: checked ? "translateX(20px)" : "none" }}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div role="tablist" className={cn("relative flex rounded-full bg-surface-2 p-1", className)}>
      {/* Sliding pill behind the active tab. */}
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-full bg-surface shadow-card transition-transform duration-300 ease-[var(--ease-out)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative z-10 h-9 flex-1 truncate rounded-full px-2 text-sm font-semibold transition-colors duration-200", value === o.value ? "text-text" : "text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = container.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (active && container.current) {
      container.current.scrollTo({ left: active.offsetLeft - 16, behavior: "smooth" });
    }
  }, [value]);
  return (
    <div ref={container} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "press h-9 shrink-0 rounded-full border px-4 text-sm font-semibold",
            value === o.value ? "border-transparent bg-accent text-accent-fg shadow-card" : "border-border bg-surface text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
