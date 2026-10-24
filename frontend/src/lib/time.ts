/** Time-zone helpers without external libraries (Intl based, DST-correct). */

function parts(date: Date, timeZone: string): Record<string, number> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** Offset (minutes) of `timeZone` from UTC at the given instant. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Convert a wall-clock date ("2026-10-31") and time ("15:00") in `timeZone` to ISO with offset. */
export function zonedToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let offset = zoneOffsetMinutes(new Date(guess), timeZone);
  offset = zoneOffsetMinutes(new Date(guess - offset * 60000), timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${pad(hh!)}:${pad(mm!)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Local date string (YYYY-MM-DD) of an instant in `timeZone`. */
export function zonedDate(instant: Date | string, timeZone: string): string {
  const p = parts(typeof instant === "string" ? new Date(instant) : instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Local time string (HH:MM) of an instant in `timeZone`. */
export function zonedTime(instant: Date | string, timeZone: string): string {
  const p = parts(typeof instant === "string" ? new Date(instant) : instant, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function todayIn(timeZone: string): string {
  return zonedDate(new Date(), timeZone);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return dt.toISOString().slice(0, 7);
}

/** Monday-based weekday index (0 = Monday) of a YYYY-MM-DD date. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}
