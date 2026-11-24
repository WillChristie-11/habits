// Goals (1–3 long-term goals, each with linked habits / activities) and Today's step toward one.
// Pure; tested. Replaces "Today's door": the step is the next ladder rung of a linked avoid habit
// (picked the same way the door was) or a step typed for today.
import type { Habit, Priority } from '../types';
import { addDays } from './dates';
import { doorPick, type DoorState } from './insights';
import type { Ctx, RecordIndex } from './schedule';

export const MAX_GOALS = 3;

export interface Goal {
  id: number;
  name: string;
  why: string | null;
  /** linked habit and activity ids */
  links: number[];
  order: number;
}

/** A step typed for a day ("Pick today's step"); it also appears as a priority. */
export interface GoalStep {
  id: number;
  goal_id: number;
  date: string;
  text: string;
  priority_id: number | null;
  /** 'not_today' when passed on; done comes from its priority */
  status: 'open' | 'not_today';
}

export type StepState = 'open' | 'done' | 'not_today';

export type TodaysStep =
  | { kind: 'habit'; goal: Goal | null; habit: Habit; text: string; state: StepState }
  | { kind: 'typed'; goal: Goal; step: GoalStep; text: string; state: StepState }
  | { kind: 'none'; goal: Goal };

const fromDoor = (s: DoorState): StepState => (s === 'opened' ? 'done' : s === 'not_today' ? 'not_today' : 'open');

/** A typed step's state: done when its priority is checked. */
export function typedState(step: GoalStep, priorities: Priority[]): StepState {
  if (step.status === 'not_today') return 'not_today';
  const p = priorities.find((x) => x.id === step.priority_id);
  return p?.done_on ? 'done' : 'open';
}

/**
 * The goal card's step for today: a step typed for today first; else the door's pick among the
 * avoid habits linked to a goal (started least this week, ties to the one not started longest);
 * else the first goal, waiting for "Pick today's step". With no goals, the door's pick among all
 * avoid habits (no "Toward" line). Null when there's nothing to show.
 */
export function todaysStep(args: {
  goals: Goal[];
  steps: GoalStep[];
  priorities: Priority[];
  habits: Habit[];
  idx: RecordIndex;
  ctx: Ctx;
  weekStartKey: string;
}): TodaysStep | null {
  const { goals, steps, priorities, habits, idx, ctx, weekStartKey } = args;
  const ordered = [...goals].sort((a, b) => a.order - b.order || a.id - b.id);
  for (const g of ordered) {
    const step = steps.filter((s) => s.goal_id === g.id && s.date === ctx.today).at(-1);
    if (step) return { kind: 'typed', goal: g, step, text: step.text, state: typedState(step, priorities) };
  }
  const linked = new Set(ordered.flatMap((g) => g.links));
  const pool = ordered.length ? habits.filter((h) => linked.has(h.id)) : habits;
  const door = doorPick(pool, idx, ctx, weekStartKey);
  if (door) {
    const goal = ordered.find((g) => g.links.includes(door.habit.id)) ?? null;
    const text = door.habit.ladder[door.habit.ladder_index] ?? `Open ${door.habit.name.toLowerCase()} and look`;
    return { kind: 'habit', goal, habit: door.habit, text, state: fromDoor(door.state) };
  }
  return ordered[0] ? { kind: 'none', goal: ordered[0] } : null;
}

export interface StepTaken {
  date: string;
  text: string;
}

/**
 * Steps taken toward a goal on the given days, newest first: each linked habit or activity done
 * (avoid habits read as "<name> session") and each typed step whose priority was checked.
 */
export function stepsTaken(
  goal: Goal,
  habits: Habit[],
  idx: RecordIndex,
  steps: GoalStep[],
  priorities: Priority[],
  days: string[],
): StepTaken[] {
  const out: StepTaken[] = [];
  for (const h of habits.filter((x) => goal.links.includes(x.id))) {
    for (const d of days) {
      if (idx.get(h.id)?.get(d)?.status !== 'done') continue;
      out.push({ date: d, text: h.kind === 'habit' && h.habit_kind === 'avoid' ? `${h.name} session` : h.name });
    }
  }
  for (const s of steps.filter((x) => x.goal_id === goal.id && days.includes(x.date))) {
    if (typedState(s, priorities) === 'done') out.push({ date: s.date, text: s.text });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.text.localeCompare(b.text));
}

/** The last 4 weeks (28 days) up to today, for the goal page. */
export const lastFourWeeks = (today: string) => Array.from({ length: 28 }, (_, i) => addDays(today, -i));
