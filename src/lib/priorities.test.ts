/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Priority } from '../types';
import { canAddPriority, prioritiesOn } from './priorities';

const p = (id: number, created_on: string, done_on: string | null = null): Priority => ({
  id,
  text: `p${id}`,
  created_on,
  done_on,
});

test('priorities: open ones carry over; checked ones stay on the day they were checked', () => {
  const list = [
    p(1, '2026-11-18'),
    p(2, '2026-11-19', '2026-11-19'),
    p(3, '2026-11-18', '2026-11-20'),
    p(4, '2026-11-20'),
  ];
  const today = '2026-11-20';
  assert.deepEqual(
    prioritiesOn(list, today, today).map((x) => x.id),
    [1, 4, 3],
  );
  assert.deepEqual(
    prioritiesOn(list, '2026-11-19', today).map((x) => x.id),
    [2],
  );
  assert.deepEqual(
    prioritiesOn(list, '2026-11-18', today).map((x) => x.id),
    [],
  );
});

test('priorities: at most 3 open at a time', () => {
  assert.equal(canAddPriority([p(1, 'a'), p(2, 'a'), p(3, 'a', 'b')]), true);
  assert.equal(canAddPriority([p(1, 'a'), p(2, 'a'), p(3, 'a')]), false);
});
