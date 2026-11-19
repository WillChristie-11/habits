/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayRecord, Frequency, Habit, JournalEntry } from '../types';
import { DEFAULT_REMINDERS } from '../types';
import { indexRecords } from './schedule';
import { agoText, noteFor, noteTrigger, reflectionOpen, resurfaceFor, reviewDue, searchEntries, weekReview } from './journal';

const SUN = '2026-11-22';
let nextId = 1;
function habit(frequency: Frequency, extra: Partial<Habit> = {}): Habit {
  return {
    id: nextId++,
    kind: 'habit',
    name: `h${nextId}`,
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
const rec = (h: Habit, date: string, feeling: number | null = null, status: DayRecord['status'] = 'done'): DayRecord => ({
  habit_id: h.id,
  date,
  status,
  feeling,
  timestamp: date + 'T09:00:00',
  meta: null,
});
let entryId = 1;
const entry = (type: JournalEntry['type'], date: string, data: Record<string, string>, habitId: number | null = null): JournalEntry => ({
  id: entryId++,
  type,
  date,
  habit_id: habitId,
  data,
  created_at: date,
  updated_at: date,
});
const daily: Frequency = { type: 'daily' };
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`);

test('weekly review: % per habit, best feeling, most missed (want habits only)', () => {
  const med = habit(daily, { name: 'Meditate' });
  const read = habit(daily, { name: 'Read' });
  const apply = habit(daily, { name: 'Apply', habit_kind: 'avoid' });
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  const recs = [
    ...week.map((d) => rec(med, d, 4)),
    rec(read, '2026-11-16', 5),
    rec(read, '2026-11-17', 5),
  ];
  const r = weekReview([med, read, apply], indexRecords(recs), { today: '2026-11-23' }, SUN);
  const row = (h: Habit) => r.rows.find((x) => x.habit.id === h.id)!;
  assert.equal(row(med).pct, 1);
  assert.equal(row(read).missed, 5);
  assert.equal(row(apply).pct, null); // avoid: no %
  assert.equal(r.best!.habit.name, 'Read'); // avg 5 over 2 ratings beats 4
  assert.equal(r.mostMissed!.habit.name, 'Read'); // apply missed more days but is an avoid habit
  assert.equal(r.pct, 9 / 14);
});

test('review is due Sunday from 5 PM and all Monday, until written', () => {
  assert.equal(reviewDue([], { today: SUN }, at(SUN, '16:59')), null);
  assert.equal(reviewDue([], { today: SUN }, at(SUN, '17:00')), SUN);
  assert.equal(reviewDue([], { today: '2026-11-23' }, at('2026-11-23', '09:00')), SUN);
  assert.equal(reviewDue([], { today: '2026-11-24' }, at('2026-11-24', '09:00')), null);
  assert.equal(reviewDue([entry('weekly', SUN, { liked: 'x' })], { today: SUN }, at(SUN, '18:00')), null);
});

test('reflection opens with the evening nudge', () => {
  assert.equal(reflectionOpen(DEFAULT_REMINDERS, at(SUN, '19:59')), false);
  assert.equal(reflectionOpen(DEFAULT_REMINDERS, at(SUN, '20:00')), true);
});

test('resurfacing picks the entry closest to 4 weeks old, at least 3 weeks old, stable all week', () => {
  const es = [
    entry('reflection', '2026-11-10', { wentWell: 'too recent' }),
    entry('intention', '2026-10-20', { text: 'four weeks' }),
    entry('intention', '2026-09-01', { text: 'long ago' }),
    entry('intention', '2026-10-21', { text: '' }),
  ];
  assert.equal(resurfaceFor(es, '2026-11-19')!.data.text, 'four weeks');
  assert.equal(resurfaceFor(es, '2026-11-22')!.data.text, 'four weeks'); // same week, same pick
  assert.equal(resurfaceFor([es[0]], '2026-11-19'), null);
  assert.equal(agoText('2026-10-20', '2026-11-19'), '4 weeks ago');
});

test('search covers all fields and the habit a note is about', () => {
  const h = habit(daily, { name: 'Guitar' });
  const es = [entry('reflection', SUN, { wentWell: 'slept well', inTheWay: 'late meeting' }), entry('note', SUN, { text: 'just tune it' }, h.id)];
  assert.equal(searchEntries(es, 'MEETING').length, 1);
  assert.equal(searchEntries(es, 'guitar', [h]).length, 1);
  assert.equal(searchEntries(es, '  ').length, 2);
});

test('notes to future me: want habits on never-miss-twice, avoid habits after 2+ days without a session', () => {
  const want = habit(daily, { name: 'Read' });
  const avoid = habit(daily, { name: 'Apply', habit_kind: 'avoid' });
  const ctx = { today: '2026-11-19' };
  // want: missed the 18th → trigger today
  assert.equal(noteTrigger(want, indexRecords([rec(want, '2026-11-17')]), ctx), true);
  assert.equal(noteTrigger(want, indexRecords([rec(want, '2026-11-18')]), ctx), false);
  // avoid: last session the 16th → 17th and 18th empty → trigger on the 19th; last on the 17th → not yet
  assert.equal(noteTrigger(avoid, indexRecords([rec(avoid, '2026-11-16')]), ctx), true);
  assert.equal(noteTrigger(avoid, indexRecords([rec(avoid, '2026-11-17')]), ctx), false);

  const note = entry('note', '2026-11-15', { text: 'Just open the laptop.' }, avoid.id);
  const idx = indexRecords([rec(avoid, '2026-11-16')]);
  assert.equal(noteFor(avoid, [note], idx, ctx)!.data.text, 'Just open the laptop.');
  // delivered on the 19th → shown that day only
  const delivered = { ...note, data: { ...note.data, triggeredOn: '2026-11-19' } };
  assert.ok(noteFor(avoid, [delivered], idx, ctx));
  assert.equal(noteFor(avoid, [delivered], idx, { today: '2026-11-20' }), null);
});
