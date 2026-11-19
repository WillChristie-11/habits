import * as SQLite from 'expo-sqlite';
import type { DayRecord, Frequency, Habit, HabitInput, RecordStatus, Section } from '../types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

const SCHEMA_VERSION = 1;

async function open() {
  const db = await SQLite.openDatabaseAsync('habits.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        section TEXT NOT NULL CHECK (section IN ('morning','evening','week')),
        why TEXT,
        minimum_version TEXT,
        frequency TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        stack_after INTEGER REFERENCES habits(id) ON DELETE SET NULL,
        paused_from TEXT,
        paused_until TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('done','skipped','missed','paused')),
        feeling INTEGER CHECK (feeling BETWEEN 1 AND 5),
        timestamp TEXT NOT NULL,
        PRIMARY KEY (habit_id, date)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  if (version < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

interface HabitRow {
  id: number;
  name: string;
  section: Section;
  why: string | null;
  minimum_version: string | null;
  frequency: string;
  sort_order: number;
  stack_after: number | null;
  paused_from: string | null;
  paused_until: string | null;
  created_at: string;
}

function rowToHabit(r: HabitRow): Habit {
  let frequency: Frequency;
  try {
    frequency = JSON.parse(r.frequency);
  } catch {
    frequency = { type: 'daily' };
  }
  return {
    id: r.id,
    name: r.name,
    section: r.section,
    why: r.why,
    minimum_version: r.minimum_version,
    frequency,
    order: r.sort_order,
    stack_after: r.stack_after,
    paused_from: r.paused_from,
    paused_until: r.paused_until,
    created_at: r.created_at,
  };
}

export async function loadHabits(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>('SELECT * FROM habits ORDER BY section, sort_order, id');
  return rows.map(rowToHabit);
}

export async function loadRecords(): Promise<DayRecord[]> {
  const db = await getDb();
  return db.getAllAsync<DayRecord>('SELECT habit_id, date, status, feeling, timestamp FROM records');
}

export async function createHabit(input: HabitInput): Promise<number> {
  const db = await getDb();
  const max = await db.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(sort_order) AS m FROM habits WHERE section = ?',
    input.section,
  );
  const res = await db.runAsync(
    `INSERT INTO habits (name, section, why, minimum_version, frequency, sort_order, stack_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.name,
    input.section,
    input.why,
    input.minimum_version,
    JSON.stringify(input.frequency),
    (max?.m ?? -1) + 1,
    input.stack_after,
    new Date().toISOString(),
  );
  return res.lastInsertRowId;
}

export async function updateHabit(id: number, input: HabitInput): Promise<void> {
  const db = await getDb();
  const current = await db.getFirstAsync<{ section: Section }>('SELECT section FROM habits WHERE id = ?', id);
  let orderClause = '';
  const params: (string | number | null)[] = [
    input.name,
    input.section,
    input.why,
    input.minimum_version,
    JSON.stringify(input.frequency),
    input.stack_after,
  ];
  if (current && current.section !== input.section) {
    // Moving sections: append to the end of the new one, and detach anything stacked on it.
    const max = await db.getFirstAsync<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM habits WHERE section = ?',
      input.section,
    );
    orderClause = ', sort_order = ?';
    params.push((max?.m ?? -1) + 1);
    await db.runAsync('UPDATE habits SET stack_after = NULL WHERE stack_after = ?', id);
  }
  params.push(id);
  await db.runAsync(
    `UPDATE habits SET name = ?, section = ?, why = ?, minimum_version = ?, frequency = ?, stack_after = ?${orderClause}
     WHERE id = ?`,
    ...params,
  );
}

export async function deleteHabit(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM habits WHERE id = ?', id);
}

/** Persist a new order for the given habit ids (index = sort_order). */
export async function reorderHabits(ids: number[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.runAsync('UPDATE habits SET sort_order = ? WHERE id = ?', i, ids[i]);
    }
  });
}

export async function setRecord(
  habitId: number,
  date: string,
  status: RecordStatus,
  feeling: number | null = null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO records (habit_id, date, status, feeling, timestamp) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status, feeling = excluded.feeling,
       timestamp = excluded.timestamp`,
    habitId,
    date,
    status,
    feeling,
    new Date().toISOString(),
  );
}

export async function setFeeling(habitId: number, date: string, feeling: number | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE records SET feeling = ? WHERE habit_id = ? AND date = ?', feeling, habitId, date);
}

export async function clearRecord(habitId: number, date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM records WHERE habit_id = ? AND date = ?', habitId, date);
}

export async function loadSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
