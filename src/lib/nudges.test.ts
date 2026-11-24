import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexRecords } from './schedule';
import { DEFAULT_REMINDERS, type DayRecord, type Habit } from '../types';
import {
  applyVoice,
  chooseFrame,
  eligibleFrames,
  frameText,
  ignoredStreak,
  notStartedRun,
  nudgeTimes,
  planNudges,
  type FrameData,
  type NudgeLogRow,
} from './nudges';
import { habit, rec } from './testing';

const daily = { type: 'daily' } as const;
const avoid = (extra: Partial<Habit> = {}) =>
  habit(daily, { name: 'Job search', habit_kind: 'avoid', created_at: '2026-10-01T08:00:00', ...extra });
const withMeta = (r: DayRecord, meta: DayRecord['meta']): DayRecord => ({ ...r, meta });
const base = { notToday: [], goal: null, pairReady: false, horizon: null };

test('frames: tiny door always; past you, dread vs reality, name it, this week, permission when they fit', () => {
  const h = avoid({ ladder: ['Open the tracker'], why: 'a job I like' });
  const date = '2026-11-25'; // Wednesday
  const rated = ['11-10', '11-11', '11-12', '11-13', '11-14'].map((d, i) =>
    withMeta(rec(h, `2026-${d}`), { dreadBefore: 4, feltScore: i < 3 ? 2 : 4 }),
  );
  const kept = withMeta(rec(h, '2026-11-20'), { note: 'Way less bad than I thought', keepLine: true });
  const idx = indexRecords([...rated, kept]);
  const frames = eligibleFrames({
    ...base,
    h,
    idx,
    date,
    goal: 'Land a GIS job',
    notToday: [{ id: 1, habit_id: h.id, date: '2026-11-24', reason: 'tired', note: null }],
  }).map((f) => f.frame);
  // 2026-11-21…24 not started → Name it.
  assert.deepEqual(frames, ['past_you', 'dread', 'name_it', 'this_week', 'permission', 'tiny']);
  assert.deepEqual(
    eligibleFrames({ ...base, h: avoid(), idx: indexRecords([]), date: '2026-10-01' }).map((f) => f.frame),
    ['tiny'],
  );
});

test('choosing: preference order, minus the last two used', () => {
  const e: FrameData[] = [{ frame: 'tiny' }, { frame: 'dread' }, { frame: 'past_you', line: { date: 'x', text: 'y' } }];
  assert.equal(chooseFrame(e, []).frame, 'past_you');
  assert.equal(chooseFrame(e, ['past_you']).frame, 'dread');
  assert.equal(chooseFrame(e, ['dread', 'past_you', 'tiny']).frame, 'tiny');
  assert.equal(chooseFrame([{ frame: 'tiny' }], ['tiny', 'tiny']).frame, 'tiny');
});

test('wording: short titles, short bodies, no exclamation marks or emoji; voices', () => {
  const h = avoid({ ladder: ['Open the tracker'], pair_with: 'good coffee' });
  const all: FrameData[] = [
    { frame: 'tiny' },
    { frame: 'past_you', line: { date: '2026-11-24', text: 'Sent two applications. Way less bad than I thought.' } },
    { frame: 'dread', lighter: 7, rated: 9 },
    { frame: 'name_it' },
    { frame: 'this_week', goal: 'Land a GIS job' },
    { frame: 'permission' },
    { frame: 'pair' },
    { frame: 'horizon', horizon: 'a job I like' },
  ];
  for (const f of all) {
    const t = frameText(f, h, '2026-11-25', null);
    assert.ok(!/[!\u{1F300}-\u{1FAFF}]/u.test(t.title + t.body), f.frame);
    assert.ok(t.title.split(/\s+/).length <= 6, `${f.frame} title: ${t.title}`);
    if (f.frame !== 'past_you') assert.ok(t.body.split(/\s+/).length <= 20, `${f.frame} body: ${t.body}`);
  }
  assert.deepEqual(frameText({ frame: 'tiny' }, h, '2026-11-25', null), {
    title: 'Just open the tracker.',
    body: 'Job search · Nothing to finish. Two minutes, then decide.',
  });
  assert.equal(frameText(all[1], h, '2026-11-25', null).title, 'From you, yesterday');
  assert.equal(frameText(all[1], h, '2026-11-28', null).title, 'From you, last Tuesday');
  assert.equal(frameText({ frame: 'pair' }, h, '2026-11-25', null).body, 'With it: open the tracker. Focus 25.');
  const t = {
    title: 'Lighter than you expect',
    body: 'Job search felt easier than you predicted 7 of the last 9 times. 10 min?',
  };
  assert.equal(applyVoice(t, 'gentle', h, 'Open the tracker').title, 'Maybe lighter than you expect?');
  assert.equal(
    applyVoice(t, 'direct', h, 'Open the tracker').body,
    'Job search felt easier than you predicted 7 of the last 9 times.',
  );
  assert.deepEqual(applyVoice(t, 'facts', h, 'Open the tracker'), {
    title: 'Open the tracker',
    body: 'Focus 25 · Job search',
  });
});

