// Activities on Today (the chip row), in the week grid, and the 9 PM catch-up. Pure; tested.
// Activities are never in %, the ring, flags or "missed".
import type { Habit } from '../types';
import { weekDays } from './dates';
import type { RecordIndex } from './schedule';
import { weeklyGoal } from './journal';

const isActivity = (h: Habit) => h.kind === 'activity';
const done = (h: Habit, idx: RecordIndex, d: string) => idx.get(h.id)?.get(d)?.status === 'done';

/** This week so far (Monday through `today`): how many times, the weekly goal, logged today. */
export function activityWeek(h: Habit, idx: RecordIndex, today: string) {
  const count = weekDays(today).filter((d) => d <= today && done(h, idx, d)).length;
  return { count, goal: weeklyGoal(h), today: done(h, idx, today) };
}

/** "Run 2/3" with a weekly goal, else "Run 2" (or just "Run" before the first log). */
export function chipLabel(h: Habit, idx: RecordIndex, today: string): string {
  const w = activityWeek(h, idx, today);
  if (w.goal != null) return `${h.name} ${w.count}/${w.goal}`;
  return w.count ? `${h.name} ${w.count}` : h.name;
}

/** One cell of an activity's row in the week grid: logged that day, and x/goal for the week. */
export const activityRow = (h: Habit, idx: RecordIndex, days: string[], today: string) => ({
  dots: days.map((d) => done(h, idx, d)),
  label: (() => {
    const w = activityWeek(h, idx, days[days.length - 1] < today ? days[days.length - 1] : today);
    return w.goal != null ? `${w.count}/${w.goal}` : `${w.count}`;
  })(),
});

/** Catch-up buttons per notification (iOS shows up to 4 actions). */
export const CATCH_UP_MAX = 4;

/**
 * The 9 PM catch-up: activities still under their weekly goal and not logged today, in their
 * usual order. Activities without a goal are left out.
 */
export function catchUpList(habits: Habit[], idx: RecordIndex, today: string): Habit[] {
  return habits
    .filter(isActivity)
    .filter((h) => {
      const w = activityWeek(h, idx, today);
      return w.goal != null && w.count < w.goal && !w.today;
    })
    .sort((a, b) => a.order - b.order || a.id - b.id);
}
