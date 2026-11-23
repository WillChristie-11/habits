/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakMinutes, clock, focusRecapLine, focusRound, hoursMinutes, meditateTint, runningText } from './timers';

test('focus rounds: round n of 4 with dots; every 4th break is 15 min', () => {
  assert.deepEqual(focusRound(0), { round: 1, of: 4, filled: 0 });
  assert.deepEqual(focusRound(1), { round: 2, of: 4, filled: 1 });
  assert.deepEqual(focusRound(4), { round: 1, of: 4, filled: 0 });
  assert.deepEqual([1, 2, 3, 4, 5, 8].map(breakMinutes), [5, 5, 5, 15, 5, 15]);
});

test('timer text: clock, running bar, recap line', () => {
  assert.equal(clock(18 * 60_000 + 42_000), '18:42');
  assert.equal(clock(65 * 60_000), '1:05:00');
  assert.equal(runningText('focus', 'focus', 18 * 60_000 + 42_000), 'Focus · 18:42 left');
  assert.equal(runningText('meditate', 'focus', 6 * 60_000 + 10_000), 'Meditate · 6:10 left');
  assert.equal(runningText('focus', 'break', 4 * 60_000), 'Break · 4:00 left');
  assert.equal(hoursMinutes(150), '2 h 30 min');
  assert.equal(hoursMinutes(45), '45 min');
  const log = [25, 25, 25, 25, 25, 25].map((minutes, i) => ({ date: `2026-11-1${6 + (i % 3)}`, minutes }));
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  assert.equal(focusRecapLine(log, week), 'Focus: 6 rounds · 2 h 30 min');
  assert.equal(focusRecapLine([{ date: '2026-11-16', minutes: 25 }], week), 'Focus: 1 round · 25 min');
  assert.equal(focusRecapLine(log, ['2026-11-23']), null);
});

test('meditate tint lightens from 40% to 15%', () => {
  assert.equal(meditateTint(0), 0.4);
  assert.equal(meditateTint(1), 0.15);
  assert.equal(meditateTint(2), 0.15);
});

test('linked timer comes from the habit meta', async () => {
  const { linkedTimer } = await import('./timers');
  assert.equal(linkedTimer({ timer: 'focus' }), 'focus');
  assert.equal(linkedTimer({ timer: 'meditate' }), 'meditate');
  assert.equal(linkedTimer({ timer: 'nap' }), null);
  assert.equal(linkedTimer(null), null);
});
