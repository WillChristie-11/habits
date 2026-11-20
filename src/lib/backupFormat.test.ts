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
