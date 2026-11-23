/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayRecord, Frequency, Habit, ReminderSettings } from '../types';
import { DEFAULT_REMINDERS } from '../types';
import { indexRecords, isMorning, missedTwiceRisk, stateOn, todayCompletion } from './schedule';
import {
  avoidLine,
  banners,
  checkinTimes,
  checkinCandidates,
  paceText,
  ifThenLine,
  obstacleLine,
  suggestPlanWhen,
  behindPace,
  pickMessage,
  planNotifications,
  MAX_SCHEDULED,
} from './reminders';

const TODAY = '2026-11-19'; // Thursday
const ctx = { today: TODAY };
// Check-ins off in the base settings so other tests see only what they're about.
const R: ReminderSettings = { ...DEFAULT_REMINDERS, checkins: { ...DEFAULT_REMINDERS.checkins, enabled: false } };
const at = (hm: string, day = TODAY) => new Date(`${day}T${hm}:00`);

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
    ask_note: false,
    check_minutes: 45,
    locked: false,
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
const daily: Frequency = { type: 'daily' };

test('item reminders: today + tomorrow, minus lead time, skipped when done or in the past', () => {
  const wake = habit(daily, { kind: 'anchor', name: 'Wake', scheduled_time: '07:00', reminder: true });
  const pills = habit(daily, { name: 'Pills', scheduled_time: '13:00', reminder: true, remind_before: 10 });
  const quiet = habit(daily, { name: 'Quiet', scheduled_time: '15:00', reminder: false });
  const plan = planNotifications(
    [wake, pills, quiet],
    indexRecords([]),
    ctx,
    { ...R, morningEnabled: false, eveningEnabled: false },
    at('09:00'),
  );
  assert.deepEqual(
    plan.map((p) => [p.id, p.at.toTimeString().slice(0, 5)]),
    [
      [`item-${pills.id}-${TODAY}`, '12:50'],
      [`item-${wake.id}-2026-11-20`, '07:00'],
      [`item-${pills.id}-2026-11-20`, '12:50'],
    ],
  );
  assert.equal(plan[0].category, 'item');
  // done today → only tomorrow's
  const plan2 = planNotifications(
    [pills],
    indexRecords([rec(pills, TODAY)]),
    ctx,
    { ...R, morningEnabled: false, eveningEnabled: false },
    at('09:00'),
  );
  assert.deepEqual(
    plan2.map((p) => p.data.date),
    ['2026-11-20'],
  );
});

test('morning reminder lists habits under morning anchors; evening nudge flags never-miss-twice first', () => {
  const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
  const med = habit(daily, { name: 'Meditate', stack_after: wake.id });
  const read = habit(daily, { name: 'Read' });
  const floss = habit(daily, { name: 'Floss', minimum_version: 'one tooth' });
  // Floss missed yesterday (no record on the 18th), Read done yesterday
  const idx = indexRecords([rec(read, '2026-11-18'), rec(med, '2026-11-18')]);
  const plan = planNotifications([wake, med, read, floss], idx, ctx, R, at('06:00'));
  const morning = plan.find((p) => p.id === `morning-${TODAY}`)!;
  assert.equal(morning.at.toTimeString().slice(0, 5), '07:30');
  assert.equal(morning.body, '1 to do: Meditate');
  const evening = plan.find((p) => p.id === `evening-${TODAY}`)!;
  assert.equal(evening.at.toTimeString().slice(0, 5), '20:00');
  assert.match(evening.body, /^Floss ⚑, Meditate, Read\. Minimum for Floss: one tooth\.$/);
  assert.match(evening.title, /^3 left · 2 h until/);
});

test('evening nudge is dropped when everything is done; morning one when dismissed', () => {
  const med = habit(daily, { name: 'Meditate' });
  const idx = indexRecords([rec(med, TODAY)]);
  const plan = planNotifications([med], idx, ctx, R, at('06:00'));
  assert.equal(plan.filter((p) => p.data.date === TODAY).length, 0);
  const plan2 = planNotifications([med], indexRecords([]), ctx, { ...R, morningDismissedOn: TODAY }, at('06:00'));
  assert.deepEqual(
    plan2.filter((p) => p.data.date === TODAY).map((p) => p.data.type),
    ['evening'],
  );
});

test('paused habits get no notifications', () => {
  const h = habit(daily, { name: 'Run', scheduled_time: '18:00', reminder: true, paused_until: '2026-11-25' });
  assert.deepEqual(planNotifications([h], indexRecords([]), ctx, R, at('06:00')), []);
});

