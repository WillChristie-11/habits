import type { Bucket, DayRecord, DayState, Habit } from '../types';
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

/** Habits that are scheduled and counted. Cut-back habits are only logged, never expected or counted. */
export const counts = (h: Habit) => h.kind === 'habit' && h.habit_kind !== 'cut_back';
export const isCutBack = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'cut_back';

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
    } else if (h.kind === 'activity' || isCutBack(h)) {
      s = 'none'; // activities and cut-backs are only ever logged, never expected or missed
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
 * Progress over a set of days. Skipped and paused days are excluded from the denominator
 * (for weekly_count habits, only paused days lower the target).
 * Today counts only once it's done (so mornings don't start at 0%).
 */
export function progress(h: Habit, idx: RecordIndex, days: string[], ctx: Ctx): Progress {
  if (!counts(h)) return { done: 0, expected: 0, pct: null }; // anchors, activities, cut-backs never count
  const tl = timeline(h, idx, days[0], days[days.length - 1], ctx);
  let done = 0;
  let missed = 0;
  let paused = 0;
  for (const d of days) {
    const s = tl.states.get(d);
    if (s === 'done') done++;
    else if (s === 'missed') missed++;
    else if (s === 'paused') paused++;
  }
  if (h.frequency.type === 'weekly_count') {
    const count = Math.max(1, h.frequency.count ?? 1);
    // Paused days lower the target in proportion; rest (skipped) days don't, since a
    // per-week habit already lets you choose which days to rest.
    const target = Math.ceil((count * (days.length - paused)) / days.length);
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

/** Should the item appear on `date`'s list? (specific_days hides on other weekdays.) */
export function visibleOn(h: Habit, idx: RecordIndex, ctx: Ctx, date: string = ctx.today): boolean {
  if (date < toKey(new Date(h.created_at)) && !idx.get(h.id)?.has(date)) return false;
  if (h.frequency.type !== 'specific_days') return true;
  return (h.frequency.days ?? []).includes(weekday(date)) || !!idx.get(h.id)?.has(date);
}

export const visibleToday = (h: Habit, idx: RecordIndex, ctx: Ctx) => visibleOn(h, idx, ctx);

/** "Never miss twice": missed yesterday and not done today. */
export function missedTwiceRisk(h: Habit, idx: RecordIndex, ctx: Ctx): boolean {
  // Avoid habits never get "missed yesterday".
  if (!counts(h) || h.habit_kind === 'avoid' || h.frequency.type === 'weekly_count') return false;
  const y = addDays(ctx.today, -1);
  const tl = timeline(h, idx, y, ctx.today, ctx);
  return tl.states.get(y) === 'missed' && tl.states.get(ctx.today) === 'pending';
}

/** A day's ring: done ÷ (done + still pending/missed), over habits expected that day. Anchors and weekly_count excluded. */
export function dayCompletion(habits: Habit[], idx: RecordIndex, ctx: Ctx, date: string = ctx.today) {
  let done = 0;
  let total = 0;
  for (const h of habits) {
    // Avoid habits stay out of counts (starting one still checks it off on its row).
    if (!counts(h) || h.habit_kind === 'avoid' || h.frequency.type === 'weekly_count') continue;
    const s = stateOn(h, idx, date, ctx);
    if (s === 'done') {
      done++;
      total++;
    } else if (s === 'pending' || s === 'missed') total++;
  }
  return { done, total, pct: total ? done / total : 0 };
}

export const todayCompletion = (habits: Habit[], idx: RecordIndex, ctx: Ctx) => dayCompletion(habits, idx, ctx);

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
  /** the item this one is stacked under, if shown under it */
  anchor: Habit | null;
}

export const onTimeline = placedOnTimeline;

export interface DayLayout {
  /** anchors (+ scheduled habits on the Schedule tab) by time, each followed by what's stacked on it */
  timeline: Row[];
  /** Habits under no visible anchor: Anytime; weekly_count / every_n_days: This week. */
  sections: Record<Bucket, Row[]>;
}

export const isWeekly = (h: Habit) => h.frequency.type === 'weekly_count' || h.frequency.type === 'every_n_days';

/** The anchor a habit ends up under by following stack_after (null if none, or a loop). */
export function rootAnchor(h: Habit, habits: Habit[]): Habit | null {
  const byId = new Map(habits.map((x) => [x.id, x]));
  const seen = new Set<number>([h.id]);
  let cur = h;
  while (cur.stack_after != null) {
    const next = byId.get(cur.stack_after);
    if (!next || seen.has(next.id)) return null;
    if (next.kind === 'anchor') return next;
    seen.add(next.id);
    cur = next;
  }
  return null;
}

/** Morning = under an anchor before noon (or timed before noon). Drives the morning reminder. */
export function isMorning(h: Habit, habits: Habit[]): boolean {
  if (!counts(h) || isWeekly(h)) return false;
  const t = h.scheduled_time ?? rootAnchor(h, habits)?.scheduled_time ?? null;
  return t != null && toMinutes(t) < 12 * 60;
}

/** "After Wake up" · "Anytime" · "This week" */
export function groupLabel(h: Habit, habits: Habit[]): string {
  if (isWeekly(h)) return 'This week';
  const a = rootAnchor(h, habits);
  return a ? `After ${a.name}` : 'Anytime';
}

/** Anchors, and daily / specific-days habits with a scheduled time, live on the timeline. */
export function placedOnTimeline(h: Habit): boolean {
  if (h.kind === 'anchor') return true;
  return h.scheduled_time != null && (h.frequency.type === 'daily' || h.frequency.type === 'specific_days');
}

const byOrder = (a: Habit, b: Habit) => a.order - b.order || a.id - b.id;

/**
 * Place a day's items. Precedence: weekly kinds → This week; on the timeline (anchors, plus timed
 * habits on the Schedule tab) → by time; stacked on a visible item → directly under it;
 * otherwise Anytime. Stacking cycles fall back to flat rows.
 * timeline 'anchors' (Today): only anchors are timeline roots; timed habits without an anchor
 * go to Anytime.
 */
export function layoutDay(
  habits: Habit[],
  visible: (h: Habit) => boolean,
  opts: { timeline?: boolean | 'anchors' } = {},
): DayLayout {
  const mode = opts.timeline ?? true;
  const onTimeline = (h: Habit) =>
    mode === 'anchors' ? h.kind === 'anchor' : mode ? !isWeekly(h) && placedOnTimeline(h) : false;
  const bucket = (h: Habit): Bucket => (isWeekly(h) ? 'week' : 'anytime');
  const list = habits.filter(visible).sort(byOrder);
  const byId = new Map(list.map((h) => [h.id, h]));
  const parentOf = (h: Habit): Habit | null => {
    if (onTimeline(h) || isWeekly(h) || h.stack_after == null || h.stack_after === h.id) return null;
    return byId.get(h.stack_after) ?? null;
  };
  const children = new Map<number, Habit[]>();
  const roots: Habit[] = [];
  for (const h of list) {
    const p = parentOf(h);
    if (p) {
      if (!children.has(p.id)) children.set(p.id, []);
      children.get(p.id)!.push(h);
    } else roots.push(h);
  }

  const seen = new Set<number>();
  const visit = (out: Row[], h: Habit, depth: number, anchor: Habit | null) => {
    if (seen.has(h.id)) return;
    seen.add(h.id);
    out.push({ habit: h, depth: Math.min(depth, 2), anchor });
    for (const c of children.get(h.id) ?? []) visit(out, c, depth + 1, h);
  };

  const timeline: Row[] = [];
  const sections: Record<Bucket, Row[]> = { anytime: [], week: [] };
  roots
    .filter(onTimeline)
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || byOrder(a, b))
    .forEach((h) => visit(timeline, h, 0, null));
  roots.filter((h) => !onTimeline(h)).forEach((h) => visit(sections[bucket(h)], h, 0, null));
  list.forEach((h) => visit(sections[bucket(h)], h, 0, null)); // cycle leftovers
  return { timeline, sections };
}

