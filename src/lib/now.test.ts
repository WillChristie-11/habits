import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { DEFAULT_REMINDERS, type DayRecord, type Habit } from '../types';
import { daySummary, freePicks, itemActions, nowContent, nowItem, toneAt } from './now';
import { habit, rec } from './testing';

const daily = { type: 'daily' } as const;
const ctx = { today: '2026-11-25' };
const at = (hm: string) => new Date(`2026-11-25T${hm}:00`);
const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
const work = habit(daily, { kind: 'anchor', name: 'Work block', scheduled_time: '09:00', end_time: '17:00' });
const wind = habit(daily, { kind: 'anchor', name: 'Wind down', scheduled_time: '21:30' });
const sun = habit(daily, { name: 'Meditate and see the sun', stack_after: wake.id });
const apply = habit(daily, {
  name: 'Job search',
  habit_kind: 'avoid',
  stack_after: work.id,
  ladder: ['Open the tracker'],
});
const read = habit(daily, { name: 'Read' });
const guitar = habit(daily, { name: 'Guitar' });
const run = habit(daily, { kind: 'activity', name: 'Run' });
const all = [wake, work, wind, sun, apply, read, guitar, run];
const now = (hm: string, records: DayRecord[] = [], goal: string | null = 'Land a GIS job', habits: Habit[] = all) =>
  nowContent({ habits, idx: indexRecords(records), ctx, now: at(hm), r: DEFAULT_REMINDERS, goal });

test('morning (A, amber): the goal large, then the first item after Wake up with Done and Get ready', () => {
  const c = now('08:04');
  assert.deepEqual(
    [c.kind, c.layout, c.tone, c.kicker, c.big],
    ['morning', 'A', 'morning', 'Good morning. Working toward', 'Land a GIS job'],
  );
  assert.equal(c.itemLabel, 'First up, after Wake up');
  assert.deepEqual(c.item, { habitId: sun.id, text: 'Meditate and see the sun', minutes: 10 });
  assert.deepEqual(
    c.actions.map((a) => a.label),
    ['Done', 'Get ready'],
  );
  assert.deepEqual([now('08:04', [], null).kicker, now('08:04', [], null).big], [null, 'Good morning']);
});

test('during an anchor (B, blue): time left large, the next step (avoid: Start)', () => {
  const c = now('15:30');
  assert.deepEqual(
    [c.kind, c.layout, c.tone, c.big, c.small],
    ['anchor', 'B', 'day', '1 h 30 min', 'left in Work block · until 5:00 PM'],
  );
  assert.deepEqual(c.ring, { start: 9 * 60, end: 17 * 60 });
  assert.equal(c.itemLabel, 'Next in Work block');
  assert.deepEqual(c.item, { habitId: apply.id, text: 'Open the tracker', minutes: 25 });
  assert.deepEqual(
    c.actions.map((a) => [a.kind, a.label]),
    [
      ['start', 'Start'],
      ['getReady', 'Get ready'],
    ],
  );
});

test('free time (C): three open want habits or activities, least done this week first', () => {
  const c = now('18:00', [rec(read, '2026-11-24'), rec(read, '2026-11-23')]);
  assert.deepEqual([c.kind, c.layout, c.big, c.small], ['free', 'C', 'Free time', 'Pick one:']);
  assert.deepEqual(
    c.actions.map((a) => [a.kind, a.label]),
    [
      ['timer', 'Meditate and see the sun'],
      ['timer', 'Guitar'],
      ['focus', 'Run'],
    ],
  );
  assert.deepEqual(
    freePicks(all, indexRecords([]), ctx, 5).map((h) => h.name),
    ['Meditate and see the sun', 'Read', 'Guitar', 'Run'],
  );
});

test('evening (B, violet): time to the deadline, what is next, Write in journal; never misses or %', () => {
  const c = now('20:30', [rec(sun, ctx.today)]);
  assert.deepEqual(
    [c.kind, c.layout, c.tone, c.big, c.small],
    ['evening', 'B', 'evening', '1 h 30 min', 'until 10:00 PM · wind down'],
  );
  assert.equal(c.itemLabel, 'Left tonight · 2 more after this');
  assert.deepEqual(
    c.actions.map((a) => a.label),
    ['Start', 'Get ready', 'Write in journal'],
  );
  for (const t of [c.big, c.small ?? '', c.itemLabel ?? '']) assert.ok(!/%|miss|behind|⚑/i.test(t));
});

test('done for today: a one-line summary, coloured by the time of day', () => {
  const recs = [wake, work, wind, sun, apply, read, guitar].map((h) => rec(h, ctx.today));
  const runLog = { ...rec(run, ctx.today), meta: { amount: 3, unit: 'miles' } };
  const c = now('16:00', [...recs, runLog]);
  assert.deepEqual(
    [c.kind, c.layout, c.tone, c.big, c.small],
    ['done', 'done', 'day', 'You’re done for today.', '3 habits · 1 job search session · Run 3 miles'],
  );
  assert.equal(daySummary(all, indexRecords([]), ctx.today), null);
});

test('tones and item cards', () => {
  assert.deepEqual(
    [toneAt(8 * 60, DEFAULT_REMINDERS), toneAt(13 * 60, DEFAULT_REMINDERS), toneAt(20 * 60 + 1, DEFAULT_REMINDERS)],
    ['morning', 'day', 'evening'],
  );
  assert.equal(nowItem(read).minutes, null);
  assert.deepEqual(
    itemActions(read).map((a) => a.label),
    ['Done', 'Get ready'],
  );
});
