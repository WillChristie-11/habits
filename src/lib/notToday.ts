// "Not today is allowed. What's in the way?" Reasons for passing on an avoid habit, and what
// each leads to. Saved in the not_today table; never counted against the habit.

export type NotTodayReason = 'unclear' | 'too_big' | 'tired' | 'worried' | 'no_time' | 'other';

export interface NotToday {
  id: number;
  habit_id: number;
  date: string;
  reason: NotTodayReason;
  note: string | null;
}

export const REASONS: { key: NotTodayReason; label: string }[] = [
  { key: 'unclear', label: 'Unclear what to do' },
  { key: 'too_big', label: 'Too big' },
  { key: 'tired', label: 'Tired' },
  { key: 'worried', label: 'Worried how it’ll go' },
  { key: 'no_time', label: 'Truly no time' },
  { key: 'other', label: 'Something else…' },
];

export const isReason = (v: unknown): v is NotTodayReason => REASONS.some((r) => r.key === v);

/** What follows a reason: a question that becomes tomorrow's step, a smaller step, the record, or nothing. */
export type FollowUp = 'firstStep' | 'smaller' | 'restUntilMorning' | 'record' | 'none' | 'note';

export const followUp = (r: NotTodayReason): FollowUp =>
  ({
    unclear: 'firstStep',
    too_big: 'smaller',
    tired: 'restUntilMorning',
    worried: 'record',
    no_time: 'none',
    other: 'note',
  })[r] as FollowUp;

/** The step list with a new next step put in at the current position (the old one follows it). */
export function withNextStep(ladder: string[], index: number, step: string): { ladder: string[]; index: number } {
  const i = Math.max(0, Math.min(index, ladder.length));
  return { ladder: [...ladder.slice(0, i), step.trim(), ...ladder.slice(i)], index: i };
}

/** The reasons given on a date for a habit (latest last). */
export const reasonsOn = (list: NotToday[], habitId: number, date: string) =>
  list.filter((n) => n.habit_id === habitId && n.date === date);
