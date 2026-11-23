// Close the day: pure rules. One short sheet at Wind down (reflection, one action item, one
// "better tomorrow" line). Never counted, flagged or reminded about beyond its one notification.
import type { Habit } from '../types';

export interface DayClose {
  date: string;
  reflection: string | null;
  action: string | null;
  better: string | null;
}

const PREFIX = { reflection: 'Reflection: ', action: 'Action: ', better: 'Better tomorrow: ' } as const;
/** After this time an anchor can stand in for Wind down. */
const EVENING = '20:00';

const clean = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** The sheet's fields, trimmed; empty fields become null. */
export function tidyClose(date: string, f: { reflection?: string; action?: string; better?: string }): DayClose {
  return { date, reflection: clean(f.reflection), action: clean(f.action), better: clean(f.better) };
}

/** An empty sheet saves nothing. */
export const isEmptyClose = (c: DayClose) => !c.reflection && !c.action && !c.better;

/** The lines added to the day's journal page. */
export function closeLines(c: DayClose): string[] {
  return [
    c.reflection && PREFIX.reflection + c.reflection,
    c.action && PREFIX.action + c.action,
    c.better && PREFIX.better + c.better,
  ].filter((x): x is string => !!x);
}

/**
 * The journal page with the close lines added at the end. Closing the same day again replaces
 * the earlier lines rather than adding a second set.
 */
export function pageWithClose(page: string, c: DayClose): string {
  const prefixes = Object.values(PREFIX);
  const kept = page
    .split('\n')
    .filter((l) => !prefixes.some((p) => l.startsWith(p)))
    .join('\n')
    .trimEnd();
  const lines = closeLines(c);
  if (!lines.length) return kept;
  return kept ? `${kept}\n\n${lines.join('\n')}` : lines.join('\n');
}

/**
 * The anchor whose check-off opens the sheet: one named Wind down, otherwise the earliest anchor
 * at or after 8 PM.
 */
export function windDownAnchor(habits: Habit[]): Habit | undefined {
  const anchors = habits.filter((h) => h.kind === 'anchor');
  const named = anchors.find((h) => /wind\s*down/i.test(h.name));
  if (named) return named;
  return anchors
    .filter((h) => h.scheduled_time != null && h.scheduled_time >= EVENING)
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))[0];
}

/** "Read · Lift · Job search 10 min · 2 priorities": what got done today, to jog memory. */
export function glanceLine(done: { name: string; minutes?: number | null }[], prioritiesDone: number): string | null {
  const parts = done.map((d) => (d.minutes ? `${d.name} ${d.minutes} min` : d.name));
  if (prioritiesDone) parts.push(`${prioritiesDone} ${prioritiesDone === 1 ? 'priority' : 'priorities'}`);
  return parts.length ? parts.join(' · ') : null;
}

const sentence = (s: string) => s.replace(/[.!?\s]+$/, '');

/** Next morning on Today (and in the morning reminder). */
export function yesterdayLine(better: string | null | undefined): string | null {
  const b = clean(better);
  return b ? `Yesterday you said: better at ${sentence(b)}.` : null;
}

const STOP = new Set(['the', 'and', 'a', 'an', 'to', 'at', 'of', 'in', 'on', 'my', 'more', 'less', 'be', 'it', 'for']);
const words = (s: string) =>
  sentence(s)
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Sunday recap: the week's "better tomorrow" lines (oldest first), and the themes that came up
 * on 2+ days, each shown once (its latest wording) with "Make it a habit?". Two lines share a
 * theme when they're the same apart from case and punctuation, or share at least two words.
 */
export function betterRecap(closes: DayClose[], days: string[]): { lines: string[]; repeated: string[] } {
  const week = closes
    .filter((c) => days.includes(c.date) && c.better)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => c.better as string);
  const groups: string[][] = [];
  for (const line of week) {
    const w = new Set(words(line));
    const g = groups.find((grp) =>
      grp.some((other) => {
        const o = words(other);
        const same = sentence(other).toLowerCase() === sentence(line).toLowerCase();
        return same || o.filter((x) => w.has(x)).length >= 2;
      }),
    );
    if (g) g.push(line);
    else groups.push([line]);
  }
  return { lines: week, repeated: groups.filter((g) => g.length >= 2).map((g) => g[g.length - 1]) };
}
