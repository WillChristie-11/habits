// The nudge engine for avoid habits: which frame to send, its words, when, and when to stop.
// Pure and tested; reminders.planNotifications calls it and the runtime keeps the nudge log.
import type { Habit, ReminderSettings } from '../types';
import { addDays, atTime, weekday, diffDays } from './dates';
import { stateOn, visibleOn, type Ctx, type RecordIndex } from './schedule';
import { expectedVsFelt, keptLines } from './insights';
import { FROM_HABIT } from './timers';
import type { NotToday } from './notToday';

export type Frame = 'past_you' | 'dread' | 'name_it' | 'this_week' | 'permission' | 'pair' | 'horizon' | 'tiny';
export type Voice = 'gentle' | 'direct' | 'facts';

/** Past you first, then Dread vs reality, then the rest; Tiny door is the default. */
export const PREFERENCE: Frame[] = [
  'past_you',
  'dread',
  'name_it',
  'this_week',
  'permission',
  'pair',
  'horizon',
  'tiny',
];
/** Name it carries reason buttons. */
export const NAME_IT_CATEGORY = 'nudge-name';
export const PER_DAY = 2;
const GAP_MS = 3 * 60 * 60_000;
export const IGNORED_LIMIT = 3;
const HORIZON_EVERY_DAYS = 7;

export interface NudgeLogRow {
  /** the notification id */
  id: string;
  habit_id: number;
  date: string;
  frame: Frame;
  sent_at: string;
  opened_at: string | null;
  action: string | null;
}

export const voiceOf = (h: Habit): Voice | null => {
  const v = h.meta?.voice;
  return v === 'gentle' || v === 'direct' || v === 'facts' ? v : null;
};
const metaString = (h: Habit, k: string) => (typeof h.meta?.[k] === 'string' ? (h.meta[k] as string) : null);

/** Quiet for a week, or stopped after 3 ignored in a row (until a Not landing choice). */
export function nudgesPaused(h: Habit, date: string): boolean {
  const until = metaString(h, 'nudgesPausedUntil');
  return until != null && date <= until;
}

const isAvoid = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'avoid';
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const noStop = (s: string) => s.trim().replace(/[.!?\s]+$/, '');
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Due days before `date` in a row on which it wasn't started (stops at the last start). */
export function notStartedRun(h: Habit, idx: RecordIndex, date: string, lookBack = 14): number {
  const c: Ctx = { today: date };
  let n = 0;
  for (let i = 1; i <= lookBack; i++) {
    const d = addDays(date, -i);
    if (d < h.created_at.slice(0, 10)) break;
    if (!visibleOn(h, idx, c, d)) continue;
    const s = stateOn(h, idx, d, c);
    if (s === 'done') break;
    if (s === 'paused') continue;
    n++;
  }
  return n;
}

export interface FrameInputs {
  h: Habit;
  idx: RecordIndex;
  date: string;
  notToday: NotToday[];
  /** the goal this habit is linked to (Wed–Fri: "Working toward…") */
  goal: string | null;
  /** the pair anchor was tapped today */
  pairReady: boolean;
  /** the monthly horizon line, and when a Horizon nudge was last sent (date) */
  horizon: { line: string; lastSent: string | null } | null;
}

export interface FrameData {
  frame: Frame;
  /** a kept line and its date (Past you), the record numbers (Dread vs reality), the goal… */
  line?: { date: string; text: string };
  lighter?: number;
  rated?: number;
  goal?: string;
  horizon?: string;
}

