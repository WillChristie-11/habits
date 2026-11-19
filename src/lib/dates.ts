// All dates are local calendar days as 'YYYY-MM-DD' strings.

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now: Date = new Date()): string {
  return toKey(now);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole calendar days from a to b (b - a). DST-safe. */
export function diffDays(a: string, b: string): number {
  const ua = Date.UTC(...(a.split('-').map(Number) as [number, number, number]));
  const ub = Date.UTC(...(b.split('-').map(Number) as [number, number, number]));
  return Math.round((ub - ua) / 86400000);
}

export function weekday(key: string): number {
  return fromKey(key).getDay();
}

/** Weeks run Monday → Sunday (so the Sunday-evening review closes the week). */
export function weekStart(key: string): string {
  const wd = weekday(key);
  return addDays(key, -((wd + 6) % 7));
}

export function weekDays(key: string): string[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Last 7 days ending with `key` (oldest first). */
export function last7(key: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(key, i - 6));
}

export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function prettyDate(key: string): string {
  const d = fromKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Locale-formatted clock time for 'HH:MM', e.g. "7:30 AM". */
export function formatTime(hm: string | null | undefined): string {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Local Date for a day key plus 'HH:MM'. */
export function atTime(key: string, hm: string): Date {
  const [y, mo, d] = key.split('-').map(Number);
  const [h, m] = hm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

/** "1 h 40 min", "25 min" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
