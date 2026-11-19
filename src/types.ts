export type Section = 'morning' | 'evening' | 'week';

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

export interface Habit {
  id: number;
  name: string;
  section: Section;
  why: string | null;
  minimum_version: string | null;
  frequency: Frequency;
  order: number;
  stack_after: number | null;
  paused_from: string | null; // YYYY-MM-DD
  paused_until: string | null; // YYYY-MM-DD (inclusive)
  created_at: string; // ISO timestamp
}

export type RecordStatus = 'done' | 'skipped' | 'missed' | 'paused';

export interface DayRecord {
  habit_id: number;
  date: string; // YYYY-MM-DD (local)
  status: RecordStatus;
  feeling: number | null; // 1–5
  timestamp: string; // ISO
}

/** Computed state of a habit on one day, used for dots and progress. */
export type DayState =
  | 'done'
  | 'skipped'
  | 'paused'
  | 'missed'
  | 'pending' // today, expected, not done yet
  | 'none'; // not expected that day (or before the habit existed)

export const SECTION_LABELS: Record<Section, string> = {
  morning: 'Morning',
  evening: 'Evening',
  week: 'This week',
};

export const FEELINGS = ['Drained', 'Meh', 'Okay', 'Good', 'Great'] as const;

export type HabitInput = Omit<Habit, 'id' | 'order' | 'created_at' | 'paused_from' | 'paused_until'>;
