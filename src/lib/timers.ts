// Pure rules for the Focus (pomodoro) and Meditate timers. Not tracked unless linked to a habit;
// the only number anywhere is the Sunday recap's Focus line.

export type TimerKind = 'focus' | 'meditate';

export const FOCUS_LENGTHS = [5, 15, 25, 50] as const;
export const MEDITATE_LENGTHS = [1, 3, 5, 10, 20] as const;
export const DEFAULT_MINUTES: Record<TimerKind, number> = { focus: 25, meditate: 10 };
export const ROUNDS_PER_SET = 4;
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;

export const timerName = (k: TimerKind) => (k === 'focus' ? 'Focus' : 'Meditate');

/** "round 2 of 4" and the dots (●●○○) for the round about to run, from rounds finished today. */
export function focusRound(roundsDoneToday: number) {
  const inSet = roundsDoneToday % ROUNDS_PER_SET;
  return { round: inSet + 1, of: ROUNDS_PER_SET, filled: inSet };
}

/** Break after finishing a round: every 4th break in a day is long. `roundsDoneToday` includes it. */
export function breakMinutes(roundsDoneToday: number): number {
  return roundsDoneToday > 0 && roundsDoneToday % ROUNDS_PER_SET === 0 ? LONG_BREAK : SHORT_BREAK;
}

/** "18:42" */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "Focus · 18:42 left" for the running bar. */
export const runningText = (k: TimerKind, phase: 'focus' | 'break', ms: number) =>
  `${phase === 'break' ? 'Break' : timerName(k)} · ${clock(ms)} left`;

/** "2 h 30 min" / "45 min" */
export function hoursMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export interface FocusRound {
  date: string;
  minutes: number;
}

/** Sunday recap: "Focus: 6 rounds · 2 h 30 min" when there were rounds that week, else null. */
export function focusRecapLine(log: FocusRound[], days: string[]): string | null {
  const rounds = log.filter((r) => days.includes(r.date));
  if (!rounds.length) return null;
  const total = rounds.reduce((sum, r) => sum + r.minutes, 0);
  return `Focus: ${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'} · ${hoursMinutes(total)}`;
}

/** Meditate's tint lightens slowly over the session, about 40% → 15%. */
export const meditateTint = (progress: number) =>
  Math.round((0.4 - 0.25 * Math.min(1, Math.max(0, progress))) * 1000) / 1000;

/** A habit linked to a timer (Add / edit sheet → More options → Timer), stored in its meta. */
export function linkedTimer(meta: Record<string, unknown> | null | undefined): TimerKind | null {
  const v = meta?.timer;
  return v === 'focus' || v === 'meditate' ? v : null;
}

/** Lengths when a timer is started from a habit (the tab keeps its own last-used lengths). */
export const FROM_HABIT = { focus: 25, meditate: 10, clearHead: 5 } as const;

/** Meditate is a habit's main timer if its Timer setting says so, or its name mentions meditating. */
export function isMeditateHabit(h: { name: string; meta?: Record<string, unknown> | null }): boolean {
  return linkedTimer(h.meta) === 'meditate' || /meditat/i.test(h.name);
}

export interface HabitTimerButton {
  kind: TimerKind;
  minutes: number;
  label: string;
  /** Clear head: Meditate that never checks the habit off, then offers Focus. */
  clearHead: boolean;
}

/**
 * The two timer buttons on a habit's detail sheet: Focus · 25 and Clear head · 5, or for a
 * meditation habit Meditate · 10 and Focus · 25.
 */
export function habitTimerButtons(h: {
  name: string;
  meta?: Record<string, unknown> | null;
}): [HabitTimerButton, HabitTimerButton] {
  const focus: HabitTimerButton = {
    kind: 'focus',
    minutes: FROM_HABIT.focus,
    label: `Focus · ${FROM_HABIT.focus}`,
    clearHead: false,
  };
  if (isMeditateHabit(h))
    return [
      { kind: 'meditate', minutes: FROM_HABIT.meditate, label: `Meditate · ${FROM_HABIT.meditate}`, clearHead: false },
      focus,
    ];
  return [
    focus,
    { kind: 'meditate', minutes: FROM_HABIT.clearHead, label: `Clear head · ${FROM_HABIT.clearHead}`, clearHead: true },
  ];
}
