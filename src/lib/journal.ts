// Pure Journal logic: weekly review stats, when prompts are offered, resurfacing, and when a
// note to future me comes back. The Journal never affects %, rings or flags.
import type { DayState, Habit, JournalEntry, ReminderSettings } from '../types';
import { addDays, diffDays, weekDays, weekStart, weekday } from './dates';
import { feelingStats, missedTwiceRisk, progress, stateOn, timeline, toMinutes, visibleOn, type Ctx, type RecordIndex } from './schedule';
import { nudgeStart } from './reminders';

/** The weekly review opens Sunday from this time, and stays offered all Monday. */
export const REVIEW_OPENS = '17:00';
/** Resurface entries written at least this many days ago, preferring ~4 weeks. */
export const RESURFACE_MIN_AGE = 21;
const RESURFACE_TARGET_AGE = 28;

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface ReviewRow {
  habit: Habit;
  states: DayState[]; // Mon..Sun
  done: number;
  missed: number;
  /** want habits only */
  pct: number | null;
  target?: number;
  feelingAvg: number | null;
  feelingCount: number;
}

export interface WeekReview {
  sunday: string;
  days: string[];
  rows: ReviewRow[];
  /** highest average feeling this week (2+ ratings) */
  best: ReviewRow | null;
  /** want habit with the most missed days this week (at least 1) */
  mostMissed: ReviewRow | null;
  /** overall % across want habits */
  pct: number | null;
}

/** Stats for the week that ends on `sunday` (Mon–Sun). */
export function weekReview(habits: Habit[], idx: RecordIndex, ctx: Ctx, sunday: string): WeekReview {
  const days = weekDays(sunday);
  const rows: ReviewRow[] = [];
  let done = 0;
  let expected = 0;
  for (const h of habits) {
    if (h.kind !== 'habit' || !days.some((d) => visibleOn(h, idx, ctx, d))) continue;
    const tl = timeline(h, idx, days[0], days[6], ctx);
    const states = days.map((d) => tl.states.get(d) ?? 'none');
    const p = progress(h, idx, days, ctx);
    const f = feelingStats(h, idx, days);
    const avoid = h.habit_kind === 'avoid';
    rows.push({
      habit: h,
      states,
      done: states.filter((s) => s === 'done').length,
      missed: states.filter((s) => s === 'missed').length,
      pct: avoid ? null : p.pct,
      target: avoid ? undefined : p.target,
      feelingAvg: f.avg,
      feelingCount: f.count,
    });
    if (!avoid) {
      done += p.target != null ? Math.min(p.done, p.target) : p.done;
      expected += p.target != null ? p.target : p.expected;
    }
  }
  const rated = rows.filter((r) => r.feelingCount >= 2 && r.feelingAvg != null);
  const best = rated.sort((a, b) => b.feelingAvg! - a.feelingAvg! || b.feelingCount - a.feelingCount)[0] ?? null;
  // For weekly_count habits "missed" = sessions short of the target.
  const shortfall = (r: ReviewRow) => (r.target != null ? Math.max(0, r.target - r.done) : r.missed);
  const missable = rows.filter((r) => r.habit.habit_kind !== 'avoid' && shortfall(r) > 0);
  const mostMissed = missable.sort((a, b) => shortfall(b) - shortfall(a) || (a.pct ?? 0) - (b.pct ?? 0))[0] ?? null;
  return { sunday, days, rows, best, mostMissed, pct: expected ? done / expected : null };
}

/**
 * The Sunday whose week is up for review right now, or null: Sunday from 5 PM, and all of
 * Monday, unless that week's review is already written.
 */
export function reviewDue(entries: JournalEntry[], ctx: Ctx, now: Date): string | null {
  const wd = weekday(ctx.today);
  let sunday: string | null = null;
  if (wd === 0 && minutesOf(now) >= toMinutes(REVIEW_OPENS)) sunday = ctx.today;
  if (wd === 1) sunday = addDays(ctx.today, -1);
  if (!sunday) return null;
  return entries.some((e) => e.type === 'weekly' && e.date === sunday) ? null : sunday;
}

/** Daily reflection is offered once the evening nudge has started, until the day ends. */
export function reflectionOpen(r: ReminderSettings, now: Date): boolean {
  return minutesOf(now) >= toMinutes(nudgeStart(r));
}

/** All the words of an entry, for display and search. */
export function entryText(e: JournalEntry): string {
  const d = e.data;
  switch (e.type) {
    case 'intention':
    case 'note':
      return d.text ?? '';
    case 'reflection':
      return [d.wentWell, d.inTheWay].filter(Boolean).join(' · ');
    case 'weekly':
      return [d.liked, d.didntWork, d.changes].filter(Boolean).join(' · ');
  }
}

export function searchEntries(entries: JournalEntry[], q: string, habits: Habit[] = []): JournalEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((e) => {
    const habitName = e.habit_id != null ? (habits.find((h) => h.id === e.habit_id)?.name ?? '') : '';
    return `${entryText(e)} ${habitName}`.toLowerCase().includes(needle);
  });
}

/**
 * At most one old entry a week to show at the top of Journal ("4 weeks ago you wrote…"):
 * the entry closest to 28 days old among those 21+ days old, chosen for the current week.
 */
export function resurfaceFor(entries: JournalEntry[], today: string): JournalEntry | null {
  const anchor = weekStart(today); // stable for the whole week
  const old = entries.filter((e) => entryText(e).trim() && diffDays(e.date, anchor) >= RESURFACE_MIN_AGE);
  if (!old.length) return null;
  return old.sort(
    (a, b) =>
      Math.abs(diffDays(a.date, anchor) - RESURFACE_TARGET_AGE) - Math.abs(diffDays(b.date, anchor) - RESURFACE_TARGET_AGE) ||
      b.id - a.id,
  )[0];
}

export function agoText(date: string, today: string): string {
  const days = diffDays(date, today);
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * When a habit needs its note to future me: a want habit hitting "never miss twice", or an avoid
 * habit going 2+ days without a session.
 */
export function noteTrigger(h: Habit, idx: RecordIndex, ctx: Ctx, date: string = ctx.today): boolean {
  if (h.kind !== 'habit') return false;
  const c = { ...ctx, today: date };
  if (h.habit_kind !== 'avoid') return missedTwiceRisk(h, idx, c);
  if (stateOn(h, idx, date, c) !== 'pending') return false;
  const recs = idx.get(h.id);
  const lastDone = recs ? [...recs.values()].filter((r) => r.status === 'done' && r.date < date).map((r) => r.date).sort().pop() : undefined;
  const since = lastDone ?? addDays(h.created_at.slice(0, 10), -1);
  return diffDays(since, date) > 2; // 2+ full days without a session before today
}

/**
 * The note to show for a habit on `date`: its latest note, once, on the first day the trigger
 * fires (that day's `triggeredOn` marks it delivered).
 */
export function noteFor(h: Habit, entries: JournalEntry[], idx: RecordIndex, ctx: Ctx, date: string = ctx.today): JournalEntry | null {
  const notes = entries.filter((e) => e.type === 'note' && e.habit_id === h.id && e.data.text?.trim());
  if (!notes.length) return null;
  const latest = notes.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
  if (latest.data.triggeredOn) return latest.data.triggeredOn === date ? latest : null;
  // "The next time": only days after the note was written count.
  if (date <= latest.date) return null;
  return noteTrigger(h, idx, ctx, date) ? latest : null;
}
