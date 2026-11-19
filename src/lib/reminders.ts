// Pure reminder logic shared by the in-app banners and the scheduled notifications.
import type { Habit, JournalEntry, ReminderSettings } from '../types';
import { addDays, atTime, diffDays, formatDuration, formatTime, weekDays, weekday } from './dates';
import { noteFor } from './journal';
import {
  missedTwiceRisk,
  onTimeline,
  progress,
  stateOn,
  toMinutes,
  visibleOn,
  fromMinutes,
  type Ctx,
  type RecordIndex,
} from './schedule';

export const NUDGE_LEAD_MIN = 120; // evening nudge starts 2 h before the deadline
export const SNOOZE_MIN = 30;
/** iOS keeps at most 64 pending local notifications per app; leave headroom. */
export const MAX_SCHEDULED = 60;
export const MORNING_ENDS = '12:00';

const tracked = (h: Habit) => h.kind === 'habit';
export const isAvoid = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'avoid';
const wanted = (h: Habit) => tracked(h) && !isAvoid(h);

/**
 * How an avoid habit is always worded: the time box and the next ladder step.
 * "15 min: Tailor 1 bullet" · no ladder → "15 min of Apply to jobs" ·
 * with "pair with" → "good coffee + 15 min: Tailor 1 bullet?"
 * `style: 'of'` forces the "15 min of <habit>" form (evening nudge).
 */
export function avoidLine(h: Habit, style: 'step' | 'of' = 'step'): string {
  const step = style === 'step' ? h.ladder[h.ladder_index] : undefined;
  const box = step ? `${h.session_minutes} min: ${step}` : `${h.session_minutes} min of ${h.name}`;
  return h.pair_with ? `${h.pair_with} + ${box}?` : box;
}

/** "When I've had coffee, I will meditate." or null when the plan isn't filled in. */
export function ifThenLine(h: Habit): string | null {
  const when = h.plan_when?.trim();
  const action = h.plan_action?.trim() || h.name;
  return when ? `When ${when}, I will ${lowerFirst(action)}.` : null;
}

/** "If I'm exhausted, then I'll do the minimum: one stretch." */
export function obstacleLine(h: Habit): string | null {
  const o = h.obstacle?.trim();
  if (!o) return null;
  return h.minimum_version ? `If ${o}, then I'll do the minimum: ${h.minimum_version}.` : `If ${o}, then I'll do the minimum version.`;
}

/** Prefill for the plan's "when": from what it's stacked after, else its scheduled time. */
export function suggestPlanWhen(anchorName: string | null, scheduledTime: string | null): string {
  if (anchorName) return `${anchorName} is done`;
  if (scheduledTime) return `it's ${formatTime(scheduledTime)}`;
  return '';
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Avoid habits still open on `date` (for their own line in banners and notifications). */
export function avoidPending(habits: Habit[], idx: RecordIndex, ctx: Ctx, date = ctx.today, section?: Habit['section']): Habit[] {
  const c = { ...ctx, today: date };
  return habits
    .filter((h) => isAvoid(h) && (!section || h.section === section))
    .filter((h) => visibleOn(h, idx, c, date) && stateOn(h, idx, date, c) === 'pending')
    .sort((a, b) => a.order - b.order);
}

/** Unfinished habits in the Morning section on `date`. */
export function morningPending(habits: Habit[], idx: RecordIndex, ctx: Ctx, date = ctx.today): Habit[] {
  const c = { ...ctx, today: date };
  return habits
    .filter((h) => wanted(h) && h.section === 'morning' && h.frequency.type !== 'weekly_count')
    .filter((h) => visibleOn(h, idx, c, date) && stateOn(h, idx, date, c) === 'pending')
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.order - b.order);
}

