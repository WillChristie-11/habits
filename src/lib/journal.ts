// Pure Journal logic. The Journal is one free-form page per day; nothing in it is ever counted,
// flagged or reminded about. The only derived thing is the Sunday recap, which shows counts and
// totals of what was done (never %, misses or flags).
import type { Habit } from '../types';
import { weekDays } from './dates';
import { timeline, type Ctx, type RecordIndex } from './schedule';

export function firstLine(text: string | undefined | null): string {
  return (text ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
}

/** Dates for the date wheel: days with a page, plus today (oldest → newest). */
export function pageDates(pages: Record<string, string>, today: string): string[] {
  const set = new Set(Object.keys(pages).filter((d) => pages[d]?.trim() && d <= today));
  set.add(today);
  return [...set].sort();
}

export interface WeekCount {
  habit: Habit;
  count: number;
  text: string;
}

const fmtAmount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "you usually aim for 2–3" from an activity's soft weekly target. */
export function targetText(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = min ?? max!;
  const hi = max ?? min!;
  return `you usually aim for ${lo === hi ? lo : `${lo}–${hi}`}`;
}

/**
 * "What I did this week", counts only: how many days each habit or activity was done Mon–Sun (up to
 * today). Items with nothing done are left out, so there's nothing to read as a miss.
 * Want habits: "Read 5×". Avoid habits count sessions: "4 Apply to jobs sessions".
 * Activities: "Run 3× · 14 mi · you usually aim for 2–3".
 */
export function weekCounts(habits: Habit[], idx: RecordIndex, ctx: Ctx, sunday: string): WeekCount[] {
  const days = weekDays(sunday).filter((d) => d <= ctx.today);
  if (!days.length) return [];
  const out: WeekCount[] = [];
  for (const h of habits) {
    if (h.kind === 'anchor') continue;
    const tl = timeline(h, idx, days[0], days[days.length - 1], ctx);
    const doneDays = days.filter((d) => tl.states.get(d) === 'done');
    const count = doneDays.length;
    if (!count) continue;
    let text: string;
    if (h.kind === 'activity') {
      const total = doneDays.reduce((sum, d) => sum + (Number(idx.get(h.id)?.get(d)?.meta?.amount) || 0), 0);
      const parts = [`${h.name} ${count}×`];
      if (h.unit && total > 0) parts.push(`${fmtAmount(total)} ${h.unit === 'min' ? 'min' : 'mi'}`);
      const target = targetText(h.target_min, h.target_max);
      if (target) parts.push(target);
      text = parts.join(' · ');
    } else {
      text = h.habit_kind === 'avoid' ? `${count} ${h.name} ${count === 1 ? 'session' : 'sessions'}` : `${h.name} ${count}×`;
    }
    out.push({ habit: h, count, text });
  }
  return out.sort((a, b) => b.count - a.count || a.habit.order - b.habit.order);
}

/** The first line of each page Mon–Sat of the week ending on `sunday`. */
export function recapLines(pages: Record<string, string>, sunday: string): { date: string; line: string }[] {
  return weekDays(sunday)
    .filter((d) => d < sunday) // Mon–Sat
    .map((date) => ({ date, line: firstLine(pages[date]) }))
    .filter((x) => x.line);
}

/** v6 structured entry → plain lines for its day's page (used once, by the v7 migration). */
export function entryToLines(type: string, raw: string): string[] {
  let d: Record<string, string> = {};
  try {
    d = JSON.parse(raw) ?? {};
  } catch {}
  const t = (s?: string) => (s ?? '').trim();
  const lines: string[] = [];
  if (type === 'intention' || type === 'note') {
    if (t(d.text)) lines.push(type === 'note' ? `Note: ${t(d.text)}` : t(d.text));
  } else if (type === 'reflection') {
    if (t(d.wentWell)) lines.push(`Went well: ${t(d.wentWell)}`);
    if (t(d.inTheWay)) lines.push(`Got in the way: ${t(d.inTheWay)}`);
  } else if (type === 'weekly') {
    if (t(d.liked)) lines.push(`Liked this week: ${t(d.liked)}`);
    if (t(d.didntWork)) lines.push(`Didn't work: ${t(d.didntWork)}`);
    if (t(d.changes)) lines.push(`Next week: ${t(d.changes)}`);
  }
  return lines;
}