export interface AnchorGroup {
  anchor: Habit;
  /** habits stacked under it (depth counted from the anchor's children = 0) */
  rows: Row[];
}

/**
 * Today: one group per anchor in time order, then Anytime and This week. A habit with its own
 * time (and no anchor) goes on the timeline, under the last anchor at or before its time (the
 * first anchor if it's earlier than all of them), after that anchor's stacked habits, in time
 * order. Anytime keeps only untimed items.
 */
export function todayGroups(habits: Habit[], visible: (h: Habit) => boolean) {
  const l = layoutDay(habits, visible, { timeline: 'anchors' });
  const anchors: AnchorGroup[] = [];
  for (const r of l.timeline) {
    if (r.depth === 0) anchors.push({ anchor: r.habit, rows: [] });
    else anchors[anchors.length - 1].rows.push({ ...r, depth: r.depth - 1 });
  }
  const timed = anchors.filter((g) => g.anchor.scheduled_time);
  if (!timed.length) return { anchors, anytime: l.sections.anytime, week: l.sections.week };

  // Anytime rows come as blocks: a root (depth 0) and the rows stacked under it.
  const blocks: Row[][] = [];
  for (const r of l.sections.anytime) {
    if (r.depth === 0 || !blocks.length) blocks.push([r]);
    else blocks[blocks.length - 1].push(r);
  }
  const anytime: Row[] = [];
  const moved = new Map<AnchorGroup, Row[][]>();
  for (const b of blocks) {
    const t = b[0].habit.scheduled_time;
    if (!t) {
      anytime.push(...b);
      continue;
    }
    const g = [...timed].reverse().find((a) => toMinutes(a.anchor.scheduled_time!) <= toMinutes(t)) ?? timed[0];
    moved.set(g, [...(moved.get(g) ?? []), b]);
  }
  for (const [g, list] of moved) {
    list.sort((a, b) => toMinutes(a[0].habit.scheduled_time!) - toMinutes(b[0].habit.scheduled_time!));
    g.rows.push(...list.flat());
  }
  return { anchors, anytime, week: l.sections.week };
}

