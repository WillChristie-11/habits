// Pure helpers for the motivation sheet (feeling contrast), the Tempted? screen (cut-back
// summaries) and the Sunday recap's sleep line. Nothing here is a score or a streak.
import type { Habit, Occurrence } from '../types';
import { FEELINGS } from '../types';
import type { RecordIndex } from './schedule';
import { formatTime } from './dates';

/** Ratings needed on each side before the contrast is shown. */
export const CONTRAST_MIN = 10;

const label = (avg: number) => FEELINGS[Math.min(5, Math.max(1, Math.round(avg))) - 1];

/**
 * "Usually Good after this · days skipped: usually Meh" — feelings recorded after doing a want
 * habit vs. on days it was skipped. Null until each side has CONTRAST_MIN ratings.
 */
export function feelingContrast(h: Habit, idx: RecordIndex): string | null {
  const recs = idx.get(h.id);
  if (!recs || h.habit_kind !== 'want') return null;
  const done: number[] = [];
  const skipped: number[] = [];
  for (const r of recs.values()) {
    if (r.feeling == null) continue;
    if (r.status === 'done') done.push(r.feeling);
    else if (r.status === 'skipped') skipped.push(r.feeling);
  }
  if (done.length < CONTRAST_MIN || skipped.length < CONTRAST_MIN) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return `Usually ${label(avg(done))} after this · days skipped: usually ${label(avg(skipped))}`;
}

/** How many recent rated logs the Tempted? summary looks at. */
export const RECENT = 8;

/**
 * "Last 8 times: mostly Drained / Meh" from the follow-up feelings after a cut-back log.
 * One word when a single feeling is at least 60% of them, else the top two.
 */
export function afterFeelingSummary(occ: Occurrence[]): string | null {
  const rated = occ
    .filter((o) => o.feeling != null)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT);
  if (rated.length < 2) return null;
  const tally = new Map<number, number>();
  for (const o of rated) tally.set(o.feeling!, (tally.get(o.feeling!) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const words =
    top[0][1] / rated.length >= 0.6 || top.length === 1
      ? FEELINGS[top[0][0] - 1]
      : `${FEELINGS[top[0][0] - 1]} / ${FEELINGS[top[1][0] - 1]}`;
  return `Last ${rated.length} ${rated.length === 1 ? 'time' : 'times'}: mostly ${words}`;
}

/** The 2–3 most recent notes written after a log. */
export function recentNotes(occ: Occurrence[], n = 3): string[] {
  return occ
    .filter((o) => o.note?.trim())
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, n)
    .map((o) => o.note!.trim());
}

/** The anchor that records wake-up times: the earliest anchor with "wake" in its name. */
export function wakeAnchor(habits: Habit[]): Habit | null {
  return (
    habits
      .filter((h) => h.kind === 'anchor' && /wake/i.test(h.name))
      .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.id - b.id)[0] ?? null
  );
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/**
 * Wake times for the given days (from the Wake up anchor's record meta.wokeAt), and a range line:
 * "Woke 6:40 – 7:55 AM". Days without a time are null.
 */
export function wakeWeek(anchor: Habit | null, idx: RecordIndex, days: string[]) {
  const times = days.map((date) => {
    const t = anchor ? idx.get(anchor.id)?.get(date)?.meta?.wokeAt : null;
    return { date, time: typeof t === 'string' && /^\d\d:\d\d$/.test(t) ? t : null };
  });
  const known = times.filter((x) => x.time).map((x) => x.time!);
  if (!known.length) return { times, text: null as string | null };
  const sorted = [...known].sort((a, b) => toMin(a) - toMin(b));
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const text = lo === hi ? `Woke at ${formatTime(lo)}` : `Woke ${formatTime(lo)} – ${formatTime(hi)}`;
  return { times, text };
}

export const minutesOfDay = toMin;
