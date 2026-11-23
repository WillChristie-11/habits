import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { DEFAULT_REMINDERS, type DayRecord, type Habit } from '../types';
import { daySummary, freePicks, itemActions, nowContent } from './now';
import { habit, rec } from './testing';

const daily = { type: 'daily' } as const;
const ctx = { today: '2026-11-25' };
const at = (hm: string) => new Date(`2026-11-25T${hm}:00`);
const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
const work = habit(daily, { kind: 'anchor', name: 'Work block', scheduled_time: '09:00', end_time: '17:00' });
const wind = habit(daily, { kind: 'anchor', name: 'Wind down', scheduled_time: '21:30' });
const stretch = habit(daily, { name: 'Stretch', stack_after: wake.id });
const apply = habit(daily, {
  name: 'Job search',
  habit_kind: 'avoid',
  stack_after: work.id,
  ladder: ['Open the tracker'],
});
const read = habit(daily, { name: 'Read' });
const guitar = habit(daily, { name: 'Guitar' });
const run = habit(daily, { kind: 'activity', name: 'Run' });
const all = [wake, work, wind, stretch, apply, read, guitar, run];
const now = (hm: string, records: DayRecord[] = [], habits: Habit[] = all) =>
  nowContent({
    habits,
    idx: indexRecords(records),
    ctx,
    now: at(hm),
    r: DEFAULT_REMINDERS,
    intention: 'Two applications out',
  });

test('morning: the weekly intention, then the first open item under the first anchor', () => {
  const c = now('07:20');
  assert.deepEqual([c.kind, c.big, c.small, c.item], ['morning', 'Two applications out', 'First: Stretch', 'Stretch']);
  assert.deepEqual(
    c.actions.map((a) => a.label),
    ['Done', 'Clear head · 5'],
  );
});

test('during an anchor: until its end with time left, and the next open item (avoid: its step)', () => {
  const c = now('15:30');
  assert.deepEqual(
    [c.kind, c.big, c.small, c.item],
    ['anchor', 'Work block', 'until 5:00 PM · 1 h 30 min left', 'Open the tracker'],
  );
  assert.deepEqual(c.ring, { start: 9 * 60, end: 17 * 60 });
  assert.deepEqual(
    c.actions.map((a) => a.label),
    ['Focus · 25', 'Clear head · 5'],
  );
});

test('free time: three open want habits or activities, least done this week first', () => {
  const c = now('18:00', [rec(read, '2026-11-24'), rec(read, '2026-11-23')]);
  assert.deepEqual([c.kind, c.big, c.small], ['free', 'Free time.', 'Pick one:']);
  assert.deepEqual(
    c.actions.map((a) => [a.kind, a.label]),
    [
      ['timer', 'Stretch'],
      ['timer', 'Guitar'],
      ['focus', 'Run'],
    ],
  );
  assert.deepEqual(
    freePicks(all, indexRecords([]), ctx, 5).map((h) => h.name),
    ['Stretch', 'Read', 'Guitar', 'Run'],
  );
});

test('evening: Wind down with what is left and Write in journal; never misses or %', () => {
  const c = now('20:30', [rec(stretch, ctx.today)]);
  assert.deepEqual([c.kind, c.big, c.small], ['evening', 'Wind down', 'Left: Job search, Read, Guitar']);
  assert.deepEqual(c.actions, [{ kind: 'journal', label: 'Write in journal' }]);
  for (const t of [c.big, c.small ?? '']) assert.ok(!/%|miss|behind|⚑/i.test(t));
});

test('done for today: a one-line summary', () => {
  const recs = [wake, work, wind, stretch, apply, read, guitar].map((h) => rec(h, ctx.today));
  const runLog = { ...rec(run, ctx.today), meta: { amount: 3, unit: 'miles' } };
  const c = now('16:00', [...recs, runLog]);
  assert.deepEqual(
    [c.kind, c.big, c.small],
    ['done', 'You’re done for today.', '3 habits · 1 job search session · Run 3 miles'],
  );
  assert.equal(daySummary(all, indexRecords([]), ctx.today), null);
});

test('item buttons: avoid gets Focus and Clear head; a meditation habit gets Done and Meditate', () => {
  assert.deepEqual(
    itemActions(apply).map((a) => a.label),
    ['Focus · 25', 'Clear head · 5'],
  );
  assert.deepEqual(
    itemActions(habit(daily, { name: 'Meditate' })).map((a) => a.label),
    ['Done', 'Meditate · 10'],
  );
});
