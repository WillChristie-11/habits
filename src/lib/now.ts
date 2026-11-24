// The Now page: what the opening screen says at this moment, and in which layout and colour.
// Pure; tested. Never shows %, misses, flags or behind-pace.
//   A (morning, amber):  "Good morning. Working toward" + the goal large, today's step, first item
//   B (anchor, blue; evening, violet): time left large, the next item, Done / Start + Get ready
//   C (free time, blue): "Free time", three picks
//   done: "You're done for today." and a one-line summary
import type { Habit, ReminderSettings } from '../types';
import { formatDuration, formatTime, weekDays, weekStart } from './dates';
import { counts, stateOn, todayGroups, toMinutes, visibleOn, type Ctx, type RecordIndex } from './schedule';
import { nudgeStart } from './reminders';
import { habitTimerButtons, isMeditateHabit } from './timers';

export type NowKind = 'morning' | 'anchor' | 'free' | 'evening' | 'done';
export type NowTone = 'morning' | 'day' | 'evening';
export type NowLayout = 'A' | 'B' | 'C' | 'done';

/** Done (want habits) or Start (avoid: its Focus round), Get ready (Clear head · 5), a free-time pick, or the journal. */
export type NowAction =
  | { kind: 'done'; habitId: number; label: string }
  | { kind: 'start'; habitId: number; label: string }
  | { kind: 'getReady'; habitId: number; label: string }
  | { kind: 'timer'; habitId: number; which: 0 | 1; label: string }
  | { kind: 'focus'; label: string }
  | { kind: 'journal'; label: string };

export interface NowItem {
  habitId: number;
  /** the item's name (avoid habits: their next ladder step) */
  text: string;
  /** shown on the card for items with a timer of their own (a meditation habit: 10) */
  minutes: number | null;
}

export interface NowContent {
  kind: NowKind;
  tone: NowTone;
  layout: NowLayout;
  /** small line above the big one ("Good morning. Working toward") */
  kicker: string | null;
  big: string;
  small: string | null;
  /** label over the item card ("First up, after Wake up", "Next in Work block") */
  itemLabel: string | null;
  item: NowItem | null;
  /** During an anchor: its window in minutes of the day, for the ring. */
  ring: { start: number; end: number } | null;
  actions: NowAction[];
}

const isAvoid = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'avoid';
const isWant = (h: Habit) => h.kind === 'habit' && h.habit_kind === 'want';
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** The item card: name (avoid: next step) and, for items with their own timer, its minutes. */
export function nowItem(h: Habit): NowItem {
  const main = habitTimerButtons(h)[0];
  return {
    habitId: h.id,
    text: isAvoid(h) ? (h.ladder[h.ladder_index] ?? h.name) : h.name,
    minutes: isAvoid(h) || isMeditateHabit(h) ? main.minutes : null,
  };
}

/** Done (or Start for an avoid habit: its Focus round) and Get ready (Clear head · 5 first). */
export function itemActions(h: Habit): NowAction[] {
  return [
    isAvoid(h) ? { kind: 'start', habitId: h.id, label: 'Start' } : { kind: 'done', habitId: h.id, label: 'Done' },
    { kind: 'getReady', habitId: h.id, label: 'Get ready' },
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

/** Want habits and activities still open today, the ones done least this week first (at most 3). */
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

/** Amber in the morning, blue through the day, violet from the evening nudge. */
export function toneAt(nowMin: number, r: ReminderSettings): NowTone {
  if (nowMin >= toMinutes(nudgeStart(r))) return 'evening';
  return nowMin < 12 * 60 ? 'morning' : 'day';
}

export function nowContent(args: {
  habits: Habit[];
  idx: RecordIndex;
  ctx: Ctx;
  now: Date;
  r: ReminderSettings;
  /** the goal to show in the morning (the first goal) */
  goal: string | null;
}): NowContent {
  const { habits, idx, ctx, now, r, goal } = args;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const visible = (h: Habit) => visibleOn(h, idx, ctx);
  const open = (h: Habit) => stateOn(h, idx, ctx.today, ctx) === 'pending';
  const groups = todayGroups(habits, visible);
  const anchors = groups.anchors.filter((g) => g.anchor.scheduled_time);
  const items = habits.filter((h) => visible(h) && (h.kind === 'anchor' || counts(h)));
  const base = { kicker: null, itemLabel: null, item: null, ring: null, actions: [] as NowAction[] };
  const forItem = (h: Habit | null | undefined) => (h ? { item: nowItem(h), actions: itemActions(h) } : {});

  // Everything done today.
  if (items.length && !items.some(open)) {
    return {
      ...base,
      kind: 'done',
      tone: toneAt(nowMin, r),
      layout: 'done',
      big: 'You’re done for today.',
      small: daySummary(habits, idx, ctx.today),
    };
  }

  // Evening, from the evening nudge's start: time until the deadline, what's next, the journal.
  const deadline = toMinutes(r.eveningDeadline);
  if (nowMin >= toMinutes(nudgeStart(r))) {
    const left = habits.filter((h) => visible(h) && counts(h) && open(h));
    const next = left[0];
    return {
      ...base,
      kind: 'evening',
      tone: 'evening',
      layout: 'B',
      big: nowMin < deadline ? formatDuration(deadline - nowMin) : 'Wind down',
      small: nowMin < deadline ? `until ${formatTime(r.eveningDeadline)} · wind down` : 'The day is nearly done.',
      itemLabel: next ? (left.length > 1 ? `Left tonight · ${left.length - 1} more after this` : 'Left tonight') : null,
      ...forItem(next),
      actions: [...(next ? itemActions(next) : []), { kind: 'journal', label: 'Write in journal' }],
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
  const firstOpen = (i: number) => anchors[i].rows.map((x) => x.habit).find((h) => counts(h) && open(h)) ?? null;

  // Morning: before the first anchor's window ends.
  if (anchors.length && nowMin < windowOf(0).end) {
    const h = firstOpen(0);
    return {
      ...base,
      kind: 'morning',
      tone: 'morning',
      layout: 'A',
      kicker: goal ? 'Good morning. Working toward' : null,
      big: goal ?? 'Good morning',
      small: null,
      itemLabel: h ? `First up, after ${anchors[0].anchor.name}` : null,
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
    return {
      ...base,
      kind: 'anchor',
      tone: toneAt(nowMin, r),
      layout: 'B',
      big: formatDuration(w.end - nowMin),
      small: `left in ${anchors[i].anchor.name} · until ${formatTime(hm(w.end))}`,
      ring: w,
      itemLabel: h ? `Next in ${anchors[i].anchor.name}` : null,
      ...forItem(h),
    };
  }

  // Free time: three open want habits or activities.
  const picks = freePicks(habits, idx, ctx);
  return {
    ...base,
    kind: 'free',
    tone: toneAt(nowMin, r),
    layout: 'C',
    big: 'Free time',
    small: picks.length ? 'Pick one:' : 'Nothing open right now.',
    actions: picks.map((h) =>
      h.kind === 'activity'
        ? ({ kind: 'focus', label: h.name } as const)
        : ({ kind: 'timer', habitId: h.id, which: 0, label: h.name } as const),
    ),
  };
}