test('snoozes are scheduled until done; never more than the iOS cap', () => {
  const h = habit(daily, { name: 'Stretch' });
  const r = {
    ...R,
    morningEnabled: false,
    eveningEnabled: false,
    snoozes: [{ habitId: h.id, date: TODAY, at: at('09:30').toISOString() }],
  };
  assert.deepEqual(
    planNotifications([h], indexRecords([]), ctx, r, at('09:00')).map((p) => p.id),
    [`snooze-${h.id}-${TODAY}`],
  );
  assert.deepEqual(planNotifications([h], indexRecords([rec(h, TODAY)]), ctx, r, at('09:00')), []);

  const many = Array.from({ length: 50 }, (_, i) =>
    habit(daily, { scheduled_time: `${String(10 + (i % 12)).padStart(2, '0')}:00`, reminder: true }),
  );
  assert.equal(planNotifications(many, indexRecords([]), ctx, R, at('06:00')).length, MAX_SCHEDULED);
});

test('behind pace: 0/2 with 3 days left warns, 1/2 with 3 days left does not', () => {
  const lift = habit({ type: 'weekly_count', count: 2 }, {});
  const fri = { today: '2026-11-20' };
  assert.equal(behindPace([lift], indexRecords([]), fri).length, 1);
  assert.equal(behindPace([lift], indexRecords([rec(lift, '2026-11-17')]), fri).length, 0);
  assert.equal(behindPace([lift], indexRecords([]), ctx).length, 0); // Thursday: 4 days left
});

test('banners: morning from its time until dismissed; evening turns late after the deadline', () => {
  const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
  const med = habit(daily, { name: 'Meditate', stack_after: wake.id });
  const idx = indexRecords([rec(wake, TODAY)]);
  assert.deepEqual(
    banners([wake, med], idx, ctx, R, at('07:00')).map((b) => b.kind),
    [],
  );
  assert.deepEqual(
    banners([wake, med], idx, ctx, R, at('08:00')).map((b) => b.kind),
    ['morning'],
  );
  assert.deepEqual(banners([wake, med], idx, ctx, { ...R, morningDismissedOn: TODAY }, at('08:00')), []);
  const late = banners([wake, med], idx, ctx, { ...R, morningDismissedOn: TODAY }, at('22:15'));
  assert.equal(late[0].kind, 'evening');
  assert.equal(late[0].kind === 'evening' && late[0].late, true);
  const early = banners([wake, med], idx, ctx, { ...R, morningDismissedOn: TODAY }, at('20:30'));
  assert.equal(early[0].kind === 'evening' && early[0].minutesLeft, 90);
  // not dismissed: the evening nudge replaces the morning banner instead of stacking
  assert.deepEqual(
    banners([wake, med], idx, ctx, R, at('20:30')).map((b) => b.kind),
    ['evening'],
  );
});

test('motivational messages rotate daily through why, own messages, then the general list', () => {
  const h = habit(daily, { why: 'calm', messages: ['you never regret it'] });
  const general = ['small steps'];
  const seen = new Set(['2026-11-19', '2026-11-20', '2026-11-21'].map((d) => pickMessage(h, d, general)));
  assert.deepEqual([...seen].sort(), ['calm', 'small steps', 'you never regret it']);
  assert.equal(pickMessage(habit(daily), TODAY, []), null);
  assert.equal(pickMessage(null, TODAY, general), 'small steps');
  // shows up in a timed habit's reminder and the evening nudge
  const t = habit(daily, { name: 'Read', scheduled_time: '21:00', reminder: true, messages: ['one page counts'] });
  const plan = planNotifications([t], indexRecords([]), ctx, { ...R, morningEnabled: false }, at('06:00'));
  assert.match(plan.find((p) => p.id.startsWith('item-'))!.body, /one page counts$/);
  assert.match(plan.find((p) => p.id.startsWith('evening-'))!.body, /\none page counts$/);
});

test('avoid habits get a "Focus 25" notification button; want habits get Done', () => {
  const apply = habit(daily, {
    name: 'Apply',
    habit_kind: 'avoid',
    session_minutes: 20,
    scheduled_time: '18:00',
    reminder: true,
  });
  const read = habit(daily, { name: 'Read', scheduled_time: '21:00', reminder: true });
  const plan = planNotifications(
    [apply, read],
    indexRecords([]),
    ctx,
    { ...R, morningEnabled: false, eveningEnabled: false },
    at('06:00'),
  );
  const cat = (h: Habit) => plan.find((p) => p.id === `item-${h.id}-${TODAY}`)!.category;
  assert.equal(cat(apply), 'start-25');
  assert.equal(cat(read), 'item');
});

