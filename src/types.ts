export type Section = 'morning' | 'evening' | 'week';

/** "habit" is tracked (%, feeling, dots). "anchor" is a scheduled routine item (Wake up, Work). */
export type ItemKind = 'habit' | 'anchor';

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
  /** Anchors: derived from time (not shown). Habits: Morning / Evening, or "week" for weekly_count / every_n_days. */
  section: Section;
  why: string | null;
  minimum_version: string | null;
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

/** Computed state of an item on one day, used for dots and progress. */
export type DayState =
  | 'done'
  | 'skipped'
  | 'paused'
  | 'missed'
  | 'pending' // today, expected, not done yet
  | 'none'; // not expected that day (or before the item existed)

export const SECTION_LABELS: Record<Section, string> = {
  morning: 'Morning',
  evening: 'Evening',
  week: 'This week',
};

export const FEELINGS = ['Drained', 'Meh', 'Okay', 'Good', 'Great'] as const;

export type HabitInput = Omit<Habit, 'id' | 'order' | 'created_at' | 'paused_from' | 'paused_until'>;

export const isAnchor = (h: Habit) => h.kind === 'anchor';
export const isHabit = (h: Habit) => h.kind === 'habit';