/** Every frame that can fire for this habit on this date, with the data it needs. */
export function eligibleFrames(x: FrameInputs): FrameData[] {
  const out: FrameData[] = [];
  const line = keptLines(x.h, x.idx).find((l) => l.date < x.date);
  if (line) out.push({ frame: 'past_you', line });
  const ev = expectedVsFelt(x.h, x.idx);
  if (ev.rated >= 5 && ev.lighter > ev.rated / 2) out.push({ frame: 'dread', lighter: ev.lighter, rated: ev.rated });
  if (notStartedRun(x.h, x.idx, x.date) >= 2) out.push({ frame: 'name_it' });
  const wd = weekday(x.date);
  if (wd >= 3 && wd <= 5 && x.goal) out.push({ frame: 'this_week', goal: x.goal });
  const yesterday = addDays(x.date, -1);
  if (
    x.notToday.some(
      (n) => n.habit_id === x.h.id && n.date === yesterday && (n.reason === 'too_big' || n.reason === 'tired'),
    )
  )
    out.push({ frame: 'permission' });
  if (x.h.pair_with && x.pairReady) out.push({ frame: 'pair' });
  if (x.horizon && (!x.horizon.lastSent || diffDays(x.horizon.lastSent, x.date) >= HORIZON_EVERY_DAYS))
    out.push({ frame: 'horizon', horizon: x.horizon.line });
  out.push({ frame: 'tiny' });
  return out;
}

/** Eligible frames minus the last two used for the habit, in order of preference. */
export function chooseFrame(eligible: FrameData[], recent: Frame[]): FrameData {
  const avoid = new Set(recent.slice(0, 2));
  const ranked = [...eligible].sort((a, b) => PREFERENCE.indexOf(a.frame) - PREFERENCE.indexOf(b.frame));
  return ranked.find((f) => !avoid.has(f.frame)) ?? ranked.find((f) => f.frame === 'tiny') ?? ranked[0];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function whenText(lineDate: string, date: string): string {
  const days = diffDays(lineDate, date);
  if (days <= 1) return 'yesterday';
  if (days <= 7) return `last ${DAY_NAMES[weekday(lineDate)]}`;
  return 'a while back';
}

/**
 * Title and body for a frame. Titles are an action or a quote (6 words or fewer, except your own
 * words); bodies 20 words or fewer. No exclamation marks, no emoji, never counts for the habit
 * beyond your own expected-vs-felt record.
 */
export function frameText(f: FrameData, h: Habit, date: string, voice: Voice | null): { title: string; body: string } {
  const step = h.ladder[h.ladder_index] ?? null;
  const focus = `Focus ${FROM_HABIT.focus}`;
  let title: string;
  let body: string;
  switch (f.frame) {
    case 'past_you':
      title = `From you, ${whenText(f.line!.date, date)}`;
      body = `“${noStop(f.line!.text)}.” Ten minutes on the next one?`;
      break;
    case 'dread':
      title = 'Lighter than you expect';
      body = `${h.name} felt easier than you predicted ${f.lighter} of the last ${f.rated} times. 10 min?`;
      break;
    case 'name_it':
      title = 'The one you keep moving.';
      body = 'No pressure to do it. What’s actually in the way today?';
      break;
    case 'this_week':
      title = 'Working toward…';
      body = `“${noStop(f.goal!)}.” One step today makes it real.`;
      break;
    case 'permission':
      title = 'Ten minutes. Then you’re free.';
      body = 'Stopping at the timer counts. The hard part is usually the first minute.';
      break;
    case 'pair':
      title = `${upperFirst(noStop(h.pair_with ?? ''))} now?`;
      body = `With it: ${step ? lowerFirst(noStop(step)) : h.name.toLowerCase()}. ${focus}.`;
      break;
    case 'horizon':
      title = 'Three months out';
      body = `You wrote: “${noStop(f.horizon!)}.” Today’s piece of that: ${step ? lowerFirst(noStop(step)) : h.name.toLowerCase()}.`;
      break;
    default: {
      const short = step && wordCount(step) <= 5;
      title = short ? `Just ${lowerFirst(noStop(step))}.` : 'Just the first step.';
      body = `${h.name}${step && !short ? `: ${noStop(step)}` : ''} · Nothing to finish. Two minutes, then decide.`;
    }
  }
  return applyVoice({ title, body }, voice, h, step);
}

/** Gentler softens the title, More direct drops the question, Just the facts is step + time. */
export function applyVoice(
  t: { title: string; body: string },
  voice: Voice | null,
  h: Habit,
  step: string | null,
): { title: string; body: string } {
  if (voice === 'facts') return { title: noStop(step ?? h.name), body: `Focus ${FROM_HABIT.focus} · ${h.name}` };
  if (voice === 'gentle') return { ...t, title: `Maybe ${lowerFirst(noStop(t.title.replace(/…$/, '')))}?` };
  if (voice === 'direct') {
    const kept = t.body
      .split(/(?<=[.?…])\s+/)
      .filter((s) => !s.trim().endsWith('?'))
      .join(' ')
      .trim();
    return { title: t.title.replace(/\?$/, '.'), body: kept || `Focus ${FROM_HABIT.focus}.` };
  }
  return t;
}

/** When a morning anchor (the earliest before noon) was tapped on a date, as a Date. */
function tapTime(anchor: Habit | undefined, idx: RecordIndex, date: string): Date | null {
  if (!anchor) return null;
  const r = idx.get(anchor.id)?.get(date);
  return r?.status === 'done' && r.timestamp ? new Date(r.timestamp) : null;
}

export const morningAnchor = (habits: Habit[]) =>
  habits
    .filter((h) => h.kind === 'anchor' && h.scheduled_time != null && h.scheduled_time < '12:00')
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))[0];

