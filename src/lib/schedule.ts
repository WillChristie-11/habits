import type { DayRecord, DayState, Habit, Section } from '../types';
import { FEELINGS } from '../types';
import { addDays, diffDays, range, toKey, weekday } from './dates';

export type RecordIndex = Map<number, Map<string, DayRecord>>;

export function indexRecords(records: DayRecord[]): RecordIndex {
  const idx: RecordIndex = new Map();
  for (const r of records) {
    let m = idx.get(r.habit_id);
    if (!m) idx.set(r.habit_id, (m = new Map()));
    m.set(r.date, r);
  }
  return idx;
}

export interface Ctx {
  today: string;
  /** Whole-app pause (travel mode), inclusive range. */
  appPause?: { from: string; until: string } | null;
}

export function habitStart(h: Habit, recs?: Map<string, DayRecord>): string {
  let start = toKey(new Date(h.created_at));
  if (recs) for (const d of recs.keys()) if (d < start) start = d;
  return start;
}

export function isPausedOn(h: Habit, date: string, ctx: Ctx): boolean {
  if (ctx.appPause && date >= ctx.appPause.from && date <= ctx.appPause.until) return true;
  if (h.paused_until && date <= h.paused_until && (!h.paused_from || date >= h.paused_from)) return true;
  return false;
}

export interface Timeline {
  states: Map<string, DayState>;
  /** every_n_days only: the date the habit is (or was) next due, as of `to`. */
  nextDue?: string;
}

/**
 * Compute the state of a habit for each day in [from, to]. Days after ctx.today are 'none'.
 * Recorded statuses always win; otherwise a day is paused (pause range), missed/pending
 * (expected), or none (not expected).
 */
export function timeline(h: Habit, idx: RecordIndex, from: string, to: string, ctx: Ctx): Timeline {
  const recs = idx.get(h.id) ?? new Map<string, DayRecord>();
  const start = habitStart(h, recs);
  const states = new Map<string, DayState>();
  const f = h.frequency;

  // every_n_days needs to walk from the start to know when it's due.
  const walkFrom = f.type === 'every_n_days' ? (start < from ? start : from) : from;
  const n = Math.max(1, f.n ?? 1);
  let nextDue = start;

  for (const d of range(walkFrom, to)) {
    let s: DayState;
    const rec = recs.get(d);
    if (d < start || d > ctx.today) {
      s = 'none';
    } else if (rec) {
      s = rec.status;
    } else if (isPausedOn(h, d, ctx)) {
      s = 'paused';
    } else {
      switch (f.type) {
        case 'daily':
          s = d === ctx.today ? 'pending' : 'missed';
          break;
        case 'specific_days':
          s = (f.days ?? []).includes(weekday(d)) ? (d === ctx.today ? 'pending' : 'missed') : 'none';
          break;
        case 'weekly_count':
          s = 'none';
          break;
        case 'every_n_days':
          if (d < nextDue) s = 'none';
          else if (d === ctx.today) s = 'pending';
          // Missed once per cycle: on the due date and every n days after while still undone.
          else s = diffDays(nextDue, d) % n === 0 ? 'missed' : 'none';
          break;
      }
    }

    if (f.type === 'every_n_days' && d >= start && d <= ctx.today) {
      if (s === 'done') nextDue = addDays(d, n);
      // Rest/paused days push the due date rather than counting against you.
      else if ((s === 'skipped' || s === 'paused') && d >= nextDue) nextDue = addDays(d, 1);
    }
    if (d >= from) states.set(d, s);
  }
  return { states, nextDue: f.type === 'every_n_days' ? nextDue : undefined };
}

export function stateOn(h: Habit, idx: RecordIndex, date: string, ctx: Ctx): DayState {
  return timeline(h, idx, date, date, ctx).states.get(date) ?? 'none';
}

export interface Progress {
  done: number;
  expected: number;
  /** 0–1, or null when nothing was expected yet */
  pct: number | null;
  /** weekly_count only */
  target?: number;
}

/**
 * Progress over a set of days. Skipped and paused days are excluded from the denominator.
 * Today counts only once it's done (so mornings don't start at 0%).
 */
export function progress(h: Habit, idx: RecordIndex, days: string[], ctx: Ctx): Progress {
  const tl = timeline(h, idx, days[0], days[days.length - 1], ctx);
  let done = 0;
  let missed = 0;
  let inactive = 0;
  for (const d of days) {
    const s = tl.states.get(d);
    if (s === 'done') done++;
    else if (s === 'missed') missed++;
    else if (s === 'skipped' || s === 'paused') inactive++;
  }
  if (h.frequency.type === 'weekly_count') {
    const count = Math.max(1, h.frequency.count ?? 1);
    // Scale the target down for rest/paused days in the window.
    const target = Math.ceil((count * (days.length - inactive)) / days.length);
    return { done, expected: target, target, pct: target > 0 ? Math.min(1, done / target) : null };
  }
  const expected = done + missed;
  return { done, expected, pct: expected > 0 ? done / expected : null };
}

