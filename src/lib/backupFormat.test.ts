/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup } from './backupFormat';

test('backup validation: accepts our files, refuses others and newer versions', () => {
  const ok = { app: 'habits', schemaVersion: 8, exportedAt: 'x', tables: { habits: [], records: [] } };
  assert.equal(validateBackup(ok, 8).schemaVersion, 8);
  assert.equal(validateBackup({ ...ok, schemaVersion: 5 }, 8).schemaVersion, 5); // older restores
  assert.throws(() => validateBackup({ ...ok, schemaVersion: 9 }, 8), /newer version/);
  assert.throws(() => validateBackup({ foo: 1 }, 8), /not a Habits backup/);
  assert.throws(() => validateBackup(null, 8), /not a Habits backup/);
  assert.throws(() => validateBackup({ ...ok, tables: { records: [] } }, 8), /no habits table/);
});

test('every table the database creates is listed for the backup', async () => {
  const { readFileSync } = await import('node:fs');
  const { BACKUP_TABLES } = await import('./backupFormat');
  const src = readFileSync(new URL('../db/db.ts', import.meta.url), 'utf8');
  const created = [...src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  const dropped = [...src.matchAll(/DROP TABLE (\w+)/g)].map((m) => m[1]);
  const live = [...new Set(created)].filter((t) => !dropped.includes(t)).sort();
  assert.deepEqual(live, [...BACKUP_TABLES].sort());
});
