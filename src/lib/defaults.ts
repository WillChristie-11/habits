import type { HabitInput } from '../types';

/** Anchors a brand-new install starts with. All editable and deletable. */
export function defaultAnchors(): HabitInput[] {
  const anchor = (name: string, time: string, end: string | null): HabitInput => ({
    kind: 'anchor',
    name,
    why: null,
    minimum_version: null,
    messages: [],
    habit_kind: 'want',
    session_minutes: 15,
    ready_minutes: 3,
    unit: null,
    target_min: null,
    target_max: null,
    ladder: [],
    ladder_index: 0,
    pair_with: null,
    plan_when: null,
    plan_action: null,
    obstacle: null,
    frequency: { type: 'daily' },
    stack_after: null,
    scheduled_time: time,
    end_time: end,
    reminder: false,
    remind_before: 0,
    meta: null,
  });
  return [anchor('Wake up', '07:00', null), anchor('Work block', '09:00', '17:00'), anchor('Wind down', '21:30', null)];
}

/** "Get ready" countdown lengths offered per item, in minutes. */
export const READY_OPTIONS = [1, 3, 5, 10] as const;
