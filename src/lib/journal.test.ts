/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayRecord, Frequency, Habit } from '../types';
import { indexRecords } from './schedule';
import { entryToLines, firstLine, pageDates, recapLines, targetText, weekCounts } from './journal';

const SUN = '2026-11-22';
let nextId = 1;
function habit(frequency: Frequency, extra: Partial<Habit> = {}): Habit {
  return {
    id: nextId++,
    kind: 'habit',
    name: `h${nextId}`,
    why: null,
    minimum_version: null,
    messages: [],
    habit_kind: 'want',
    session_minutes: 15,
    ready_minutes: 3,
    unit: null,
    target_min: null,
    target_max: null,
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
const rec = (h: Habit, date: string, status: DayRecord['status'] = 'done'): DayRecord => ({
  habit_id: h.id,
  date,
  status,
  feeling: null,
  timestamp: date + 'T09:00:00',
  meta: null,
});

test('first line skips blank lines', () => {
  assert.equal(firstLine('\n  Ship the CV  \nthen rest'), 'Ship the CV');
  assert.equal(firstLine(undefined), '');
});

test('date wheel: only days with writing, plus today, oldest first', () => {
  const pages = { '2026-11-10': 'a', '2026-11-12': '   ', '2026-11-18': 'b', '2026-11-25': 'future?' };
  assert.deepEqual(pageDates(pages, '2026-11-20'), ['2026-11-10', '2026-11-18', '2026-11-20']);
});

test('Sunday recap: counts only, nothing for habits not done, avoid habits as sessions', () => {
  const read = habit({ type: 'daily' }, { name: 'Read' });
  const lift = habit({ type: 'weekly_count', count: 3 }, { name: 'Lifted' });
  const apply = habit({ type: 'daily' }, { name: 'job-search', habit_kind: 'avoid' });
  const floss = habit({ type: 'daily' }, { name: 'Floss' });
  const anchor = habit({ type: 'daily' }, { kind: 'anchor', name: 'Wake up' });
  const recs = [
    ...['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((d) => rec(read, d)),
    rec(lift, '2026-11-17'),
    rec(lift, '2026-11-20'),
    ...['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-21'].map((d) => rec(apply, d)),
    rec(anchor, '2026-11-16'),
    rec(floss, '2026-11-18', 'skipped'),
  ];
  const counts = weekCounts([read, lift, apply, floss, anchor], indexRecords(recs), { today: SUN }, SUN);
  assert.deepEqual(
    counts.map((c) => c.text),
    ['Read 5×', '4 job-search sessions', 'Lifted 2×'],
  );
  // mid-week: only days up to today
  assert.equal(weekCounts([read], indexRecords(recs), { today: '2026-11-17' }, SUN)[0].text, 'Read 2×');
});

test('Sunday recap: first line of each page Mon–Sat', () => {
  const pages = {
    '2026-11-16': 'Monday thing\nmore',
    '2026-11-19': '\nThursday',
    '2026-11-22': 'Sunday itself',
    '2026-11-15': 'last week',
  };
  assert.deepEqual(recapLines(pages, SUN), [
    { date: '2026-11-16', line: 'Monday thing' },
    { date: '2026-11-19', line: 'Thursday' },
  ]);
});

test('old structured entries fold into plain page lines (v7 migration)', () => {
  assert.deepEqual(entryToLines('intention', '{"text":"Ship it"}'), ['Ship it']);
  assert.deepEqual(entryToLines('reflection', '{"wentWell":"walk","inTheWay":""}'), ['Went well: walk']);
  assert.deepEqual(entryToLines('weekly', '{"liked":"a","changes":"c"}'), ['Liked this week: a', 'Next week: c']);
  assert.deepEqual(entryToLines('note', 'not json'), []);
});

test('Sunday recap: activities show count, total and their soft target; never a miss', () => {
  const run = habit({ type: 'daily' }, { kind: 'activity', name: 'Run', unit: 'mi', target_min: 2, target_max: 3 });
  const bike = habit({ type: 'daily' }, { kind: 'activity', name: 'Bike', unit: 'min' });
  const swim = habit({ type: 'daily' }, { kind: 'activity', name: 'Swim', unit: null });
  const log = (h: Habit, d: string, amount?: number) => ({
    ...rec(h, d),
    meta: { type: h.name.toLowerCase(), amount: amount ?? null, unit: h.unit },
  });
  const idx = indexRecords([
    log(run, '2026-11-16', 4),
    log(run, '2026-11-18', 6.5),
    log(run, '2026-11-20', 3.5),
    log(bike, '2026-11-17', 45),
    log(swim, '2026-11-19'),
  ]);
  assert.deepEqual(
    weekCounts([run, bike, swim], idx, { today: SUN }, SUN).map((c) => c.text),
    ['Run 3× · 14 mi · you usually aim for 2–3', 'Bike 1× · 45 min', 'Swim 1×'],
  );
  assert.equal(targetText(2, 2), 'you usually aim for 2');
  assert.equal(targetText(null, null), null);
  assert.equal(weekCounts([run], indexRecords([]), { today: SUN }, SUN).length, 0);
});
