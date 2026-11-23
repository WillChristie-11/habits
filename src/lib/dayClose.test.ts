import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  betterRecap,
  closeLines,
  glanceLine,
  isEmptyClose,
  pageWithClose,
  tidyClose,
  windDownAnchor,
  yesterdayLine,
} from './dayClose';
import type { Habit } from '../types';

const anchor = (id: number, name: string, time: string | null) =>
  ({ id, kind: 'anchor', name, scheduled_time: time }) as unknown as Habit;

test('close the day: tidy fields, empty saves nothing, journal lines in order', () => {
  const c = tidyClose('2026-11-23', { reflection: '  Slow start ', action: '', better: 'start before lunch' });
  assert.deepEqual(c, { date: '2026-11-23', reflection: 'Slow start', action: null, better: 'start before lunch' });
  assert.ok(isEmptyClose(tidyClose('2026-11-23', { reflection: ' ', action: '', better: '' })));
  assert.deepEqual(closeLines(c), ['Reflection: Slow start', 'Better tomorrow: start before lunch']);
});

test('close the day: lines go at the end of the page; closing again replaces them', () => {
  const c = tidyClose('d', { reflection: 'Good', action: 'Email Sam' });
  assert.equal(pageWithClose('', c), 'Reflection: Good\nAction: Email Sam');
  const once = pageWithClose('Walked in the rain.\n', c);
  assert.equal(once, 'Walked in the rain.\n\nReflection: Good\nAction: Email Sam');
  const again = pageWithClose(once, tidyClose('d', { better: 'sleep earlier' }));
  assert.equal(again, 'Walked in the rain.\n\nBetter tomorrow: sleep earlier');
});

test('wind down: the anchor named so, else the earliest anchor from 8 PM', () => {
  const wake = anchor(1, 'Wake up', '07:00');
  const late = anchor(2, 'Read in bed', '22:30');
  const eve = anchor(3, 'Evening', '20:30');
  assert.equal(windDownAnchor([wake, late, eve, anchor(4, 'Wind down', '21:30')])?.id, 4);
  assert.equal(windDownAnchor([wake, late, eve])?.id, 3);
  assert.equal(windDownAnchor([wake]), undefined);
});

test('glance line and yesterday line', () => {
  assert.equal(
    glanceLine([{ name: 'Read' }, { name: 'Lift' }, { name: 'Job search', minutes: 10 }], 2),
    'Read · Lift · Job search 10 min · 2 priorities',
  );
  assert.equal(glanceLine([], 1), '1 priority');
  assert.equal(glanceLine([], 0), null);
  assert.equal(
    yesterdayLine('starting the job search before lunch.'),
    'Yesterday you said: better at starting the job search before lunch.',
  );
  assert.equal(yesterdayLine('  '), null);
});

test('sunday recap: the week’s better lines; a theme from 2+ days shown once', () => {
  const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
  const closes = [
    tidyClose('2026-11-18', { better: 'Start the job search before lunch' }),
    tidyClose('2026-11-16', { better: 'start job search earlier' }),
    tidyClose('2026-11-17', { better: 'Phone away at dinner' }),
    tidyClose('2026-11-10', { better: 'phone away at dinner' }),
    tidyClose('2026-11-19', { reflection: 'ok' }),
  ];
  const r = betterRecap(closes, days);
  assert.deepEqual(r.lines, ['start job search earlier', 'Phone away at dinner', 'Start the job search before lunch']);
  assert.deepEqual(r.repeated, ['Start the job search before lunch']);
});
