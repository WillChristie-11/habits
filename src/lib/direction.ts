// Direction (Sunday recap additions and the monthly horizon). Pure rules; tested.
import type { Habit } from '../types';
import { addDays, weekday } from './dates';
import type { RecordIndex } from './schedule';
import { keptLines } from './insights';
import { REASONS, type NotToday, type NotTodayReason } from './notToday';

export type WeekOutcome = 'happened' | 'partly' | 'not_yet';
export const OUTCOMES: { key: WeekOutcome; label: string }[] = [
  { key: 'happened', label: 'It happened' },
  { key: 'partly', label: 'Partly' },
  { key: 'not_yet', label: 'Not yet' },
];
export const isOutcome = (v: unknown): v is WeekOutcome => OUTCOMES.some((o) => o.key === v);

const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

/**
 * WHAT YOU FACED: avoid-habit sessions this week ("You went through the door N times"), per
 * habit, with the average expected vs felt where both were rated.
 */
export function facedThisWeek(habits: Habit[], idx: RecordIndex, days: string[]) {
  const per = habits
    .filter((h) => h.kind === 'habit' && h.habit_kind === 'avoid')
    .map((h) => {
      const recs = days.map((d) => idx.get(h.id)?.get(d)).filter((r) => r?.status === 'done');
      const rated = recs.filter(
        (r) => typeof r?.meta?.dreadBefore === 'number' && typeof r?.meta?.feltScore === 'number',
      );
      return {
        habit: h,
        count: recs.length,
        expected: rated.length ? avg(rated.map((r) => r!.meta!.dreadBefore as number)) : null,
        felt: rated.length ? avg(rated.map((r) => r!.meta!.feltScore as number)) : null,
      };
    })
    .filter((x) => x.count > 0);
  const total = per.reduce((n, x) => n + x.count, 0);
  return {
    total,
    text: total ? `You went through the door ${total} ${total === 1 ? 'time' : 'times'}.` : null,
    per,
  };
}

/** WHAT GOT IN THE WAY: Not today reasons this week, most first. */
export function reasonCounts(list: NotToday[], days: string[]) {
  return REASONS.map((r) => ({ ...r, count: list.filter((n) => n.reason === r.key && days.includes(n.date)).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

const RULES: Partial<Record<NotTodayReason, string>> = {
  unclear: 'Next week, the first two minutes of each session go to writing the next step.',
  too_big: 'Next week, make the first step smaller before you start.',
  tired: 'Next week, try the door earlier in the day.',
  worried: 'Before the next one, look at how heavy it actually felt last time.',
  no_time: 'Next week, give the door a fixed slot.',
};

/** One rule-based line for the most common reason, when it came up 2+ times. */
export function reasonRule(counts: { key: NotTodayReason; count: number }[]): string | null {
  const top = counts.find((c) => c.count >= 2 && RULES[c.key]);
  return top ? RULES[top.key]! : null;
}

/** IN YOUR WORDS: the week's kept lines (oldest first). */
export function keptThisWeek(habits: Habit[], idx: RecordIndex, days: string[]) {
  return habits
    .flatMap((h) => keptLines(h, idx).map((l) => ({ ...l, habit: h.name })))
    .filter((l) => days.includes(l.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The monthly horizon is asked on the last Sunday of each month. */
export const isLastSundayOfMonth = (date: string) =>
  weekday(date) === 0 && addDays(date, 7).slice(0, 7) !== date.slice(0, 7);

/** "2026-11" */
export const monthKey = (date: string) => date.slice(0, 7);

/**
 * The horizon line in force on a date: this month's, else the latest earlier one written within
 * the last three months.
 */
export function horizonOn(months: Record<string, string>, date: string): { month: string; line: string } | null {
  const m = monthKey(date);
  const keys = Object.keys(months)
    .filter((k) => k <= m && months[k]?.trim())
    .sort();
  const k = keys[keys.length - 1];
  if (!k) return null;
  const [y, mo] = m.split('-').map(Number);
  const [ky, kmo] = k.split('-').map(Number);
  return (y - ky) * 12 + (mo - kmo) <= 3 ? { month: k, line: months[k].trim() } : null;
}
