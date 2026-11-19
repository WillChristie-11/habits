/// <reference types="node" />
// Run: npm test   (node's built-in test runner via tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayRecord, Frequency, Habit } from '../types';
import {
  dueLabel,
  indexRecords,
  missedTwiceRisk,
  progress,
  sectionRows,
  timeline,
  todayCompletion,
  visibleToday,
  feelingStats,
} from './schedule';
import { addDays, diffDays, last7, weekDays, weekStart } from './dates';

const TODAY = '2026-11-19'; // Thursday
const ctx = { today: TODAY };

let nextId = 1;
function habit(frequency: Frequency, extra: Partial<Habit> = {}): Habit {
  return {
    id: nextId++,
    name: 'h',
    section: 'morning',
    why: null,
    minimum_version: null,
    frequency,
    order: 0,
    stack_after: null,
    paused_from: null,
    paused_until: null,
    created_at: '2026-11-01T08:00:00',
    ...extra,
  };
}
const rec = (h: Habit, date: string, status: DayRecord['status'] = 'done', feeling: number | null = null): DayRecord => ({
  habit_id: h.id,
  date,
  status,
  feeling,
  timestamp: date + 'T09:00:00',
});

test('date helpers: Monday-start weeks, diffs across DST', () => {
  assert.equal(weekStart(TODAY), '2026-11-16');
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday belongs to the week before
  assert.deepEqual(weekDays(TODAY).at(-1), '2026-11-22');
  assert.equal(diffDays('2026-11-01', '2026-11-02'), 1); // US DST change day
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.deepEqual(last7(TODAY), ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', TODAY]);
});

test('daily: done / missed / pending / skipped, nothing before creation', () => {
  const h = habit({ type: 'daily' }, { created_at: '2026-11-15T10:00:00' });
  const idx = indexRecords([rec(h, '2026-11-16'), rec(h, '2026-11-17', 'skipped')]);
  const tl = timeline(h, idx, '2026-11-13', TODAY, ctx);
  assert.deepEqual([...tl.states.values()], ['none', 'none', 'missed', 'done', 'skipped', 'missed', 'pending']);
});

test('weekly %: skipped/paused excluded; today counts only once done', () => {
  const h = habit({ type: 'daily' });
  // Mon done, Tue skipped, Wed missed, Thu (today) pending
  const idx = indexRecords([rec(h, '2026-11-16'), rec(h, '2026-11-17', 'skipped')]);
  const p = progress(h, idx, weekDays(TODAY), ctx);
  assert.equal(p.done, 1);
  assert.equal(p.expected, 2);
  assert.equal(p.pct, 0.5);
  const idx2 = indexRecords([rec(h, '2026-11-16'), rec(h, '2026-11-17', 'skipped'), rec(h, TODAY)]);
  assert.equal(progress(h, idx2, weekDays(TODAY), ctx).pct, 2 / 3);
});

test('specific_days: only expected on chosen weekdays, hidden otherwise', () => {
  const h = habit({ type: 'specific_days', days: [1, 3] }); // Mon, Wed
  const idx = indexRecords([rec(h, '2026-11-16')]);
  const tl = timeline(h, idx, '2026-11-16', TODAY, ctx);
  assert.deepEqual([...tl.states.values()], ['done', 'none', 'missed', 'none']);
  assert.equal(visibleToday(h, idx, ctx), false); // Thursday
  assert.equal(progress(h, idx, weekDays(TODAY), ctx).pct, 0.5);
});

test('weekly_count: x/N, target scaled down by rest days', () => {
  const h = habit({ type: 'weekly_count', count: 2 });
  const idx = indexRecords([rec(h, '2026-11-17')]);
  const p = progress(h, idx, weekDays(TODAY), ctx);
  assert.deepEqual([p.done, p.target], [1, 2]);
  // no missed dots for weekly_count
  assert.ok(![...timeline(h, idx, '2026-11-13', TODAY, ctx).states.values()].includes('missed'));
});

test('every_n_days: due / overdue / later, one miss per cycle, rest pushes due', () => {
  const h = habit({ type: 'every_n_days', n: 3 });
  // done on the 13th → due 16th; not done since
  let idx = indexRecords([rec(h, '2026-11-13')]);
  assert.deepEqual(dueLabel(h, idx, ctx), { kind: 'overdue', text: 'overdue 3 days' });
  const tl = timeline(h, idx, '2026-11-13', TODAY, ctx);
  assert.deepEqual([...tl.states.values()], ['done', 'none', 'none', 'missed', 'none', 'none', 'pending']);

  idx = indexRecords([rec(h, '2026-11-16')]);
  assert.deepEqual(dueLabel(h, idx, ctx), { kind: 'due', text: 'due' });

  idx = indexRecords([rec(h, '2026-11-18')]);
  assert.deepEqual(dueLabel(h, idx, ctx), { kind: 'later', text: 'in 2 days' });

  // skipped on the due day → due moves to the next day
  idx = indexRecords([rec(h, '2026-11-15'), rec(h, '2026-11-18', 'skipped')]);
  assert.deepEqual(dueLabel(h, idx, ctx), { kind: 'due', text: 'due' });
});

test('never miss twice: missed yesterday and not done today', () => {
  const h = habit({ type: 'daily' });
  const idx = indexRecords([rec(h, '2026-11-17')]);
  assert.equal(missedTwiceRisk(h, idx, ctx), true);
  assert.equal(missedTwiceRisk(h, indexRecords([rec(h, '2026-11-17'), rec(h, TODAY)]), ctx), false);
  assert.equal(missedTwiceRisk(h, indexRecords([rec(h, '2026-11-18', 'skipped')]), ctx), false);
});

test('pause range shows paused and is excluded from %', () => {
  const h = habit({ type: 'daily' }, { paused_from: '2026-11-16', paused_until: '2026-11-17' });
  const idx = indexRecords([rec(h, '2026-11-18')]);
  const p = progress(h, idx, weekDays(TODAY), ctx);
  assert.deepEqual([p.done, p.expected], [1, 1]);
  const appPaused = timeline(habit({ type: 'daily' }), idx, TODAY, TODAY, {
    today: TODAY,
    appPause: { from: TODAY, until: '2026-11-25' },
  });
  assert.equal(appPaused.states.get(TODAY), 'paused');
});

test('today ring excludes weekly_count and not-due habits', () => {
  const a = habit({ type: 'daily' });
  const b = habit({ type: 'daily' });
  const c = habit({ type: 'weekly_count', count: 2 });
  const d = habit({ type: 'specific_days', days: [1] });
  const idx = indexRecords([rec(a, TODAY), rec(c, TODAY)]);
  assert.deepEqual(todayCompletion([a, b, c, d], idx, ctx), { done: 1, total: 2, pct: 0.5 });
});

test('feeling average only over done records with a rating', () => {
  const h = habit({ type: 'daily' });
  const recs = Array.from({ length: 10 }, (_, i) => rec(h, addDays('2026-11-01', i), 'done', i % 2 ? 4 : 3));
  const s = feelingStats(h, indexRecords(recs));
  assert.equal(s.count, 10);
  assert.equal(s.avg, 3.5);
});

test('stacked habits sit under their anchor; cycles fall back to flat', () => {
  const a = habit({ type: 'daily' }, { order: 0, name: 'coffee' });
  const b = habit({ type: 'daily' }, { order: 1, name: 'walk' });
  const c = habit({ type: 'daily' }, { order: 2, name: 'meditate', stack_after: a.id });
  const rows = sectionRows([a, b, c], 'morning', () => true);
  assert.deepEqual(
    rows.map((r) => [r.habit.name, r.depth]),
    [
      ['coffee', 0],
      ['meditate', 1],
      ['walk', 0],
    ],
  );
  const x = habit({ type: 'daily' }, { order: 0, name: 'x' });
  const y = habit({ type: 'daily' }, { order: 1, name: 'y', stack_after: x.id });
  x.stack_after = y.id;
  assert.equal(sectionRows([x, y], 'morning', () => true).length, 2);
});
