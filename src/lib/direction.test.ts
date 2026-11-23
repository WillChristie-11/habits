import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { weekDays } from './dates';
import { facedThisWeek, horizonOn, isLastSundayOfMonth, keptThisWeek, reasonCounts, reasonRule } from './direction';
import { habit, rec } from './testing';
import type { NotToday } from './notToday';

const daily = { type: 'daily' } as const;
const days = weekDays('2026-11-29'); // Mon 23 … Sun 29

test('what you faced: door sessions this week, per habit, average expected vs felt', () => {
  const a = habit(daily, { name: 'Apply', habit_kind: 'avoid' });
  const t = habit(daily, { name: 'Taxes', habit_kind: 'avoid' });
  const read = habit(daily, { name: 'Read' });
  const idx = indexRecords([
    { ...rec(a, '2026-11-23'), meta: { dreadBefore: 4, feltScore: 2 } },
    { ...rec(a, '2026-11-25'), meta: { dreadBefore: 5, feltScore: 2 } },
    rec(t, '2026-11-24'),
    rec(t, '2026-11-20'),
    rec(read, '2026-11-24'),
  ]);
  const f = facedThisWeek([a, t, read], idx, days);
  assert.equal(f.text, 'You went through the door 3 times.');
  assert.deepEqual(
    f.per.map((x) => [x.habit.name, x.count, x.expected, x.felt]),
    [
      ['Apply', 2, 4.5, 2],
      ['Taxes', 1, null, null],
    ],
  );
  assert.equal(facedThisWeek([read], idx, days).text, null);
});

test('what got in the way: reason counts this week, one rule line from 2+', () => {
  const n = (date: string, reason: NotToday['reason']): NotToday => ({ id: 0, habit_id: 1, date, reason, note: null });
  const list = [
    n('2026-11-23', 'unclear'),
    n('2026-11-24', 'unclear'),
    n('2026-11-25', 'tired'),
    n('2026-11-16', 'tired'),
  ];
  const counts = reasonCounts(list, days);
  assert.deepEqual(
    counts.map((c) => [c.key, c.count]),
    [
      ['unclear', 2],
      ['tired', 1],
    ],
  );
  assert.equal(reasonRule(counts), 'Next week, the first two minutes of each session go to writing the next step.');
  assert.equal(reasonRule(reasonCounts([n('2026-11-23', 'tired')], days)), null);
});

test('in your words, last Sunday of the month, the horizon in force', () => {
  const a = habit(daily, { name: 'Apply', habit_kind: 'avoid' });
  const idx = indexRecords([
    { ...rec(a, '2026-11-24'), meta: { note: 'Less bad than I thought', keepLine: true } },
    { ...rec(a, '2026-11-10'), meta: { note: 'old', keepLine: true } },
  ]);
  assert.deepEqual(
    keptThisWeek([a], idx, days).map((l) => l.text),
    ['Less bad than I thought'],
  );
  assert.ok(isLastSundayOfMonth('2026-11-29'));
  assert.ok(!isLastSundayOfMonth('2026-11-22'));
  assert.ok(!isLastSundayOfMonth('2026-11-28'));
  const months = { '2026-08': 'old line', '2026-10': 'A job I like' };
  assert.deepEqual(horizonOn(months, '2026-11-25'), { month: '2026-10', line: 'A job I like' });
  assert.equal(horizonOn({ '2026-06': 'too old' }, '2026-11-25'), null);
});
