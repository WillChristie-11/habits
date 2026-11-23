// The Now page: what the opening screen says at this moment. Pure; tested. Never shows %,
// misses, flags or behind-pace.
import type { Habit, ReminderSettings } from '../types';
import { formatDuration, formatTime, weekDays, weekStart } from './dates';
import { counts, stateOn, todayGroups, toMinutes, visibleOn, type Ctx, type RecordIndex } from './schedule';
import { nudgeStart } from './reminders';
import { habitTimerButtons, isMeditateHabit } from './timers';

export type NowKind = 'morning' | 'anchor' | 'free' | 'evening' | 'done';

/** A button: check the item off, start one of its timers (0 main, 1 second), or write. */
export type NowAction =
  | { kind: 'done'; habitId: number; label: string }
  | { kind: 'timer'; habitId: number; which: 0 | 1; label: string }
  | { kind: 'focus'; label: string }
  | { kind: 'journal'; label: string };

export interface NowContent {
  kind: NowKind;
  big: string;
  small: string | null;
  /** the open item the buttons are for (avoid habits: their next step) */
  item: string | null;
  /** During an anchor: its window in minutes of the day, for the ring. */
  ring: { start: number; end: number } | null;
  actions: NowAction[];
}

const isAvoid = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'avoid';
const isWant = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'want';
const itemText = (h: Habit) => (isAvoid(h) ? (h.ladder[h.ladder_index] ?? h.name) : h.name);

/** Done (or its avoid-habit timer) plus the habit's other timer (Clear head · 5, or Meditate · 10). */
export function itemActions(h: Habit): NowAction[] {
  const timers = habitTimerButtons(h);
  if (isAvoid(h)) {
    const focus = timers.findIndex((b) => b.kind === 'focus') as 0 | 1;
    const clear = timers.findIndex((b) => b.clearHead);
    return [
      { kind: 'timer', habitId: h.id, which: focus, label: timers[focus].label },
      ...(clear >= 0
        ? [{ kind: 'timer' as const, habitId: h.id, which: clear as 0 | 1, label: timers[clear].label }]
        : []),
    ];
  }
  const second = isMeditateHabit(h) ? 0 : 1;
  return [
    { kind: 'done', habitId: h.id, label: 'Done' },
    { kind: 'timer', habitId: h.id, which: second, label: timers[second].label },
  ];
}

