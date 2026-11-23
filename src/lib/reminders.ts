// Pure reminder logic shared by the in-app banners and the scheduled notifications.
import { FROM_HABIT } from './timers';
import { yesterdayLine } from './dayClose';
import { planNudges, nudgesPaused, type NudgeLogRow } from './nudges';
import type { NotToday } from './notToday';
import type { CheckinSettings, Habit, ReminderSettings } from '../types';
import { addDays, atTime, diffDays, formatDuration, formatTime, weekDays } from './dates';
import {
  missedTwiceRisk,
  onTimeline,
  isMorning,
  counts,
  isWeekly,
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

const tracked = counts;
export const isAvoid = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'avoid';
const wanted = (h: Habit) => tracked(h) && !isAvoid(h);

/**
 * How an avoid habit is always worded: a Focus round and the next ladder step.
 * "Focus 25: Tailor 1 bullet" · no ladder → "Focus 25 on Apply to jobs" ·
 * with "pair with" → "good coffee + Focus 25: Tailor 1 bullet?"
 * `style: 'of'` forces the "Focus 25 on <habit>" form (evening nudge).
 */
export function avoidLine(h: Habit, style: 'step' | 'of' = 'step'): string {
  const step = style === 'step' ? h.ladder[h.ladder_index] : undefined;
  const box = step ? `Focus ${FROM_HABIT.focus}: ${step}` : `Focus ${FROM_HABIT.focus} on ${h.name}`;
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
  return h.minimum_version
    ? `If ${o}, then I'll do the minimum: ${h.minimum_version}.`
    : `If ${o}, then I'll do the minimum version.`;
}

/** Prefill for the plan's "when": from what it's stacked after, else its scheduled time. */
export function suggestPlanWhen(anchorName: string | null, scheduledTime: string | null): string {
  if (anchorName) return `${anchorName} is done`;
  if (scheduledTime) return `it's ${formatTime(scheduledTime)}`;
  return '';
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Avoid habits still open on `date` (for their own line in banners and notifications). */
export function avoidPending(
  habits: Habit[],
  idx: RecordIndex,
  ctx: Ctx,
  date = ctx.today,
  morningOnly = false,
): Habit[] {
  const c = { ...ctx, today: date };
  return habits
    .filter((h) => isAvoid(h) && (!morningOnly || isMorning(h, habits)))
    .filter((h) => visibleOn(h, idx, c, date) && stateOn(h, idx, date, c) === 'pending')
    .sort((a, b) => a.order - b.order);
}

/** Unfinished habits under anchors before noon (or timed before noon) on `date`. */
export function morningPending(habits: Habit[], idx: RecordIndex, ctx: Ctx, date = ctx.today): Habit[] {
  const c = { ...ctx, today: date };
  return habits
    .filter((h) => wanted(h) && isMorning(h, habits))
    .filter((h) => visibleOn(h, idx, c, date) && stateOn(h, idx, date, c) === 'pending')
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.order - b.order);
}

/** Want habits still expected on `date` (not weekly_count), "never miss twice" ones first. Avoid habits are never counted. */
export function dayPending(
  habits: Habit[],
  idx: RecordIndex,
  ctx: Ctx,
  date = ctx.today,
): { habit: Habit; flagged: boolean }[] {
  const c = { ...ctx, today: date };
  // Morning things first, then the rest of the day, then every-N ones.
  const rank = (h: Habit) => (isMorning(h, habits) ? 0 : isWeekly(h) ? 2 : 1);
  return habits
    .filter((h) => wanted(h) && h.frequency.type !== 'weekly_count')
    .filter((h) => visibleOn(h, idx, c, date) && stateOn(h, idx, date, c) === 'pending')
    .map((habit) => ({ habit, flagged: missedTwiceRisk(habit, idx, c) }))
    .sort(
      (a, b) => Number(b.flagged) - Number(a.flagged) || rank(a.habit) - rank(b.habit) || a.habit.order - b.habit.order,
    );
}

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
    if (items.length || avoid.length)
      evening = { kind: 'evening', items, avoid, minutesLeft: deadline - n, late: n >= deadline };
  }
  // Once the evening nudge is up it already lists unfinished morning habits, so the morning
  // banner steps aside rather than stacking a duplicate.
  if (!evening && r.morningEnabled && r.morningDismissedOn !== ctx.today && n >= toMinutes(r.morningTime)) {
    const m = morningPending(habits, idx, ctx);
    const avoid = avoidPending(habits, idx, ctx, ctx.today, true);
    if (m.length || avoid.length) out.push({ kind: 'morning', habits: m, avoid });
  }
  if (evening) out.push(evening);
  const pace = behindPace(habits, idx, ctx);
  if (pace.length) out.push({ kind: 'pace', warnings: pace });
  return out;
}

