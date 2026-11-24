import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { habit, rec } from './testing';
import { lastFourWeeks, stepsTaken, todaysStep, type Goal, type GoalStep } from './goals';
import type { Priority } from '../types';

const daily = { type: 'daily' } as const;
const ctx = { today: '2026-11-25' };
const week = '2026-11-23';
const apply = habit(daily, { name: 'Job search', habit_kind: 'avoid', ladder: ['Open the tracker', 'Pick one'] });
const taxes = habit(daily, { name: 'Taxes', habit_kind: 'avoid' });
const run = habit(daily, { kind: 'activity', name: 'Run' });
const gis: Goal = { id: 1, name: 'Land a GIS job', why: 'Work I like', links: [apply.id, run.id], order: 0 };
const all = [apply, taxes, run];

test("today's step: the door's pick among a goal's linked avoid habits, its next rung", () => {
  const s = todaysStep({
    goals: [gis],
    steps: [],
    priorities: [],
    habits: all,
    idx: indexRecords([]),
    ctx,
    weekStartKey: week,
  });
  assert.equal(s?.kind, 'habit');
  assert.deepEqual(s?.kind === 'habit' && [s.goal?.name, s.habit.name, s.text, s.state], [
    'Land a GIS job',
    'Job search',
    'Open the tracker',
    'open',
  ]);
  const opened = todaysStep({
    goals: [gis],
    steps: [],
    priorities: [],
    habits: all,
    idx: indexRecords([rec(apply, ctx.today)]),
    ctx,
    weekStartKey: week,
  });
  assert.equal(opened?.kind === 'habit' && opened.state, 'done');
});

test("today's step: a typed step wins, done when its priority is checked; none waits for a pick", () => {
  const step: GoalStep = { id: 5, goal_id: 1, date: ctx.today, text: 'Email Sam', priority_id: 9, status: 'open' };
  const open: Priority = { id: 9, text: 'Email Sam', created_on: ctx.today, done_on: null };
  const s = todaysStep({
    goals: [gis],
    steps: [step],
    priorities: [open],
    habits: all,
    idx: indexRecords([]),
    ctx,
    weekStartKey: week,
  });
  assert.deepEqual(s?.kind === 'typed' && [s.text, s.state], ['Email Sam', 'open']);
  const done = todaysStep({
    goals: [gis],
    steps: [step],
    priorities: [{ ...open, done_on: ctx.today }],
    habits: all,
    idx: indexRecords([]),
    ctx,
    weekStartKey: week,
  });
  assert.equal(done?.kind === 'typed' && done.state, 'done');
  const passed = todaysStep({
    goals: [gis],
    steps: [{ ...step, status: 'not_today' }],
    priorities: [open],
    habits: all,
    idx: indexRecords([]),
    ctx,
    weekStartKey: week,
  });
  assert.equal(passed?.kind === 'typed' && passed.state, 'not_today');
  const lone: Goal = { ...gis, id: 2, links: [run.id] };
  assert.equal(
    todaysStep({
      goals: [lone],
      steps: [],
      priorities: [],
      habits: all,
      idx: indexRecords([]),
      ctx,
      weekStartKey: week,
    })?.kind,
    'none',
  );
});

test("today's step: with no goals, the door's pick among all avoid habits; nothing at all gives null", () => {
  const s = todaysStep({
    goals: [],
    steps: [],
    priorities: [],
    habits: all,
    idx: indexRecords([rec(apply, '2026-11-24')]),
    ctx,
    weekStartKey: week,
  });
  assert.deepEqual(s?.kind === 'habit' && [s.goal, s.habit.name], [null, 'Taxes']);
  assert.equal(
    todaysStep({ goals: [], steps: [], priorities: [], habits: [run], idx: indexRecords([]), ctx, weekStartKey: week }),
    null,
  );
});

test('steps taken toward a goal: linked items done and checked typed steps, newest first', () => {
  const idx = indexRecords([
    rec(apply, '2026-11-24'),
    rec(run, '2026-11-20'),
    rec(taxes, '2026-11-24'),
    rec(run, '2026-10-01'),
  ]);
  const steps: GoalStep[] = [
    { id: 1, goal_id: 1, date: '2026-11-22', text: 'Update CV', priority_id: 3, status: 'open' },
    { id: 2, goal_id: 1, date: '2026-11-23', text: 'Call Ana', priority_id: 4, status: 'open' },
  ];
  const pr: Priority[] = [
    { id: 3, text: 'Update CV', created_on: '2026-11-22', done_on: '2026-11-22' },
    { id: 4, text: 'Call Ana', created_on: '2026-11-23', done_on: null },
  ];
  assert.deepEqual(stepsTaken(gis, all, idx, steps, pr, lastFourWeeks(ctx.today)), [
    { date: '2026-11-24', text: 'Job search session' },
    { date: '2026-11-22', text: 'Update CV' },
    { date: '2026-11-20', text: 'Run' },
  ]);
  assert.equal(lastFourWeeks(ctx.today).length, 28);
});
