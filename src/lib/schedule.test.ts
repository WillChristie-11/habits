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
  layoutDay,
  timelineFocus,
  stateOn,
  periodSummary,
} from './schedule';
import { addDays, diffDays, last7, weekDays, weekStart } from './dates';

const TODAY = '2026-11-19'; // Thursday
const ctx = { today: TODAY };

let nextId = 1;
function habit(frequency: Frequency, extra: Partial<Habit> = {}): Habit {
  return {
    id: nextId++,
    kind: 'habit',
    name: 'h',
    section: 'morning',
    why: null,
    minimum_version: null,
    messages: [],
    habit_kind: 'want',
    session_minutes: 15,
    ladder: [],
    ladder_index: 0,
    pair_with: null,
    plan_when: null,
    plan_action: null,
    obstacle: null,
    frequency,
    order: 0,
    stack_after: null,
    paused_from: null,
    paused_until: null,
    created_at: '2026-11-01T08:00:00',
    scheduled_time: null,
    end_time: null,
    reminder: false,
    remind_before: 0,
    meta: null,
    ...extra,
  };
}
const rec = (h: Habit, date: string, status: DayRecord['status'] = 'done', feeling: number | null = null): DayRecord => ({
  habit_id: h.id,
  date,
  status,
  feeling,
  timestamp: date + 'T09:00:00',
  meta: null,
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

test('timeline: anchors + scheduled habits by time; stacked habits follow their anchor', () => {
  const wake = habit({ type: 'daily' }, { kind: 'anchor', name: 'wake', scheduled_time: '07:00' });
  const work = habit({ type: 'specific_days', days: [1, 2, 3, 4, 5] }, { kind: 'anchor', name: 'work', scheduled_time: '09:00', end_time: '17:00' });
  const weekendBrunch = habit({ type: 'specific_days', days: [0, 6] }, { kind: 'anchor', name: 'brunch', scheduled_time: '10:00' });
  const water = habit({ type: 'daily' }, { name: 'water', stack_after: wake.id, section: 'morning' });
  const pills = habit({ type: 'daily' }, { name: 'pills', scheduled_time: '08:15' });
  const read = habit({ type: 'daily' }, { name: 'read', section: 'evening' });
  const lift = habit({ type: 'weekly_count', count: 2 }, { name: 'lift', section: 'week', scheduled_time: '18:00' }); // weekly ignores time
  const all = [read, work, pills, water, wake, weekendBrunch, lift];
  const idx = indexRecords([]);
  const l = layoutDay(all, (h) => visibleToday(h, idx, ctx));
  assert.deepEqual(
    l.timeline.map((r) => [r.habit.name, r.depth]),
    [
      ['wake', 0],
      ['water', 1],
      ['pills', 0],
      ['work', 0],
    ],
  );
  assert.deepEqual(l.sections.evening.map((r) => r.habit.name), ['read']);
  assert.deepEqual(l.sections.week.map((r) => r.habit.name), ['lift']);
  assert.deepEqual(l.sections.morning, []);
});

test('timeline focus: Now inside a window, else Next; done items are passed over', () => {
  const wake = habit({ type: 'daily' }, { kind: 'anchor', scheduled_time: '07:00' });
  const breakfast = habit({ type: 'daily' }, { kind: 'anchor', scheduled_time: '07:30' });
  const work = habit({ type: 'daily' }, { kind: 'anchor', scheduled_time: '09:00', end_time: '17:00' });
  const idx = indexRecords([rec(wake, TODAY)]);
  const rows = layoutDay([wake, breakfast, work], () => true).timeline;
  const st = (h: Habit) => stateOn(h, idx, TODAY, ctx);
  const at = (hm: string) => timelineFocus(rows, st, Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)));
  assert.deepEqual(at('06:00'), { id: breakfast.id, label: 'Next' }); // wake already dismissed
  assert.deepEqual(at('07:45'), { id: breakfast.id, label: 'Now' });
  assert.deepEqual(at('09:30'), { id: work.id, label: 'Now' }); // breakfast's window closed at 9:00
  assert.equal(at('17:30'), null);
});

test('anchors never count toward %, the ring, or never-miss-twice', () => {
  const a = habit({ type: 'daily' }, { kind: 'anchor', scheduled_time: '07:00' });
  const h = habit({ type: 'daily' });
  const idx = indexRecords([rec(a, TODAY), rec(h, TODAY)]);
  assert.deepEqual(todayCompletion([a, h], idx, ctx), { done: 1, total: 1, pct: 1 });
  assert.equal(progress(a, idx, weekDays(TODAY), ctx).pct, null);
  assert.equal(missedTwiceRisk(a, indexRecords([]), ctx), false);
});

test('week summary sums habits (weekly_count capped at target) and ignores anchors', () => {
  const a = habit({ type: 'daily' }); // Mon done, Tue–Wed missed, today pending → 1/3
  const w = habit({ type: 'weekly_count', count: 2 }); // 3 sessions → counts 2/2
  const anchor = habit({ type: 'daily' }, { kind: 'anchor', scheduled_time: '07:00' });
  const later = habit({ type: 'daily' }, { created_at: '2026-12-01T08:00:00' });
  const idx = indexRecords([rec(a, '2026-11-16'), rec(w, '2026-11-16'), rec(w, '2026-11-17'), rec(w, '2026-11-18'), rec(anchor, '2026-11-16')]);
  assert.deepEqual(periodSummary([a, w, anchor, later], idx, weekDays(TODAY), ctx), { done: 3, expected: 5, pct: 0.6 });
});

test('plain list layout (timeline off) keeps timed habits in their section', () => {
  const t = habit({ type: 'daily' }, { name: 'pills', scheduled_time: '08:15', section: 'morning' });
  const l = layoutDay([t], () => true, { timeline: false });
  assert.deepEqual(l.timeline, []);
  assert.deepEqual(l.sections.morning.map((r) => r.habit.name), ['pills']);
});