/**
 * Up to two send times a day, 3 h apart: the habit's chosen time, else 15 min after the morning
 * anchor is tapped (its scheduled time until then), else an hour after the morning reminder.
 * A pair habit whose anchor was tapped goes 5 min after that tap. None in the 2 h before the
 * deadline.
 */
export function nudgeTimes(
  h: Habit,
  habits: Habit[],
  idx: RecordIndex,
  date: string,
  r: ReminderSettings,
  cutoff: string,
): { times: Date[]; pairReady: boolean } {
  const pairAnchor = h.pair_with && h.stack_after != null ? habits.find((a) => a.id === h.stack_after) : undefined;
  const pairTap = tapTime(pairAnchor, idx, date);
  const chosen = metaString(h, 'nudgeTime');
  const anchor = morningAnchor(habits);
  const tap = tapTime(anchor, idx, date);
  const first = pairTap
    ? new Date(pairTap.getTime() + 5 * 60_000)
    : chosen
      ? atTime(date, chosen)
      : tap
        ? new Date(tap.getTime() + 15 * 60_000)
        : anchor?.scheduled_time
          ? new Date(atTime(date, anchor.scheduled_time).getTime() + 15 * 60_000)
          : new Date(atTime(date, r.morningTime).getTime() + 60 * 60_000);
  const end = atTime(date, cutoff).getTime();
  const times = [first, new Date(first.getTime() + GAP_MS)].filter((t) => t.getTime() < end).slice(0, PER_DAY);
  return { times, pairReady: !!pairTap };
}

/**
 * Untouched nudges in a row for a habit (newest back), counting only nudges already sent after
 * the last Not landing choice. A nudge counts as ignored once the next one for that habit has
 * been sent or its day is over, with no tap or button on it and no session that day.
 */
export function ignoredStreak(log: NudgeLogRow[], h: Habit, idx: RecordIndex, now: Date, today: string): number {
  const resetAt = metaString(h, 'nudgeResetAt') ?? '';
  const sent = log
    .filter((l) => l.habit_id === h.id && new Date(l.sent_at).getTime() <= now.getTime() && l.sent_at > resetAt)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  let n = 0;
  for (let i = 0; i < sent.length; i++) {
    const l = sent[i];
    if (l.opened_at) break;
    if (idx.get(h.id)?.get(l.date)?.status === 'done') break;
    const settled = i > 0 || l.date < today;
    if (settled) n++;
  }
  return n;
}

