/** Today's groups for habits that aren't under an anchor. */
export type Bucket = 'anytime' | 'week';

/**
 * "habit" is tracked (%, feeling, dots). "anchor" is a scheduled routine item (Wake up, Work).
 * "activity" is something you just log when it happens (Run, Bike): no schedule, never missed.
 */
export type ItemKind = 'habit' | 'anchor' | 'activity';

/** Units an activity's amount can be logged in. */
export type ActivityUnit = 'mi' | 'min';

/** want = something you want to do (done when finished); avoid = something you put off (done once started). */
/** want = do it; avoid = put off, a session counts; cut_back = do less, only logged when it happens. */
export type HabitKind = 'want' | 'avoid' | 'cut_back';

export type FrequencyType = 'daily' | 'weekly_count' | 'specific_days' | 'every_n_days';

export interface Frequency {
  type: FrequencyType;
  /** weekly_count: sessions per week */
  count?: number;
  /** specific_days: weekdays, 0 = Sunday … 6 = Saturday */
  days?: number[];
  /** every_n_days: interval in days */
  n?: number;
}

/**
 * Free-form extension data. Reserved for future features (e.g. a training log:
 * `{ training: { types: ['long_run', 'legs'] } }` on a habit, and
 * `{ session: 'long_run', intensity: 2 }` on a record) so they don't need a migration.
 */
export type Meta = Record<string, unknown>;

export interface Habit {
  id: number;
  kind: ItemKind;
  name: string;
  why: string | null;
  minimum_version: string | null;
  /** Extra motivational lines; rotate in notifications alongside `why`. */
  messages: string[];
  /** Habits only. Named habit_kind because `kind` already separates habits from anchors. */
  habit_kind: HabitKind;
  /** Length of a "Start N min" session. */
  session_minutes: number;
  /** Length of the "Get ready" transition countdown (1 / 3 / 5 / 10). */
  ready_minutes: number;
  /** Ordered small concrete steps; the row shows only ladder[ladder_index]. */
  ladder: string[];
  /** Index of the next step (== ladder.length when the ladder is finished). */
  ladder_index: number;
  /** Something pleasant to pair the session with, e.g. "good coffee". */
  pair_with: string | null;
  /** Habits and anchors: after check-off, offer a one-line "what did you do?" prompt. */
  ask_note: boolean;
  /** Cut-back: minutes after a log to ask "How do you feel now?" (default 45). */
  check_minutes: number;
  /** Cut-back: the Tempted? screen needs Face ID; the name is hidden elsewhere. */
  locked: boolean;
  /** Activities: what an amount is measured in (null = count only). */
  unit: ActivityUnit | null;
  /** Activities: optional weekly goal = target_max (target_min is legacy), shown only in the Sunday recap. */
  target_min: number | null;
  target_max: number | null;
  /** Implementation intention: "When <plan_when>, I will <plan_action>." */
  plan_when: string | null;
  plan_action: string | null;
  /** Obstacle plan: "If <obstacle>, then I'll do the minimum version." */
  obstacle: string | null;
  /** Anchors use daily or specific_days only. */
  frequency: Frequency;
  order: number;
  /** Habit or anchor id this one follows. */
  stack_after: number | null;
  /** 'HH:MM' 24h. Anchors always have one; habits optionally (places them on the timeline). */
  scheduled_time: string | null;
  /** 'HH:MM', anchors only, optional */
  end_time: string | null;
  reminder: boolean;
  /** minutes before scheduled_time to notify */
  remind_before: number;
  paused_from: string | null; // YYYY-MM-DD
  paused_until: string | null; // YYYY-MM-DD (inclusive)
  created_at: string; // ISO timestamp
  meta: Meta | null;
}

export type RecordStatus = 'done' | 'skipped' | 'missed' | 'paused';

export interface DayRecord {
  habit_id: number;
  date: string; // YYYY-MM-DD (local)
  status: RecordStatus;
  feeling: number | null; // 1–5, habits only
  timestamp: string; // ISO
  meta: Meta | null;
}

/** One cut-back log ("it happened"), with the follow-up feeling and note if given. */
export interface Occurrence {
  id: number;
  habit_id: number;
  at: string; // ISO
  feeling: number | null;
  note: string | null;
}

/**
 * A one-off task for today. Never counted, flagged or reminded about. Open ones carry over to the
 * next day until checked; a checked one stays on the day it was checked.
 */
export interface Priority {
  id: number;
  text: string;
  created_on: string; // YYYY-MM-DD
  done_on: string | null; // YYYY-MM-DD
}

/** Computed state of an item on one day, used for dots and progress. */
export type DayState =
  | 'done'
  | 'skipped'
  | 'paused'
  | 'missed'
  | 'pending' // today, expected, not done yet
  | 'none'; // not expected that day (or before the item existed)

export const FEELINGS = ['Drained', 'Meh', 'Okay', 'Good', 'Great'] as const;

export type HabitInput = Omit<Habit, 'id' | 'order' | 'created_at' | 'paused_from' | 'paused_until'>;

export const isAnchor = (h: Habit) => h.kind === 'anchor';
export const isHabit = (h: Habit) => h.kind === 'habit';

/** The Journal: one free-form page per day. Never counted, flagged or reminded about. */
export interface JournalPage {
  date: string; // YYYY-MM-DD
  text: string;
  updated_at: string;
}

export interface Snooze {
  habitId: number;
  date: string; // the day the item belongs to
  at: string; // ISO time to remind again
}

export interface ReminderSettings {
  morningEnabled: boolean;
  morningTime: string; // 'HH:MM'
  eveningEnabled: boolean;
  /** evening deadline; the nudge starts 2 h before */
  eveningDeadline: string; // 'HH:MM'
  /** date key the morning banner was dismissed on */
  morningDismissedOn: string | null;
  snoozes: Snooze[];
  /** General motivational lines, used for any habit. */
  messages: string[];
  checkins: CheckinSettings;
  /** Close the day? at the Wind down time. */
  closeDayEnabled: boolean;
  /** "Pause all reminders today": the date it was turned on (it lapses at midnight). */
  pausedOn: string | null;
  /** Single occurrences silenced from the Upcoming list (notification ids, which carry their date). */
  silenced: string[];
  /** Focus / break / Meditate end alerts. */
  timerAlerts: boolean;
}

/** Random check-ins: a few nudges a day at unpredictable times, about something still open. */
export interface CheckinSettings {
  enabled: boolean;
  /** per day */
  count: number;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  /** minimum minutes between two check-ins */
  spacing: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  morningEnabled: true,
  morningTime: '07:30',
  eveningEnabled: true,
  eveningDeadline: '22:00',
  morningDismissedOn: null,
  snoozes: [],
  messages: [],
  checkins: { enabled: true, count: 2, start: '09:00', end: '21:00', spacing: 90 },
  closeDayEnabled: true,
  pausedOn: null,
  silenced: [],
  timerAlerts: true,
};