/** Want habits still expected on `date` (not weekly_count), "never miss twice" ones first. Avoid habits are never counted. */
export function dayPending(habits: Habit[], idx: RecordIndex, ctx: Ctx, date = ctx.today): { habit: Habit; flagged: boolean }[] {
  const c = { ...ctx, today: date };
  return habits
    .filter((h) => wanted(h) && h.frequency.type !== 'weekly_count')
    .filter((h) => visibleOn(h, idx, c, date) && stateOn(h, idx, date, c) === 'pending')
    .map((habit) => ({ habit, flagged: missedTwiceRisk(habit, idx, c) }))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || sectionRank(a.habit) - sectionRank(b.habit) || a.habit.order - b.habit.order);
}

const sectionRank = (h: Habit) => ({ morning: 0, evening: 1, week: 2 })[h.section];

export interface PaceWarning {
  habit: Habit;
  done: number;
  target: number;
  daysLeft: number;
}

/**
 * weekly_count habits that are behind: days left this week (including today) are fewer than
 * the sessions still needed + 1. e.g. 0/2 lifts with 3 days left → warn.
 * (Strictly "fewer than" would only fire at 2 days left, which contradicts that example,
 * so this warns when days left ≤ remaining + 1.)
 */
export function behindPace(habits: Habit[], idx: RecordIndex, ctx: Ctx): PaceWarning[] {
  const week = weekDays(ctx.today);
  const daysLeft = week.length - week.indexOf(ctx.today);
  const out: PaceWarning[] = [];
  for (const h of habits) {
    if (!wanted(h) || h.frequency.type !== 'weekly_count') continue; // avoid habits are never "behind"
    if (stateOn(h, idx, ctx.today, ctx) === 'paused') continue;
    const p = progress(h, idx, week, ctx);
    const remaining = (p.target ?? 0) - p.done;
    if (remaining > 0 && daysLeft <= remaining + 1) out.push({ habit: h, done: p.done, target: p.target!, daysLeft });
  }
  return out;
}

