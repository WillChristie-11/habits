import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { doorPick } from './insights';
import { followUp, REASONS, withNextStep } from './notToday';
import { habit, rec } from './testing';

const daily = { type: 'daily' } as const;
const ctx = { today: '2026-11-25' }; // a Wednesday; week starts Monday the 23rd

test('door: the avoid habit started least this week, ties to the one not started longest', () => {
  const apply = habit(daily, { name: 'Apply', habit_kind: 'avoid' });
  const taxes = habit(daily, { name: 'Taxes', habit_kind: 'avoid' });
  const read = habit(daily, { name: 'Read' });
  const records = [
    rec(apply, '2026-11-23'),
    rec(taxes, '2026-11-23'),
    rec(taxes, '2026-11-24'),
    rec(read, '2026-11-24'),
  ];
  assert.equal(doorPick([apply, taxes, read], indexRecords(records), ctx, '2026-11-23')?.habit.name, 'Apply');
  // Equal this week: the one not started for longest wins.
  const tie = [rec(apply, '2026-11-20'), rec(taxes, '2026-11-18')];
  assert.equal(doorPick([apply, taxes], indexRecords(tie), ctx, '2026-11-23')?.habit.name, 'Taxes');
});

test('door: holds its pick once opened or passed on today; hidden when no avoid habit is due', () => {
  const apply = habit(daily, { name: 'Apply', habit_kind: 'avoid' });
  const taxes = habit(daily, { name: 'Taxes', habit_kind: 'avoid' });
  const base = [rec(taxes, '2026-11-24')];
  const opened = doorPick([apply, taxes], indexRecords([...base, rec(apply, ctx.today)]), ctx, '2026-11-23');
  assert.deepEqual([opened?.habit.name, opened?.state], ['Apply', 'opened']);
  const passed = doorPick([apply, taxes], indexRecords([...base, rec(apply, ctx.today, 'skipped')]), ctx, '2026-11-23');
  assert.equal(passed?.state, 'not_today');
  assert.equal(doorPick([habit(daily, { name: 'Read' })], indexRecords([]), ctx, '2026-11-23'), null);
});

test('not today: every reason has its follow-up; a new step goes in at the current position', () => {
  assert.deepEqual(
    REASONS.map((r) => followUp(r.key)),
    ['firstStep', 'smaller', 'restUntilMorning', 'record', 'none', 'note'],
  );
  assert.deepEqual(withNextStep(['Open tracker', 'Pick one'], 1, ' Find the login '), {
    ladder: ['Open tracker', 'Find the login', 'Pick one'],
    index: 1,
  });
  assert.deepEqual(withNextStep([], 0, 'Open it'), { ladder: ['Open it'], index: 0 });
});