test('helpers: not-started run stops at a start', () => {
  const h = avoid();
  const idx = indexRecords([rec(h, '2026-11-20'), rec(h, '2026-11-22', 'skipped')]);
  assert.equal(notStartedRun(h, idx, '2026-11-25'), 4); // 21, 22, 23, 24
});

test('times: 15 min after the morning anchor is tapped, then 3 h later; never in the last 2 h', () => {
  const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
  const h = avoid();
  const r = DEFAULT_REMINDERS;
  const plain = nudgeTimes(h, [wake, h], indexRecords([]), '2026-11-25', r, '20:00');
  assert.deepEqual(
    plain.times.map((d) => d.toTimeString().slice(0, 5)),
    ['07:15', '10:15'],
  );
  const tapped = { ...rec(wake, '2026-11-25'), timestamp: new Date('2026-11-25T08:40:00').toISOString() };
  const after = nudgeTimes(h, [wake, h], indexRecords([tapped]), '2026-11-25', r, '20:00');
  assert.deepEqual(
    after.times.map((d) => d.toTimeString().slice(0, 5)),
    ['08:55', '11:55'],
  );
  const late = nudgeTimes(avoid({ meta: { nudgeTime: '18:30' } }), [wake], indexRecords([]), '2026-11-25', r, '20:00');
  assert.deepEqual(
    late.times.map((d) => d.toTimeString().slice(0, 5)),
    ['18:30'],
  );
});

test('3 ignored in a row stops nudges; a tap, a session or a Not landing choice resets it', () => {
  const h = avoid();
  const row = (date: string, opened: string | null = null): NudgeLogRow => ({
    id: `nudge-${h.id}-${date}-0`,
    habit_id: h.id,
    date,
    frame: 'tiny',
    sent_at: `${date}T09:00:00`,
    opened_at: opened,
    action: null,
  });
  const now = new Date('2026-11-25T12:00:00');
  const log = [
    row('2026-11-21', '2026-11-21T09:05:00'),
    row('2026-11-22'),
    row('2026-11-23'),
    row('2026-11-24'),
    row('2026-11-25'),
  ];
  assert.equal(ignoredStreak(log, h, indexRecords([]), now, '2026-11-25'), 3); // today's isn't settled yet
  assert.equal(ignoredStreak(log, h, indexRecords([rec(h, '2026-11-23')]), now, '2026-11-25'), 1);
  const reset = { ...h, meta: { nudgeResetAt: '2026-11-23T12:00:00' } };
  assert.equal(ignoredStreak(log, reset, indexRecords([]), now, '2026-11-25'), 1);
  const plan = (l: NudgeLogRow[], hh: Habit) =>
    planNudges({
      habits: [hh],
      idx: indexRecords([]),
      date: '2026-11-25',
      today: '2026-11-25',
      now: new Date('2026-11-25T06:00:00'),
      r: DEFAULT_REMINDERS,
      cutoff: '20:00',
      log: l,
      notToday: [],
      goals: [],
      horizon: null,
    });
  assert.equal(plan(log.slice(0, 4), h).length, 0);
  assert.equal(plan(log.slice(0, 4), reset).length, 2);
  assert.equal(plan([], { ...h, meta: { nudgesPausedUntil: '2026-11-30' } }).length, 0);
});

test('planned nudges: two a day at most, ids stable, last two frames not repeated, Name it has reason buttons', () => {
  const h = avoid();
  const idx = indexRecords([]);
  const p = planNudges({
    habits: [h],
    idx,
    date: '2026-11-25',
    today: '2026-11-25',
    now: new Date('2026-11-25T06:00:00'),
    r: DEFAULT_REMINDERS,
    cutoff: '20:00',
    log: [],
    notToday: [],
    goals: [],
    horizon: null,
  });
  assert.deepEqual(
    p.map((n) => [n.id, n.frame, n.category]),
    [
      [`nudge-${h.id}-2026-11-25-0`, 'name_it', 'nudge-name'],
      [`nudge-${h.id}-2026-11-25-1`, 'tiny', 'start-25'],
    ],
  );
});

test('not landing helpers: usual open times; habits that stopped', async () => {
  const { usualTimes, notLanding } = await import('./nudges');
  assert.deepEqual(usualTimes(['08:00', '21:30', '08:00', '12:30', '21:30', '08:00', '07:00']), [
    '07:00',
    '08:00',
    '21:30',
  ]);
  const h = avoid();
  const log: NudgeLogRow[] = ['2026-11-21', '2026-11-22', '2026-11-23'].map((d) => ({
    id: `n-${d}`,
    habit_id: h.id,
    date: d,
    frame: 'tiny',
    sent_at: `${d}T09:00:00`,
    opened_at: null,
    action: null,
  }));
  const now = new Date('2026-11-25T08:00:00');
  assert.deepEqual(
    notLanding([h], log, indexRecords([]), now, '2026-11-25').map((x) => x.id),
    [h.id],
  );
  assert.deepEqual(
    notLanding([{ ...h, meta: { nudgesPausedUntil: '2026-12-01' } }], log, indexRecords([]), now, '2026-11-25'),
    [],
  );
});