export function nudgeStart(r: ReminderSettings): string {
  return fromMinutes(toMinutes(r.eveningDeadline) - NUDGE_LEAD_MIN);
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * Has this habit's part of the day passed? Then tapping it shows its why / minimum version.
 * Timed: after its time. Morning: after noon. Evening: once the evening nudge starts.
 * This week: when it's behind pace.
 */
export function sectionPassed(h: Habit, r: ReminderSettings, now: Date, behind: boolean): boolean {
  const n = minutesOf(now);
  if (h.scheduled_time && onTimeline(h)) return n >= toMinutes(h.scheduled_time);
  if (h.section === 'morning') return n >= toMinutes(MORNING_ENDS);
  if (h.section === 'evening') return n >= toMinutes(nudgeStart(r));
  return behind;
}

export type BannerState =
  | { kind: 'morning'; habits: Habit[]; avoid: Habit[] }
  | {
      kind: 'evening';
      items: { habit: Habit; flagged: boolean }[];
      avoid: Habit[];
      minutesLeft: number;
      late: boolean;
    }
  | { kind: 'pace'; warnings: PaceWarning[] };

export function banners(habits: Habit[], idx: RecordIndex, ctx: Ctx, r: ReminderSettings, now: Date): BannerState[] {
  const out: BannerState[] = [];
  const n = minutesOf(now);
  let evening: BannerState | null = null;
  if (r.eveningEnabled && n >= toMinutes(nudgeStart(r))) {
    const items = dayPending(habits, idx, ctx);
    const avoid = avoidPending(habits, idx, ctx);
    const deadline = toMinutes(r.eveningDeadline);
    if (items.length || avoid.length) evening = { kind: 'evening', items, avoid, minutesLeft: deadline - n, late: n >= deadline };
  }
  // Once the evening nudge is up it already lists unfinished morning habits, so the morning
  // banner steps aside rather than stacking a duplicate.
  if (!evening && r.morningEnabled && r.morningDismissedOn !== ctx.today && n >= toMinutes(r.morningTime)) {
    const m = morningPending(habits, idx, ctx);
    const avoid = avoidPending(habits, idx, ctx, ctx.today, 'morning');
    if (m.length || avoid.length) out.push({ kind: 'morning', habits: m, avoid });
  }
  if (evening) out.push(evening);
  const pace = behindPace(habits, idx, ctx);
  if (pace.length) out.push({ kind: 'pace', warnings: pace });
  return out;
}

export function paceText(w: PaceWarning): string {
  return `${w.habit.name}: ${w.done}/${w.target} this week, ${w.daysLeft} ${w.daysLeft === 1 ? 'day' : 'days'} left`;
}

// ---------------------------------------------------------------------------------------------
// Notification plan

export interface PlannedNotification {
  id: string;
  at: Date;
  title: string;
  body: string;
  /** 'item' → Done / Later / Skip buttons; 'start-N' → Start N min / Later / Skip (avoid habits) */
  category: string | null;
  data: { type: 'item' | 'morning' | 'evening'; habitId?: number; date: string };
}

/** Avoid habits get a "Start N min" button instead of "Done". */
export const itemCategory = (h: Habit) =>
  h.kind === 'habit' && h.habit_kind === 'avoid' ? `start-${h.session_minutes}` : 'item';

const withLine = (text: string, line: string | null) => (line ? `${text}\n${line}` : text);

function list(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

/**
 * One motivational line for a habit on a date: its why, its own messages, then the general
 * list, rotating one step per day (offset by habit so two reminders on one day differ).
 */
export function pickMessage(h: Habit | null, date: string, general: string[]): string | null {
  const pool = [...(h?.why ? [h.why] : []), ...(h?.messages ?? []), ...general]
    .map((m) => m.trim())
    .filter(Boolean);
  if (!pool.length) return null;
  const day = diffDays('2026-01-01', date);
  const i = (((day + (h?.id ?? 0)) % pool.length) + pool.length) % pool.length;
  return pool.at(i) ?? null;
}

function avoidBody(h: Habit, minutesBefore: number, date: string, general: string[]): string {
  const when = minutesBefore > 0 ? `In ${formatDuration(minutesBefore)}` : 'Now';
  const extra = ifThenLine(h) ?? pickMessage(h, date, general) ?? 'Just start; starting counts.';
  return `${when} · ${extra}`;
}

function itemBody(h: Habit, minutesBefore: number, date: string, general: string[]): string {
  const when = minutesBefore > 0 ? `In ${formatDuration(minutesBefore)}` : formatTime(h.scheduled_time);
  if (h.kind === 'anchor') return h.end_time ? `${when} · until ${formatTime(h.end_time)}` : when;
  // The if-then plan, when present, is the reminder text.
  const extra =
    ifThenLine(h) ?? pickMessage(h, date, general) ?? (h.minimum_version ? `Minimum: ${h.minimum_version}` : null);
  return extra ? `${when} · ${extra}` : when;
}

/** Everything that should be scheduled right now, for today and tomorrow only. */
export function planNotifications(
  habits: Habit[],
  idx: RecordIndex,
  ctx: Ctx,
  r: ReminderSettings,
  now: Date,
  entries: JournalEntry[] = [],
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  // A note to future me, on the day it's due (never-miss-twice / 2+ days without a session).
  const pastYou = (h: Habit, date: string) => {
    const n = noteFor(h, entries, idx, ctx, date);
    return n ? `Past you: “${n.data.text.trim()}”` : null;
  };
  const days = [ctx.today, addDays(ctx.today, 1)];
  const future = (d: Date) => d.getTime() > now.getTime() + 5_000;

  for (const date of days) {
    const c: Ctx = { ...ctx, today: date };

    // Per-item reminders (anchors and timed habits).
    for (const h of habits) {
      if (!h.reminder || !h.scheduled_time || !onTimeline(h)) continue;
      if (!visibleOn(h, idx, c, date) || stateOn(h, idx, date, c) !== 'pending') continue;
      const at = new Date(atTime(date, h.scheduled_time).getTime() - h.remind_before * 60_000);
      if (!future(at)) continue;
      out.push({
        id: `item-${h.id}-${date}`,
        at,
        title: isAvoid(h) ? avoidLine(h) : h.name,
        body:
          pastYou(h, date) ??
          (isAvoid(h) ? avoidBody(h, h.remind_before, date, r.messages) : itemBody(h, h.remind_before, date, r.messages)),
        category: itemCategory(h),
        data: { type: 'item', habitId: h.id, date },
      });
    }

    // Morning reminder: unfinished morning habits.
    if (r.morningEnabled && r.morningDismissedOn !== date) {
      const at = atTime(date, r.morningTime);
      const m = morningPending(habits, idx, ctx, date);
      const av = avoidPending(habits, idx, ctx, date, 'morning');
      if (future(at) && (m.length || av.length)) {
        const lines = [
          ...(m.length ? [`${m.length} to do: ${list(m.map((h) => h.name))}`] : []),
          ...av.map((h) => avoidLine(h)),
        ];
        out.push({
          id: `morning-${date}`,
          at,
          title: 'Good morning',
          body: withLine(lines.join('\n'), pickMessage(null, date, r.messages)),
          category: null,
          data: { type: 'morning', date },
        });
      }
    }

    // Evening nudge, 2 h before the deadline, with what's left (flagged first) and a "why".
    if (r.eveningEnabled) {
      const at = atTime(date, nudgeStart(r));
      const left = dayPending(habits, idx, ctx, date);
      const av = avoidPending(habits, idx, ctx, date);
      if (future(at) && (left.length || av.length)) {
        const names = left.map((x) => (x.flagged ? `${x.habit.name} ⚑` : x.habit.name));
        const first = left[0]?.habit;
        const minimum = first?.minimum_version ? ` Minimum for ${first.name}: ${first.minimum_version}.` : '';
        const note = first ? pastYou(first, date) : null;
        const msg = note ?? (first ? pickMessage(first, date, r.messages) : null);
        const counted = left.length ? `${list(names)}.${minimum}` : '';
        // Avoid habits: listed as "15 min of <habit>", never in the count.
        const avoidLines = av.map((h) => {
          const n = pastYou(h, date);
          return n ? `${avoidLine(h, 'of')} · ${n}` : avoidLine(h, 'of');
        });
        // Sunday evening: point to the weekly review.
        const reviewLine = weekday(date) === 0 ? 'Your weekly review is ready in Journal.' : null;
        out.push({
          id: `evening-${date}`,
          at,
          title: left.length
            ? `${left.length} left · 2 h until ${formatTime(r.eveningDeadline)}`
            : `Still time for ${avoidLines[0]}`,
          body: [counted, ...(left.length ? avoidLines : avoidLines.slice(1)), ...(msg ? [msg] : []), ...(reviewLine ? [reviewLine] : [])]
            .filter(Boolean)
            .join('\n'),
          category: null,
          data: { type: 'evening', date },
        });
      }
    }
  }

  // Snoozed ("Later") reminders.
  for (const s of r.snoozes) {
    const h = habits.find((x) => x.id === s.habitId);
    const at = new Date(s.at);
    if (!h || !future(at)) continue;
    const c: Ctx = { ...ctx, today: s.date };
    if (stateOn(h, idx, s.date, c) !== 'pending') continue;
    out.push({
      id: `snooze-${h.id}-${s.date}`,
      at,
      title: isAvoid(h) ? avoidLine(h) : h.name,
      body: (h.kind === 'habit' && pickMessage(h, s.date, r.messages)) || (isAvoid(h) ? 'Just start; starting counts.' : 'Reminder'),
      category: itemCategory(h),
      data: { type: 'item', habitId: h.id, date: s.date },
    });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}
