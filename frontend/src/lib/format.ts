/** Display formatting. Amounts arrive as decimal strings; Number() is used only for display. */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: string | number | null | undefined, currency: string, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const value = Number(amount ?? 0);
  const key = `${currency}|${opts.compact ? 1 : 0}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    });
    moneyFormatters.set(key, fmt);
  }
  const text = fmt.format(Math.abs(value));
  if (opts.sign) return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
  return value < 0 ? `−${text}` : text;
}

export function formatQty(q: string | null, unit: string | null): string {
  if (!q) return unit ?? "";
  const n = Number(q);
  const text = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  return unit ? `${text} ${unit}` : text;
}

export function formatDate(value: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
  const d = typeof value === "string" ? (value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value)) : value;
  return new Intl.DateTimeFormat("ru-RU", { timeZone: typeof value === "string" && value.length === 10 ? "UTC" : timeZone, ...opts }).format(d);
}

export function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatMonth(month: string): string {
  const s = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month.slice(0, 7)}-01T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1).replace(" г.", "");
}

export function relativeDay(date: string, today: string): string | null {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff === -1) return "Вчера";
  return null;
}

export function timeAgo(value: string): string {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? "вчера" : `${days} дн назад`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
