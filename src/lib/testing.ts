// Builders for unit tests (not app code).
import type { DayRecord, Frequency, Habit } from '../types';

let nextId = 1000;

export function habit(frequency: Frequency, extra: Partial<Habit> = {}): Habit {
  return {
    id: nextId++,
    kind: 'habit',
    name: `h${nextId}`,
    why: null,
    minimum_version: null,
    messages: [],
    habit_kind: 'want',
    session_minutes: 15,
    ready_minutes: 3,
    ask_note: false,
    check_minutes: 45,
    locked: false,
    unit: null,
    target_min: null,
    target_max: null,
    ladder: [],
    ladder_index: 0,
    pair_with: null,
    plan_when: null,
    plan_action: null,
    obstacle: null,
    frequency,
    order: 0,
    stack_after: null,
    paused_from: null,
    paused_until: null,
    created_at: '2026-11-01T08:00:00',
    scheduled_time: null,
    end_time: null,
    reminder: false,
    remind_before: 0,
    meta: null,
    ...extra,
  };
}

export const rec = (h: Habit, date: string, status: DayRecord['status'] = 'done'): DayRecord => ({
  habit_id: h.id,
  date,
  status,
  feeling: null,
  timestamp: date + 'T09:00:00',
  meta: null,
});