export interface PlannedNudge {
  id: string;
  habitId: number;
  date: string;
  at: Date;
  frame: Frame;
  title: string;
  body: string;
  category: string;
}

/**
 * The avoid-habit nudges for a date: for each avoid habit still open that day, not paused and
 * not stopped by 3 ignored in a row, up to two frames at its times.
 */
export function planNudges(args: {
  habits: Habit[];
  idx: RecordIndex;
  date: string;
  today: string;
  now: Date;
  r: ReminderSettings;
  cutoff: string;
  log: NudgeLogRow[];
  notToday: NotToday[];
  goals: { name: string; links: number[] }[];
  horizon: string | null;
}): PlannedNudge[] {
  const { habits, idx, date, now, r, log } = args;
  const out: PlannedNudge[] = [];
  const c: Ctx = { today: date };
  for (const h of habits) {
    if (!isAvoid(h) || !visibleOn(h, idx, c, date) || stateOn(h, idx, date, c) !== 'pending') continue;
    if (nudgesPaused(h, date) || ignoredStreak(log, h, idx, now, args.today) >= IGNORED_LIMIT) continue;
    const { times, pairReady } = nudgeTimes(h, habits, idx, date, r, args.cutoff);
    const history = log.filter((l) => l.habit_id === h.id && new Date(l.sent_at).getTime() <= now.getTime());
    const recent = history.sort((a, b) => b.sent_at.localeCompare(a.sent_at)).map((l) => l.frame);
    const lastHorizon = log
      .filter((l) => l.frame === 'horizon')
      .reduce<string | null>((m, l) => (m == null || l.date > m ? l.date : m), null);
    const eligible = eligibleFrames({
      h,
      idx,
      date,
      notToday: args.notToday,
      goal: args.goals.find((g) => g.links.includes(h.id))?.name ?? null,
      pairReady,
      horizon: args.horizon ? { line: args.horizon, lastSent: lastHorizon } : null,
    });
    times.forEach((at, slot) => {
      const id = `nudge-${h.id}-${date}-${slot}`;
      const sentAlready = log.find((l) => l.id === id && new Date(l.sent_at).getTime() <= now.getTime());
      if (sentAlready) {
        recent.unshift(sentAlready.frame);
        return;
      }
      if (at.getTime() <= now.getTime() + 5_000) return;
      const pick = pairReady && slot === 0 ? eligible.find((f) => f.frame === 'pair')! : chooseFrame(eligible, recent);
      recent.unshift(pick.frame);
      const text = frameText(pick, h, date, voiceOf(h));
      out.push({
        id,
        habitId: h.id,
        date,
        at,
        frame: pick.frame,
        ...text,
        category: pick.frame === 'name_it' ? NAME_IT_CATEGORY : `start-${FROM_HABIT.focus}`,
      });
    });
  }
  return out;
}

/** The short reply after a reason button on a Name it nudge. */
export const REASON_REPLY: Record<'unclear' | 'too_big' | 'tired', { title: string; body: string }> = {
  unclear: {
    title: 'Fair enough.',
    body: 'Tomorrow starts with one question: what’s the first thing you’d need to find?',
  },
  too_big: { title: 'Then smaller.', body: 'Tomorrow’s version: two minutes. Just open it.' },
  tired: { title: 'Rest, then.', body: 'The next ask comes tomorrow morning.' },
};

/** The times you usually open the app (most often first, up to three), for "A different time". */
export function usualTimes(opens: string[], max = 3): string[] {
  const n = new Map<string, number>();
  for (const t of opens) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t]) => t)
    .sort();
}

/** Habits whose nudges stopped after 3 ignored in a row (Not landing asks what to change). */
export function notLanding(habits: Habit[], log: NudgeLogRow[], idx: RecordIndex, now: Date, today: string): Habit[] {
  return habits.filter(
    (h) => isAvoid(h) && !nudgesPaused(h, today) && ignoredStreak(log, h, idx, now, today) >= IGNORED_LIMIT,
  );
}