export function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Which timeline item to highlight. An item's window runs from its time to its end time, or
 * else to the next item's (later) time. The first unfinished item whose window hasn't closed
 * is "Now" if it has started, otherwise "Next".
 */
export function timelineFocus(
  rows: Row[],
  stateOf: (h: Habit) => DayState,
  nowMin: number,
): { id: number; label: 'Now' | 'Next' } | null {
  const roots = rows.filter((r) => r.depth === 0 && r.habit.scheduled_time);
  for (let i = 0; i < roots.length; i++) {
    const h = roots[i].habit;
    const start = toMinutes(h.scheduled_time!);
    const s = stateOf(h);
    if (s === 'done' || s === 'skipped' || s === 'paused') continue;
    let end = h.end_time ? toMinutes(h.end_time) : 24 * 60;
    if (!h.end_time) {
      const later = roots.slice(i + 1).find((r) => toMinutes(r.habit.scheduled_time!) > start);
      if (later) end = toMinutes(later.habit.scheduled_time!);
    }
    if (end <= nowMin) continue;
    return { id: h.id, label: start <= nowMin ? 'Now' : 'Next' };
  }
  return null;
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

/**
 * Overall completion for a set of days (a week): every habit's done ÷ expected, summed.
 * weekly_count habits contribute min(done, target) of target. Habits created after the
 * last day are left out; anchors never count.
 */
export function periodSummary(habits: Habit[], idx: RecordIndex, days: string[], ctx: Ctx) {
  let done = 0;
  let expected = 0;
  const last = days[days.length - 1];
  for (const h of habits) {
    if (!counts(h) || h.habit_kind === 'avoid' || habitStart(h, idx.get(h.id)) > last) continue;
    const p = progress(h, idx, days, ctx);
    if (p.target != null) {
      done += Math.min(p.done, p.target);
      expected += p.target;
    } else {
      done += p.done;
      expected += p.expected;
    }
  }
  return { done, expected, pct: expected > 0 ? done / expected : null };
}

/** The anchor to show on Today: the current one (Now) or the next upcoming (Next). */
export function nextAnchor(
  habits: Habit[],
  idx: RecordIndex,
  ctx: Ctx,
  nowMin: number,
): { anchor: Habit; label: 'Now' | 'Next' } | null {
  const anchors = habits.filter((h) => h.kind === 'anchor');
  const rows = layoutDay(anchors, (h) => visibleOn(h, idx, ctx)).timeline;
  const f = timelineFocus(rows, (h) => stateOn(h, idx, ctx.today, ctx), nowMin);
  const anchor = f ? anchors.find((a) => a.id === f.id) : undefined;
  return anchor && f ? { anchor, label: f.label } : null;
}
