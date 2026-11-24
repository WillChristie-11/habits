import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { habit, rec } from './testing';
import { activityRow, activityWeek, catchUpList, chipLabel } from './activities';

const daily = { type: 'daily' } as const;
const today = '2026-11-25'; // Wednesday
const run = habit(daily, { kind: 'activity', name: 'Run', target_min: 3 });
const read = habit(daily, { kind: 'activity', name: 'Reading', target_min: 2 });
const yoga = habit(daily, { kind: 'activity', name: 'Yoga' });
const idx = indexRecords([
  rec(run, '2026-11-23'),
  rec(run, '2026-11-20'),
  rec(read, '2026-11-24'),
  rec(read, today),
  rec(yoga, '2026-11-24'),
]);

test('activity chips: x/goal this week, or the count, or just the name', () => {
  assert.deepEqual(activityWeek(run, idx, today), { count: 1, goal: 3, today: false });
  assert.equal(chipLabel(run, idx, today), 'Run 1/3');
  assert.equal(chipLabel(read, idx, today), 'Reading 2/2');
  assert.equal(chipLabel(yoga, idx, today), 'Yoga 1');
  assert.equal(chipLabel(habit(daily, { kind: 'activity', name: 'Swim' }), idx, today), 'Swim');
});

test('activity rows in the week grid: dots per day and x/goal', () => {
  const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
  assert.deepEqual(activityRow(run, idx, days, today), {
    dots: [true, false, false, false, false, false, false],
    label: '1/3',
  });
});

test('catch-up: activities under their weekly goal and not logged today', () => {
  assert.deepEqual(
    catchUpList([run, read, yoga], idx, today).map((h) => h.name),
    ['Run'],
  );
});
