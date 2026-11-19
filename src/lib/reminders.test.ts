/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DayRecord, Frequency, Habit, ReminderSettings } from '../types';
import { DEFAULT_REMINDERS } from '../types';
import { indexRecords } from './schedule';
import { banners, behindPace, pickMessage, planNotifications, sectionPassed, MAX_SCHEDULED } from './reminders';

const TODAY = '2026-11-19'; // Thursday
const ctx = { today: TODAY };
const R: ReminderSettings = { ...DEFAULT_REMINDERS };
const at = (hm: string, day = TODAY) => new Date(`${day}T${hm}:00`);

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
  const plan = planNotifications([wake, pills, quiet], indexRecords([]), ctx, { ...R, morningEnabled: false, eveningEnabled: false }, at('09:00'));
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
  const plan2 = planNotifications([pills], indexRecords([rec(pills, TODAY)]), ctx, { ...R, morningEnabled: false, eveningEnabled: false }, at('09:00'));
  assert.deepEqual(plan2.map((p) => p.data.date), ['2026-11-20']);
});

test('morning reminder lists unfinished morning habits; evening nudge flags never-miss-twice first', () => {
  const med = habit(daily, { name: 'Meditate' });
  const read = habit(daily, { name: 'Read', section: 'evening' });
  const floss = habit(daily, { name: 'Floss', section: 'evening', minimum_version: 'one tooth' });
  // Floss missed yesterday (no record on the 18th), Read done yesterday
  const idx = indexRecords([rec(read, '2026-11-18'), rec(med, '2026-11-18')]);
  const plan = planNotifications([med, read, floss], idx, ctx, R, at('06:00'));
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
  assert.deepEqual(plan2.filter((p) => p.data.date === TODAY).map((p) => p.data.type), ['evening']);
});

test('paused habits get no notifications', () => {
  const h = habit(daily, { name: 'Run', scheduled_time: '18:00', reminder: true, paused_until: '2026-11-25' });
  assert.deepEqual(planNotifications([h], indexRecords([]), ctx, R, at('06:00')), []);
});

test('snoozes are scheduled until done; never more than the iOS cap', () => {
  const h = habit(daily, { name: 'Stretch', section: 'evening' });
  const r = { ...R, morningEnabled: false, eveningEnabled: false, snoozes: [{ habitId: h.id, date: TODAY, at: at('09:30').toISOString() }] };
  assert.deepEqual(planNotifications([h], indexRecords([]), ctx, r, at('09:00')).map((p) => p.id), [`snooze-${h.id}-${TODAY}`]);
  assert.deepEqual(planNotifications([h], indexRecords([rec(h, TODAY)]), ctx, r, at('09:00')), []);

  const many = Array.from({ length: 50 }, (_, i) =>
    habit(daily, { scheduled_time: `${String(10 + (i % 12)).padStart(2, '0')}:00`, reminder: true }),
  );
  assert.equal(planNotifications(many, indexRecords([]), ctx, R, at('06:00')).length, MAX_SCHEDULED);
});

test('behind pace: 0/2 with 3 days left warns, 1/2 with 3 days left does not', () => {
  const lift = habit({ type: 'weekly_count', count: 2 }, { section: 'week' });
  const fri = { today: '2026-11-20' };
  assert.equal(behindPace([lift], indexRecords([]), fri).length, 1);
  assert.equal(behindPace([lift], indexRecords([rec(lift, '2026-11-17')]), fri).length, 0);
  assert.equal(behindPace([lift], indexRecords([]), ctx).length, 0); // Thursday: 4 days left
});

test('banners: morning from its time until dismissed; evening turns late after the deadline', () => {
  const med = habit(daily, { name: 'Meditate' });
  const idx = indexRecords([]);
  assert.deepEqual(banners([med], idx, ctx, R, at('07:00')).map((b) => b.kind), []);
  assert.deepEqual(banners([med], idx, ctx, R, at('08:00')).map((b) => b.kind), ['morning']);
  assert.deepEqual(banners([med], idx, ctx, { ...R, morningDismissedOn: TODAY }, at('08:00')), []);
  const late = banners([med], idx, ctx, { ...R, morningDismissedOn: TODAY }, at('22:15'));
  assert.equal(late[0].kind, 'evening');
  assert.equal(late[0].kind === 'evening' && late[0].late, true);
  const early = banners([med], idx, ctx, { ...R, morningDismissedOn: TODAY }, at('20:30'));
  assert.equal(early[0].kind === 'evening' && early[0].minutesLeft, 90);
  // not dismissed: the evening nudge replaces the morning banner instead of stacking
  assert.deepEqual(banners([med], idx, ctx, R, at('20:30')).map((b) => b.kind), ['evening']);
});

test('section passed: timed after its time, morning after noon, evening at nudge start', () => {
  const t = habit(daily, { scheduled_time: '08:15' });
  const m = habit(daily);
  const e = habit(daily, { section: 'evening' });
  assert.equal(sectionPassed(t, R, at('08:20'), false), true);
  assert.equal(sectionPassed(m, R, at('11:59'), false), false);
  assert.equal(sectionPassed(m, R, at('12:00'), false), true);
  assert.equal(sectionPassed(e, R, at('19:59'), false), false);
  assert.equal(sectionPassed(e, R, at('20:00'), false), true);
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