test('avoid wording: time box + next step, pair-with as a question, "of" form without a ladder', () => {
  const a = habit(daily, { name: 'Apply', habit_kind: 'avoid', ladder: ['Find 1 role', 'Save it'], ladder_index: 1 });
  assert.equal(avoidLine(a), 'Focus 25: Save it');
  assert.equal(avoidLine(a, 'of'), 'Focus 25 on Apply');
  assert.equal(avoidLine({ ...a, ladder: [] }), 'Focus 25 on Apply');
  assert.equal(avoidLine({ ...a, pair_with: 'good coffee' }), 'good coffee + Focus 25: Save it?');
});

test('avoid habits: never counted, flagged or behind pace; own lines in the nudges', () => {
  const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
  const a = habit(daily, { name: 'Apply', habit_kind: 'avoid', session_minutes: 20, stack_after: wake.id });
  const w = habit(daily, { name: 'Read' });
  const lift = habit({ type: 'weekly_count', count: 2 }, { name: 'Lift', habit_kind: 'avoid' });
  const idx = indexRecords([rec(wake, '2026-11-18'), rec(wake, TODAY)]); // Apply and Read missed yesterday
  assert.equal(missedTwiceRisk(a, idx, ctx), false);
  assert.equal(missedTwiceRisk(w, idx, ctx), true);
  assert.deepEqual(todayCompletion([a, w], idx, ctx), { done: 0, total: 1, pct: 0 });
  assert.equal(behindPace([lift], idx, { today: '2026-11-21' }).length, 0);

  const plan = planNotifications([wake, a, w], idx, ctx, R, at('06:00'));
  const evening = plan.find((p) => p.id === `evening-${TODAY}`)!;
  assert.match(evening.title, /^1 left/); // Read only
  assert.match(evening.body, /^Read ⚑\.\nFocus 25 on Apply$/);
  const morning = plan.find((p) => p.id === `morning-${TODAY}`)!;
  assert.equal(morning.body, 'Focus 25 on Apply');

  // only avoid habits left → no count at all
  const onlyAvoid = planNotifications([a], idx, ctx, R, at('06:00')).find((p) => p.id === `evening-${TODAY}`)!;
  assert.equal(onlyAvoid.title, 'Still time for Focus 25 on Apply');

  const b = banners([a, w], idx, ctx, R, at('20:30'));
  const ev = b.find((x) => x.kind === 'evening');
  assert.ok(ev && ev.kind === 'evening' && ev.items.length === 1 && ev.avoid.length === 1);
});

test('avoid item reminders lead with the time box', () => {
  const a = habit(daily, {
    name: 'Apply',
    habit_kind: 'avoid',
    scheduled_time: '18:00',
    reminder: true,
    ladder: ['Find 1 role'],
  });
  const p = planNotifications(
    [a],
    indexRecords([]),
    ctx,
    { ...R, morningEnabled: false, eveningEnabled: false },
    at('06:00'),
  )[0];
  assert.equal(p.title, 'Focus 25: Find 1 role');
  assert.equal(p.category, 'start-25');
});

