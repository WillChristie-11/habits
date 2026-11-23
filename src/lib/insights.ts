// Pure helpers for the motivation sheet (feeling contrast), the Tempted? screen (cut-back
// summaries) and the Sunday recap's sleep line. Nothing here is a score or a streak.
import type { Habit, Occurrence } from '../types';
import { FEELINGS } from '../types';
import { stateOn, visibleOn, type Ctx, type RecordIndex } from './schedule';
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

// --- Expected vs felt (avoid sessions) ---------------------------------------------------------

/** The 1–5 scale used before ("How heavy does this feel right now?") and after an avoid session. */
export const HEAVINESS = ['Easy', 'Light', 'Meh', 'Heavy', 'Dread'] as const;

export type FeltVs = 'lighter' | 'same' | 'heavier';

/** Worked out, never stored: how the session felt compared with how heavy it looked before. */
export function feltVs(dreadBefore: number, feltScore: number): FeltVs {
  return feltScore < dreadBefore ? 'lighter' : feltScore > dreadBefore ? 'heavier' : 'same';
}

const score = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;

export interface ExpectedFelt {
  date: string;
  expected: number;
  felt: number;
}

/**
 * Sessions with both numbers (meta.dreadBefore and meta.feltScore), oldest first, the last `n`.
 * `latest` drives "Expected 4, felt like 2"; `lighter` counts sessions that felt lighter than
 * expected (used later by the Dread vs reality nudge). Never shown as a count or % for the habit.
 */
export function expectedVsFelt(h: Pick<Habit, 'id'>, idx: RecordIndex, n = 9) {
  const recs = idx.get(h.id);
  const all: ExpectedFelt[] = [];
  if (recs) {
    for (const r of recs.values()) {
      const expected = score(r.meta?.dreadBefore);
      const felt = score(r.meta?.feltScore);
      if (expected != null && felt != null) all.push({ date: r.date, expected, felt });
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  const pairs = all.slice(-n);
  return {
    pairs,
    latest: pairs[pairs.length - 1] ?? null,
    lighter: pairs.filter((p) => p.felt < p.expected).length,
    rated: pairs.length,
  };
}

/** "Expected 4, felt like 2" */
export const expectedFeltText = (p: Pick<ExpectedFelt, 'expected' | 'felt'>) =>
  `Expected ${p.expected}, felt like ${p.felt}`;

/** Lines you asked to be reminded of on a hard day (meta.keepLine with a note), newest first. */
export function keptLines(h: Pick<Habit, 'id'>, idx: RecordIndex): { date: string; text: string }[] {
  const recs = idx.get(h.id);
  if (!recs) return [];
  return [...recs.values()]
    .filter((r) => r.meta?.keepLine === true && typeof r.meta?.note === 'string' && r.meta.note.trim())
    .map((r) => ({ date: r.date, text: String(r.meta!.note).trim() }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// --- Today's door ------------------------------------------------------------------------------

export type DoorState = 'open' | 'opened' | 'not_today';

/**
 * The one avoid habit Today's door card offers: among avoid habits due today, the one started
 * least this week (days before today, so the pick holds once it's opened), ties going to the one
 * not started for longest. `state` collapses the card after a session ('opened') or a skip.
 * Null when no avoid habit is due today.
 */
export function doorPick(
  habits: Habit[],
  idx: RecordIndex,
  ctx: Ctx,
  weekStartKey: string,
): { habit: Habit; state: DoorState } | null {
  const due = habits.filter(
    (h) =>
      h.kind === 'habit' &&
      h.habit_kind === 'avoid' &&
      visibleOn(h, idx, ctx, ctx.today) &&
      stateOn(h, idx, ctx.today, ctx) !== 'paused',
  );
  if (!due.length) return null;
  const started = (h: Habit) => {
    const recs = [...(idx.get(h.id)?.values() ?? [])].filter((r) => r.status === 'done' && r.date < ctx.today);
    return {
      week: recs.filter((r) => r.date >= weekStartKey).length,
      last: recs.reduce((m, r) => (r.date > m ? r.date : m), ''),
    };
  };
  const scored = due.map((h) => ({ h, ...started(h) }));
  scored.sort((a, b) => a.week - b.week || a.last.localeCompare(b.last) || a.h.order - b.h.order || a.h.id - b.h.id);
  const habit = scored[0].h;
  const s = stateOn(habit, idx, ctx.today, ctx);
  return { habit, state: s === 'done' ? 'opened' : s === 'skipped' ? 'not_today' : 'open' };
}