export type DueLabel = { kind: 'due' | 'overdue' | 'later'; text: string } | null;

export function dueLabel(h: Habit, idx: RecordIndex, ctx: Ctx): DueLabel {
  if (h.frequency.type !== 'every_n_days') return null;
  const tl = timeline(h, idx, ctx.today, ctx.today, ctx);
  const today = tl.states.get(ctx.today);
  if (today === 'done' || today === 'skipped' || today === 'paused') return null;
  const nd = tl.nextDue!;
  const diff = diffDays(ctx.today, nd);
  if (diff === 0) return { kind: 'due', text: 'due' };
  if (diff < 0) return { kind: 'overdue', text: diff === -1 ? 'overdue 1 day' : `overdue ${-diff} days` };
  return { kind: 'later', text: diff === 1 ? 'tomorrow' : `in ${diff} days` };
}

/** Should the habit appear in today's list? (specific_days hides on other weekdays.) */
export function visibleToday(h: Habit, idx: RecordIndex, ctx: Ctx): boolean {
  if (h.frequency.type !== 'specific_days') return true;
  const s = stateOn(h, idx, ctx.today, ctx);
  return s !== 'none' || (h.frequency.days ?? []).includes(weekday(ctx.today));
}

/** "Never miss twice": missed yesterday and not done today. */
export function missedTwiceRisk(h: Habit, idx: RecordIndex, ctx: Ctx): boolean {
  if (h.frequency.type === 'weekly_count') return false;
  const y = addDays(ctx.today, -1);
  const tl = timeline(h, idx, y, ctx.today, ctx);
  return tl.states.get(y) === 'missed' && tl.states.get(ctx.today) === 'pending';
}

/** Today's ring: done ÷ (done + still pending), over habits expected today. weekly_count excluded. */
export function todayCompletion(habits: Habit[], idx: RecordIndex, ctx: Ctx) {
  let done = 0;
  let total = 0;
  for (const h of habits) {
    if (h.frequency.type === 'weekly_count') continue;
    const s = stateOn(h, idx, ctx.today, ctx);
    if (s === 'done') {
      done++;
      total++;
    } else if (s === 'pending') total++;
  }
  return { done, total, pct: total ? done / total : 0 };
}

export function feelingStats(h: Habit, idx: RecordIndex, days?: string[]) {
  const recs = idx.get(h.id);
  if (!recs) return { count: 0, avg: null as number | null };
  let sum = 0;
  let count = 0;
  const allowed = days ? new Set(days) : null;
  for (const r of recs.values()) {
    if (r.feeling == null || r.status !== 'done') continue;
    if (allowed && !allowed.has(r.date)) continue;
    sum += r.feeling;
    count++;
  }
  return { count, avg: count ? sum / count : null };
}

export function feelingLabel(avg: number): string {
  return FEELINGS[Math.min(5, Math.max(1, Math.round(avg))) - 1];
}

export interface Row {
  habit: Habit;
  depth: number;
  anchor: Habit | null;
}

/**
 * Order a section's habits for display: by `order`, with stacked habits placed
 * (indented) directly under their anchor. Anchors in another section or hidden today
 * are ignored, so the habit shows as a normal row.
 */
export function sectionRows(habits: Habit[], section: Section, visible: (h: Habit) => boolean): Row[] {
  const list = habits
    .filter((h) => h.section === section && visible(h))
    .sort((a, b) => a.order - b.order || a.id - b.id);
  const byId = new Map(list.map((h) => [h.id, h]));
  const children = new Map<number, Habit[]>();
  const roots: Habit[] = [];
  for (const h of list) {
    const anchor = h.stack_after != null ? byId.get(h.stack_after) : undefined;
    if (anchor && anchor.id !== h.id) {
      if (!children.has(anchor.id)) children.set(anchor.id, []);
      children.get(anchor.id)!.push(h);
    } else roots.push(h);
  }
  const out: Row[] = [];
  const seen = new Set<number>();
  const visit = (h: Habit, depth: number, anchor: Habit | null) => {
    if (seen.has(h.id)) return;
    seen.add(h.id);
    out.push({ habit: h, depth: Math.min(depth, 2), anchor });
    for (const c of children.get(h.id) ?? []) visit(c, depth + 1, h);
  };
  roots.forEach((h) => visit(h, 0, null));
  // Anything left is in a stacking cycle; show it flat.
  list.forEach((h) => visit(h, 0, null));
  return out;
}

export function frequencyText(h: Habit): string {
  const f = h.frequency;
  switch (f.type) {
    case 'daily':
      return 'Every day';
    case 'weekly_count':
      return `${f.count ?? 1}× per week`;
    case 'specific_days': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = [...(f.days ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return days.map((d) => names[d]).join(', ') || 'No days chosen';
    }
    case 'every_n_days':
      return (f.n ?? 1) === 1 ? 'Every day' : `Every ${f.n} days`;
  }
}