test('if-then plan wording, prefill, and use as the reminder text', () => {
  const h = habit(daily, {
    name: 'Meditate',
    scheduled_time: '07:30',
    reminder: true,
    plan_when: "I've poured my coffee",
    plan_action: 'Meditate for 2 minutes',
  });
  assert.equal(ifThenLine(h), "When I've poured my coffee, I will meditate for 2 minutes.");
  assert.equal(ifThenLine({ ...h, plan_action: null }), "When I've poured my coffee, I will meditate.");
  assert.equal(ifThenLine({ ...h, plan_when: '  ' }), null);
  assert.equal(suggestPlanWhen('Breakfast', '08:00'), 'Breakfast is done');
  assert.match(suggestPlanWhen(null, '08:00'), /^it's 8:00/);
  assert.equal(suggestPlanWhen(null, null), '');
  const p = planNotifications(
    [h],
    indexRecords([]),
    ctx,
    { ...R, morningEnabled: false, eveningEnabled: false },
    at('06:00'),
  )[0];
  assert.match(p.body, /When I've poured my coffee, I will meditate for 2 minutes\.$/);
});

test('obstacle plan names the minimum version when there is one', () => {
  const h = habit(daily, { obstacle: "I'm wiped out", minimum_version: 'one stretch' });
  assert.equal(obstacleLine(h), "If I'm wiped out, then I'll do the minimum: one stretch.");
  assert.equal(obstacleLine({ ...h, minimum_version: null }), "If I'm wiped out, then I'll do the minimum version.");
  assert.equal(obstacleLine({ ...h, obstacle: null }), null);
});

test('check-in times: within the window, spaced, stable for a date, different across dates', () => {
  const c = { enabled: true, count: 3, start: '09:00', end: '21:00', spacing: 90 };
  const t = checkinTimes(c, TODAY);
  assert.equal(t.length, 3);
  assert.deepEqual(t, checkinTimes(c, TODAY)); // re-planning doesn't move them
  const mins = t.map((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)));
  assert.ok(mins[0] >= 9 * 60 && mins[2] <= 21 * 60);
  assert.ok(mins[1] - mins[0] >= 90 && mins[2] - mins[1] >= 90);
  assert.notDeepEqual(checkinTimes(c, '2026-11-20'), t);
  // window too small for the count → fewer; off → none
  assert.equal(checkinTimes({ ...c, count: 5, start: '20:00', end: '21:00', spacing: 30 }, TODAY).length, 3);
  assert.deepEqual(checkinTimes({ ...c, enabled: false }, TODAY), []);
});

test('check-ins pick open habits, never-miss-twice and behind-pace first; avoid habits use their wording', () => {
  const calm = habit(daily, { name: 'Calm', order: 0 });
  const read = habit(daily, { name: 'Read', order: 1 });
  const done = habit(daily, { name: 'Done', order: 2 });
  const apply = habit(daily, { name: 'Apply', habit_kind: 'avoid', order: 3, ladder: ['Find 1 role'] });
  const idx = indexRecords([rec(calm, '2026-11-18'), rec(apply, '2026-11-18'), rec(done, TODAY)]); // Read missed yesterday
  const pool = checkinCandidates([calm, read, done, apply], idx, ctx, TODAY);
  assert.deepEqual(
    pool.map((h) => h.name),
    ['Read', 'Calm', 'Apply'],
  );

  const r = {
    ...R,
    morningEnabled: false,
    eveningEnabled: false,
    checkins: { enabled: true, count: 3, start: '09:00', end: '21:00', spacing: 90 },
  };
  const plan = planNotifications([read, apply], idx, ctx, r, at('06:00')).filter((p) =>
    p.id.startsWith(`checkin-${TODAY}`),
  );
  assert.equal(plan.length, 3);
  assert.equal(plan[0].title, 'Still on track for Read today?');
  assert.equal(plan[0].category, 'item');
  assert.equal(plan[1].title, 'Focus 25: Find 1 role');
  assert.equal(plan[1].category, 'start-25');
  // nothing open today → no check-ins today
  const none = planNotifications([done], idx, ctx, r, at('06:00')).filter((p) => p.id.startsWith(`checkin-${TODAY}`));
  assert.equal(none.length, 0);
});

test('evening nudge carries behind-pace want habits as a line (never avoid habits)', () => {
  const lift = habit({ type: 'weekly_count', count: 2 }, { name: 'Lift' });
  const guitar = habit({ type: 'weekly_count', count: 3 }, { name: 'Guitar', habit_kind: 'avoid' });
  const sat = '2026-11-21';
  const plan = planNotifications(
    [lift, guitar],
    indexRecords([]),
    { today: sat },
    { ...R, morningEnabled: false },
    new Date(`${sat}T06:00:00`),
  );
  const ev = plan.find((p) => p.id === `evening-${sat}`)!;
  assert.equal(ev.body, 'Lift: 0/2, 2 days left');
  assert.match(ev.title, /^This week · 2 h until/);
  assert.equal(paceText({ habit: lift, done: 0, target: 2, daysLeft: 1 }), 'Lift: 0/2, 1 day left');
});

test('activities are never expected, missed, flagged, counted or nudged', () => {
  const run = habit(daily, { kind: 'activity', name: 'Run', unit: 'mi' });
  const idx = indexRecords([]);
  assert.deepEqual(todayCompletion([run], idx, ctx), { done: 0, total: 0, pct: 0 });
  assert.equal(missedTwiceRisk(run, idx, ctx), false);
  assert.deepEqual(checkinCandidates([run], idx, ctx, TODAY), []);
  const plan = planNotifications([run], idx, ctx, { ...DEFAULT_REMINDERS }, at('06:00'));
  assert.deepEqual(plan, []);
  assert.deepEqual(banners([run], idx, ctx, R, at('21:00')), []);
});

test('cut-back habits are never expected, counted, flagged, nudged or in the morning list', () => {
  const wake = habit(daily, { kind: 'anchor', name: 'Wake up', scheduled_time: '07:00' });
  const snack = habit(daily, { name: 'Snacking', habit_kind: 'cut_back', stack_after: wake.id });
  const idx = indexRecords([]);
  assert.equal(stateOn(snack, idx, TODAY, ctx), 'none');
  assert.equal(missedTwiceRisk(snack, idx, ctx), false);
  assert.deepEqual(todayCompletion([snack], idx, ctx), { done: 0, total: 0, pct: 0 });
  assert.equal(isMorning(snack, [wake, snack]), false);
  const plan = planNotifications([wake, snack], idx, ctx, R, at('06:00'));
  assert.equal(plan.filter((p) => /Snacking/.test(p.title + p.body)).length, 0);
  assert.deepEqual(banners([wake, snack], idx, ctx, R, at('21:00')), []);
});

test('close the day: one notification at Wind down unless closed; the morning carries yesterday’s line', async () => {
  const { planNotifications, CLOSE_CATEGORY } = await import('./reminders');
  const { DEFAULT_REMINDERS } = await import('../types');
  const { indexRecords } = await import('./schedule');
  const now = new Date('2026-11-23T06:00:00');
  const r = { ...DEFAULT_REMINDERS, checkins: { ...DEFAULT_REMINDERS.checkins, enabled: false } };
  const close = { windDown: '21:30', closed: ['2026-11-24'], better: { '2026-11-22': 'phone away at dinner' } };
  const plan = planNotifications([], indexRecords([]), { today: '2026-11-23' }, r, now, close);
  const closes = plan.filter((p) => p.data.type === 'close');
  assert.deepEqual(
    closes.map((p) => [p.id, p.title, p.body, p.category]),
    [['close-2026-11-23', 'Close the day?', 'Three lines, then you’re done.', CLOSE_CATEGORY]],
  );
  const morning = plan.find((p) => p.id === 'morning-2026-11-23');
  assert.match(morning?.body ?? '', /Yesterday you said: better at phone away at dinner\./);
  assert.ok(!plan.some((p) => p.id === 'morning-2026-11-24'));
  const off = planNotifications(
    [],
    indexRecords([]),
    { today: '2026-11-23' },
    { ...r, closeDayEnabled: false },
    now,
    close,
  );
  assert.ok(!off.some((p) => p.data.type === 'close'));
});

test('pause all today, silenced occurrences, and the upcoming list', async () => {
  const { planNotifications, upcomingRows, liveSilenced } = await import('./reminders');
  const { DEFAULT_REMINDERS } = await import('../types');
  const { indexRecords } = await import('./schedule');
  const now = new Date('2026-11-23T06:00:00');
  const ctx = { today: '2026-11-23' };
  const r = { ...DEFAULT_REMINDERS, checkins: { ...DEFAULT_REMINDERS.checkins, count: 2 } };
  const close = { windDown: '21:30', closed: [], better: { '2026-11-22': 'phone away' } };
  const read = habit(daily, { name: 'Read' });
  const plan = planNotifications([read], indexRecords([]), ctx, r, now, close);
  assert.ok(plan.some((p) => p.id === 'close-2026-11-23'));

  const paused = planNotifications([read], indexRecords([]), ctx, { ...r, pausedOn: '2026-11-23' }, now, close);
  assert.ok(paused.every((p) => p.data.date === '2026-11-24'));
  assert.ok(paused.length > 0);

  const quiet = planNotifications([read], indexRecords([]), ctx, { ...r, silenced: ['close-2026-11-23'] }, now, close);
  assert.ok(!quiet.some((p) => p.id === 'close-2026-11-23'));
  assert.ok(quiet.some((p) => p.id === 'close-2026-11-24'));

  const rows = upcomingRows(plan, r);
  const checkins = rows.filter((x) => x.kind === 'checkins');
  assert.deepEqual(
    checkins.map((x) => x.kind === 'checkins' && [x.date, x.count]),
    [
      ['2026-11-23', 2],
      ['2026-11-24', 2],
    ],
  );
  assert.ok(!rows.some((x) => x.kind === 'one' && x.id.startsWith('checkin-')));
  const times = rows.map((x) => (x.kind === 'one' ? x.at.getTime() : new Date(`${x.date}T${x.start}:00`).getTime()));
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  assert.deepEqual(liveSilenced(['close-2026-11-22', 'item-3-2026-11-23', 'nudge-4-2026-11-24-1'], '2026-11-23'), [
    'item-3-2026-11-23',
    'nudge-4-2026-11-24-1',
  ]);
});