/** "Lift: 0/2, 2 days left" */
export function paceText(w: PaceWarning): string {
  return `${w.habit.name}: ${w.done}/${w.target}, ${w.daysLeft} ${w.daysLeft === 1 ? 'day' : 'days'} left`;
}

// ---------------------------------------------------------------------------------------------
// Random check-ins

/** Small seeded PRNG so a day's check-in times stay put when notifications are re-planned. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Up to `count` random times in [start, end], at least `spacing` minutes apart, the same for
 * the same date. Fewer when the window can't fit them.
 */
export function checkinTimes(c: CheckinSettings, date: string): string[] {
  const start = toMinutes(c.start);
  const end = toMinutes(c.end);
  const window = end - start;
  if (!c.enabled || c.count < 1 || window <= 0) return [];
  const n = Math.min(c.count, Math.floor(window / Math.max(1, c.spacing)) + 1);
  const slack = window - (n - 1) * c.spacing;
  const rand = seeded(`checkin-${date}`);
  const offsets = Array.from({ length: n }, () => Math.floor(rand() * (slack + 1))).sort((a, b) => a - b);
  return offsets.map((o, i) => fromMinutes(start + o + i * c.spacing));
}

/**
 * Which habit a check-in is about: something still open that day, preferring "never miss twice"
 * habits and behind-pace weekly habits, never the same habit twice in a day when avoidable.
 */
export function checkinCandidates(habits: Habit[], idx: RecordIndex, ctx: Ctx, date: string): Habit[] {
  const c: Ctx = { ...ctx, today: date };
  const pace = new Set(behindPace(habits, idx, c).map((w) => w.habit.id));
  const open = habits.filter((h) => {
    if (!counts(h) || !visibleOn(h, idx, c, date)) return false;
    const s = stateOn(h, idx, date, c);
    if (s === 'done' || s === 'skipped' || s === 'paused') return false;
    return s === 'pending' || pace.has(h.id); // weekly_count habits only when behind
  });
  const urgent = (h: Habit) => (missedTwiceRisk(h, idx, c) || pace.has(h.id) ? 0 : 1);
  return open.sort((a, b) => urgent(a) - urgent(b) || a.order - b.order || a.id - b.id);
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
  data: { type: 'item' | 'morning' | 'evening' | 'close' | 'nudge'; habitId?: number; date: string; frame?: string };
}

/** Avoid habits get a "Focus 25" button instead of "Done". */
export const itemCategory = (h: Habit) =>
  h.kind === 'habit' && h.habit_kind === 'avoid' ? `start-${FROM_HABIT.focus}` : 'item';

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
  const pool = [...(h?.why ? [h.why] : []), ...(h?.messages ?? []), ...general].map((m) => m.trim()).filter(Boolean);
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

/** Close the day: the Wind down time, the days already closed, and each day's "better" line. */
export interface ClosePlan {
  windDown: string | null;
  closed: string[];
  better: Record<string, string>;
}

export const CLOSE_CATEGORY = 'close-day';

/** What the nudge engine reads: its log, Not today reasons, weekly intentions, the horizon line. */
export interface NudgeInputs {
  log: NudgeLogRow[];
  notToday: NotToday[];
  weeks: Record<string, string>;
  horizon: string | null;
}