/** "4 habits · 1 job search session · Read 30 min" */
export function daySummary(habits: Habit[], idx: RecordIndex, date: string): string | null {
  const done = (h: Habit) => idx.get(h.id)?.get(date)?.status === 'done';
  const parts: string[] = [];
  const plain = habits.filter(
    (h) => h.kind === 'habit' && h.habit_kind !== 'avoid' && h.habit_kind !== 'cut_back' && done(h),
  );
  if (plain.length) parts.push(`${plain.length} ${plain.length === 1 ? 'habit' : 'habits'}`);
  for (const h of habits.filter((x) => isAvoid(x) && done(x))) parts.push(`1 ${h.name.toLowerCase()} session`);
  for (const h of habits.filter((x) => x.kind === 'activity' && done(x))) {
    const m = idx.get(h.id)?.get(date)?.meta;
    const amount = typeof m?.amount === 'number' ? m.amount : null;
    parts.push(amount != null ? `${h.name} ${amount}${m?.unit ? ` ${m.unit}` : ''}` : h.name);
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Want habits and activities still open today for "Free time. Pick one:", the ones done least
 * this week first, at most three.
 */
export function freePicks(habits: Habit[], idx: RecordIndex, ctx: Ctx, max = 3): Habit[] {
  const week = weekDays(weekStart(ctx.today)).filter((d) => d < ctx.today);
  const doneThisWeek = (h: Habit) => week.filter((d) => idx.get(h.id)?.get(d)?.status === 'done').length;
  return habits
    .filter((h) =>
      h.kind === 'activity'
        ? idx.get(h.id)?.get(ctx.today)?.status !== 'done' // activities are open until logged today
        : isWant(h) && visibleOn(h, idx, ctx) && stateOn(h, idx, ctx.today, ctx) === 'pending',
    )
    .map((h) => ({ h, n: doneThisWeek(h) }))
    .sort((a, b) => a.n - b.n || a.h.order - b.h.order || a.h.id - b.h.id)
    .slice(0, max)
    .map((x) => x.h);
}

export function nowContent(args: {
  habits: Habit[];
  idx: RecordIndex;
  ctx: Ctx;
  now: Date;
  r: ReminderSettings;
  intention: string | null;
}): NowContent {
  const { habits, idx, ctx, now, r, intention } = args;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const visible = (h: Habit) => visibleOn(h, idx, ctx);
  const open = (h: Habit) => stateOn(h, idx, ctx.today, ctx) === 'pending';
  const groups = todayGroups(habits, visible);
  const anchors = groups.anchors.filter((g) => g.anchor.scheduled_time);
  const items = habits.filter((h) => visible(h) && (h.kind === 'anchor' || counts(h)));
  const empty = { item: null, ring: null, actions: [] as NowAction[] };

  // Everything done today.
  if (items.length && !items.some(open)) {
    return { ...empty, kind: 'done', big: 'You’re done for today.', small: daySummary(habits, idx, ctx.today) };
  }

  // Evening, from the evening nudge's start: what's left, and the journal.
  if (nowMin >= toMinutes(nudgeStart(r))) {
    const left = habits.filter((h) => visible(h) && counts(h) && open(h)).map((h) => h.name);
    const small = left.length
      ? `Left: ${left.slice(0, 3).join(', ')}${left.length > 3 ? ` +${left.length - 3} more` : ''}`
      : null;
    return {
      ...empty,
      kind: 'evening',
      big: 'Wind down',
      small,
      actions: [{ kind: 'journal', label: 'Write in journal' }],
    };
  }

  // An anchor's window: its time to its end time, else to the next anchor's time.
  const windowOf = (i: number) => {
    const a = anchors[i].anchor;
    const start = toMinutes(a.scheduled_time!);
    const next = anchors.slice(i + 1).find((g) => toMinutes(g.anchor.scheduled_time!) > start);
    const end = a.end_time ? toMinutes(a.end_time) : next ? toMinutes(next.anchor.scheduled_time!) : 24 * 60;
    return { start, end };
  };
  const firstOpen = (i: number) => anchors[i].rows.map((r) => r.habit).find((h) => counts(h) && open(h)) ?? null;
  const forItem = (h: Habit | null) =>
    h ? { item: itemText(h), actions: itemActions(h) } : { item: null, actions: [] };

  // Morning: before the first anchor ends, the weekly intention and the first open item under it.
  if (anchors.length && nowMin < windowOf(0).end) {
    const h = firstOpen(0);
    return {
      ...empty,
      kind: 'morning',
      big: intention?.trim() || 'Good morning',
      small: h ? `First: ${h.name}` : null,
      ...forItem(h),
    };
  }

  // During an anchor.
  const i = anchors.findIndex((_, k) => {
    const w = windowOf(k);
    return w.start <= nowMin && nowMin < w.end && w.end < 24 * 60;
  });
  if (i >= 0) {
    const w = windowOf(i);
    const h = firstOpen(i);
    const endHm = `${String(Math.floor(w.end / 60)).padStart(2, '0')}:${String(w.end % 60).padStart(2, '0')}`;
    return {
      ...empty,
      kind: 'anchor',
      big: anchors[i].anchor.name,
      small: `until ${formatTime(endHm)} · ${formatDuration(w.end - nowMin)} left`,
      ring: w,
      ...forItem(h),
    };
  }

  // Free time: three open want habits or activities.
  const picks = freePicks(habits, idx, ctx);
  return {
    ...empty,
    kind: 'free',
    big: 'Free time.',
    small: picks.length ? 'Pick one:' : 'Nothing open right now.',
    actions: picks.map((h) =>
      h.kind === 'activity'
        ? ({ kind: 'focus', label: h.name } as const)
        : ({ kind: 'timer', habitId: h.id, which: 0, label: h.name } as const),
    ),
  };
}
