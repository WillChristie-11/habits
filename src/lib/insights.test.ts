/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayRecord, Habit, Occurrence } from '../types';
import { indexRecords } from './schedule';
import { afterFeelingSummary, feelingContrast, recentNotes, wakeAnchor, wakeWeek } from './insights';
import { defaultAnchors } from './defaults';

const h = { id: 1, kind: 'habit', habit_kind: 'want', name: 'Walk' } as Habit;
const rec = (date: string, status: DayRecord['status'], feeling: number | null): DayRecord => ({
  habit_id: 1,
  date,
  status,
  feeling,
  timestamp: date + 'T08:00:00Z',
  meta: null,
});
const day = (i: number) => `2026-10-${String(i + 1).padStart(2, '0')}`;

test('feeling contrast appears only with 10+ ratings on each side', () => {
  const done = Array.from({ length: 10 }, (_, i) => rec(day(i), 'done', 4));
  const skipped = Array.from({ length: 9 }, (_, i) => rec(day(i + 10), 'skipped', 2));
  assert.equal(feelingContrast(h, indexRecords([...done, ...skipped])), null);
  skipped.push(rec(day(19), 'skipped', 2));
  assert.equal(
    feelingContrast(h, indexRecords([...done, ...skipped])),
    'Usually Good after this · days skipped: usually Meh',
  );
  assert.equal(feelingContrast({ ...h, habit_kind: 'avoid' }, indexRecords([...done, ...skipped])), null);
});

const occ = (i: number, feeling: number | null, note: string | null = null): Occurrence => ({
  id: i,
  habit_id: 2,
  at: `2026-11-${String(i).padStart(2, '0')}T20:00:00Z`,
  feeling,
  note,
});

test('cut-back summary: the last 8 rated logs, mostly one or two feelings; recent notes', () => {
  assert.equal(afterFeelingSummary([occ(1, 1)]), null);
  const list = [
    occ(1, 5),
    occ(2, 1),
    occ(3, 2),
    occ(4, 1),
    occ(5, 2),
    occ(6, 1),
    occ(7, 2),
    occ(8, 1),
    occ(9, 2),
    occ(10, null),
  ];
  assert.equal(afterFeelingSummary(list), 'Last 8 times: mostly Drained / Meh');
  assert.equal(afterFeelingSummary([occ(1, 1), occ(2, 1), occ(3, 1), occ(4, 2)]), 'Last 4 times: mostly Drained');
  assert.deepEqual(
    recentNotes([occ(1, 1, 'old'), occ(2, null, ' '), occ(3, 2, 'felt sick'), occ(4, 2, 'tired'), occ(5, 1, 'bored')]),
    ['bored', 'tired', 'felt sick'],
  );
});

test('wake times: the Wake up anchor, range text, missing days null', () => {
  const anchors = defaultAnchors().map((a, i) => ({ ...a, id: i + 10 }) as Habit);
  const wake = wakeAnchor(anchors)!;
  assert.equal(wake.name, 'Wake up');
  const r = (date: string, wokeAt: string) => ({ ...rec(date, 'done', null), habit_id: wake.id, meta: { wokeAt } });
  const days = ['2026-11-16', '2026-11-17', '2026-11-18'];
  const w = wakeWeek(wake, indexRecords([r(days[0], '07:55'), r(days[2], '06:40')]), days);
  assert.deepEqual(
    w.times.map((x) => x.time),
    ['07:55', null, '06:40'],
  );
  assert.match(w.text!, /^Woke 6:40\sAM – 7:55\sAM$/);
  assert.equal(wakeWeek(wake, indexRecords([]), days).text, null);
});

test('expected vs felt: pairs need both numbers; last 9, oldest first; lighter/same/heavier worked out', async () => {
  const { expectedVsFelt, expectedFeltText, feltVs, keptLines } = await import('./insights');
  const r = (date: string, meta: Record<string, unknown> | null): DayRecord => ({ ...rec(date, 'done', null), meta });
  const recs = [
    r('2026-10-01', { dreadBefore: 4, feltScore: 2 }),
    r('2026-10-02', { dreadBefore: 3 }), // no felt score: left out
    r('2026-10-03', { dreadBefore: 2, feltScore: 2 }),
    r('2026-10-04', { dreadBefore: 2, feltScore: 4, note: 'harder than it looked', keepLine: true }),
    r('2026-10-05', { dreadBefore: 9, feltScore: 2 }), // out of range: left out
    r('2026-10-06', { note: 'two applications out', keepLine: true }),
    r('2026-10-07', { note: 'not kept', keepLine: false }),
  ];
  const ev = expectedVsFelt(h, indexRecords(recs));
  assert.deepEqual(
    ev.pairs.map((p) => [p.date, p.expected, p.felt]),
    [
      ['2026-10-01', 4, 2],
      ['2026-10-03', 2, 2],
      ['2026-10-04', 2, 4],
    ],
  );
  assert.equal(ev.lighter, 1);
  assert.equal(expectedFeltText(ev.pairs[0]), 'Expected 4, felt like 2');
  assert.deepEqual([feltVs(4, 2), feltVs(2, 2), feltVs(2, 4)], ['lighter', 'same', 'heavier']);
  const many = Array.from({ length: 12 }, (_, i) => r(day(i), { dreadBefore: 3, feltScore: 1 + (i % 5) }));
  const last9 = expectedVsFelt(h, indexRecords(many));
  assert.equal(last9.rated, 9);
  assert.equal(last9.pairs[0].date, day(3));
  assert.deepEqual(
    keptLines(h, indexRecords(recs)).map((k) => k.text),
    ['two applications out', 'harder than it looked'],
  );
  assert.equal(expectedVsFelt(h, indexRecords([])).latest, null);
});