/** Everything that should be scheduled right now, for today and tomorrow only. */
export function planNotifications(
  habits: Habit[],
  idx: RecordIndex,
  ctx: Ctx,
  r: ReminderSettings,
  now: Date,
  close: ClosePlan = { windDown: null, closed: [], better: {} },
  nudges: NudgeInputs | null = null,
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const days = [ctx.today, addDays(ctx.today, 1)];
  const future = (d: Date) => d.getTime() > now.getTime() + 5_000;

  for (const date of days) {
    const c: Ctx = { ...ctx, today: date };

    // Per-item reminders (anchors and timed habits).
    for (const h of habits) {
      if (!h.reminder || !h.scheduled_time || !onTimeline(h)) continue;
      if (isAvoid(h) && nudgesPaused(h, date)) continue; // Quiet for a week
      if (!visibleOn(h, idx, c, date) || stateOn(h, idx, date, c) !== 'pending') continue;
      const at = new Date(atTime(date, h.scheduled_time).getTime() - h.remind_before * 60_000);
      if (!future(at)) continue;
      out.push({
        id: `item-${h.id}-${date}`,
        at,
        title: isAvoid(h) ? avoidLine(h) : h.name,
        body: isAvoid(h)
          ? avoidBody(h, h.remind_before, date, r.messages)
          : itemBody(h, h.remind_before, date, r.messages),
        category: itemCategory(h),
        data: { type: 'item', habitId: h.id, date },
      });
    }

    // Morning reminder: unfinished morning habits.
    if (r.morningEnabled && r.morningDismissedOn !== date) {
      const at = atTime(date, r.morningTime);
      const m = morningPending(habits, idx, ctx, date);
      const av = avoidPending(habits, idx, ctx, date, true);
      // Last night's "Tomorrow I'll do better at…" rides along.
      const better = yesterdayLine(close.better[addDays(date, -1)]);
      if (future(at) && (m.length || av.length || better)) {
        const lines = [
          ...(m.length ? [`${m.length} to do: ${list(m.map((h) => h.name))}`] : []),
          ...av.map((h) => avoidLine(h)),
          ...(better ? [better] : []),
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

    // Close the day? at Wind down, unless the day is already closed.
    if (r.closeDayEnabled && close.windDown && !close.closed.includes(date)) {
      const at = atTime(date, close.windDown);
      if (future(at))
        out.push({
          id: `close-${date}`,
          at,
          title: 'Close the day?',
          body: 'Three lines, then you’re done.',
          category: CLOSE_CATEGORY,
          data: { type: 'close', date },
        });
    }

    // Evening nudge, 2 h before the deadline, with what's left (flagged first) and a "why".
    if (r.eveningEnabled) {
      const at = atTime(date, nudgeStart(r));
      const left = dayPending(habits, idx, ctx, date);
      const av = avoidPending(habits, idx, ctx, date);
      // Behind-pace want habits ride along as a line; there's no separate behind-pace notification.
      const pace = behindPace(habits, idx, { ...ctx, today: date }).map(paceText);
      if (future(at) && (left.length || av.length || pace.length)) {
        const names = left.map((x) => (x.flagged ? `${x.habit.name} ⚑` : x.habit.name));
        const first = left[0]?.habit;
        const minimum = first?.minimum_version ? ` Minimum for ${first.name}: ${first.minimum_version}.` : '';
        const msg = first ? pickMessage(first, date, r.messages) : null;
        const counted = left.length ? `${list(names)}.${minimum}` : '';
        // Avoid habits: listed as "15 min of <habit>", never in the count.
        const avoidLines = av.map((h) => avoidLine(h, 'of'));
        out.push({
          id: `evening-${date}`,
          at,
          title: left.length
            ? `${left.length} left · 2 h until ${formatTime(r.eveningDeadline)}`
            : avoidLines.length
              ? `Still time for ${avoidLines[0]}`
              : `This week · 2 h until ${formatTime(r.eveningDeadline)}`,
          body: [counted, ...(left.length ? avoidLines : avoidLines.slice(1)), ...pace, ...(msg ? [msg] : [])]
            .filter(Boolean)
            .join('\n'),
          category: null,
          data: { type: 'evening', date },
        });
      }
    }
  }

  // Avoid habits: the nudge engine (frames, at most 2 a day, stops after 3 ignored in a row).
  if (nudges) {
    for (const date of days) {
      for (const n of planNudges({
        habits,
        idx,
        date,
        today: ctx.today,
        now,
        r,
        cutoff: nudgeStart(r),
        log: nudges.log,
        notToday: nudges.notToday,
        weeks: nudges.weeks,
        horizon: nudges.horizon,
      })) {
        out.push({
          id: n.id,
          at: n.at,
          title: n.title,
          body: n.body,
          category: n.category,
          data: { type: 'nudge', habitId: n.habitId, date: n.date, frame: n.frame },
        });
      }
    }
  }

  // Random check-ins about something still open (want habits; avoid habits get their nudges).
  for (const date of days) {
    const times = checkinTimes(r.checkins, date).map((hm) => atTime(date, hm));
    const pool = checkinCandidates(habits, idx, ctx, date).filter((h) => !nudges || !isAvoid(h));
    times.forEach((at, i) => {
      if (!future(at) || !pool.length) return;
      // Different habit each time when possible; urgent ones come first in the pool.
      const h = pool[i % pool.length];
      const msg = pickMessage(h, date, r.messages);
      out.push({
        id: `checkin-${date}-${i}`,
        at,
        title: isAvoid(h) ? avoidLine(h) : `Still on track for ${h.name} today?`,
        body:
          msg ??
          (isAvoid(h) ? 'Just start; starting counts.' : h.minimum_version ? `Minimum: ${h.minimum_version}` : ''),
        category: itemCategory(h),
        data: { type: 'item', habitId: h.id, date },
      });
    });
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
      body:
        (h.kind === 'habit' && pickMessage(h, s.date, r.messages)) ||
        (isAvoid(h) ? 'Just start; starting counts.' : 'Reminder'),
      category: itemCategory(h),
      data: { type: 'item', habitId: h.id, date: s.date },
    });
  }

  // "Pause all reminders today" drops everything until midnight; silenced occurrences are dropped.
  const midnight = atTime(addDays(ctx.today, 1), '00:00').getTime();
  const silenced = new Set(r.silenced);
  return out
    .filter((p) => !(r.pausedOn === ctx.today && p.at.getTime() < midnight) && !silenced.has(p.id))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);
}

/** Silenced ids still worth keeping: their date (in the id) is today or later. */
export function liveSilenced(ids: string[], today: string): string[] {
  return ids.filter((id) => (id.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '') >= today);
}

export type UpcomingRow =
  | { kind: 'one'; id: string; at: Date; title: string; body: string; group: string }
  | { kind: 'checkins'; id: string; date: string; count: number; start: string; end: string };

const GROUP: Record<string, string> = {
  item: 'Reminder',
  morning: 'Morning reminder',
  evening: 'Evening nudge',
  close: 'Close the day',
  nudge: 'Nudge',
};

/**
 * Today's and tomorrow's plan as the Upcoming list, in time order. Random check-ins collapse to
 * one row a day ("2 check-ins between 9:00 AM and 9:00 PM") so their times stay a surprise.
 */
export function upcomingRows(plan: PlannedNotification[], r: ReminderSettings): UpcomingRow[] {
  const rows: UpcomingRow[] = [];
  const checkins = new Map<string, number>();
  for (const p of plan) {
    if (p.id.startsWith('checkin-')) checkins.set(p.data.date, (checkins.get(p.data.date) ?? 0) + 1);
    else
      rows.push({
        kind: 'one',
        id: p.id,
        at: p.at,
        title: p.title,
        body: p.body,
        group: GROUP[p.data.type] ?? 'Reminder',
      });
  }
  for (const [date, count] of checkins) {
    rows.push({ kind: 'checkins', id: `checkins-${date}`, date, count, start: r.checkins.start, end: r.checkins.end });
  }
  const when = (x: UpcomingRow) => (x.kind === 'one' ? x.at.getTime() : atTime(x.date, x.start).getTime());
  return rows.sort((a, b) => when(a) - when(b));
}
