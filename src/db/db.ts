import * as SQLite from 'expo-sqlite';
import type { DayRecord, Frequency, Habit, HabitInput, ItemKind, Meta, RecordStatus, Section } from '../types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

const SCHEMA_VERSION = 5;

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
  if (version < 2) {
    // v2: anchors, scheduled times, reminders, and free-form meta for future features.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'habit';
        ALTER TABLE habits ADD COLUMN scheduled_time TEXT;
        ALTER TABLE habits ADD COLUMN end_time TEXT;
        ALTER TABLE habits ADD COLUMN reminder INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE habits ADD COLUMN remind_before INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE habits ADD COLUMN meta TEXT;
        ALTER TABLE records ADD COLUMN meta TEXT;
      `);
    });
  }
  if (version < 3) {
    // v3: per-habit motivational messages (JSON array of strings).
    await db.execAsync(`ALTER TABLE habits ADD COLUMN messages TEXT;`);
  }
  if (version < 4) {
    // v4: want / avoid habits, timed sessions, step ladders, "pair with".
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE habits ADD COLUMN habit_kind TEXT NOT NULL DEFAULT 'want';
        ALTER TABLE habits ADD COLUMN session_minutes INTEGER NOT NULL DEFAULT 15;
        ALTER TABLE habits ADD COLUMN ladder TEXT;
        ALTER TABLE habits ADD COLUMN ladder_index INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE habits ADD COLUMN pair_with TEXT;
      `);
    });
  }
  if (version < 5) {
    // v5: if-then plan and obstacle plan.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE habits ADD COLUMN plan_when TEXT;
        ALTER TABLE habits ADD COLUMN plan_action TEXT;
        ALTER TABLE habits ADD COLUMN obstacle TEXT;
      `);
    });
  }
  if (version < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

interface HabitRow {
  id: number;
  kind: ItemKind;
  scheduled_time: string | null;
  end_time: string | null;
  reminder: number;
  remind_before: number;
  meta: string | null;
  messages: string | null;
  habit_kind: string;
  session_minutes: number;
  ladder: string | null;
  ladder_index: number;
  pair_with: string | null;
  plan_when: string | null;
  plan_action: string | null;
  obstacle: string | null;
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

function parseMeta(raw: string | null): Meta | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function parseMessages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  } catch {
    return [];
  }
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
    kind: r.kind === 'anchor' ? 'anchor' : 'habit',
    name: r.name,
    section: r.section,
    why: r.why,
    minimum_version: r.minimum_version,
    messages: parseMessages(r.messages),
    habit_kind: r.habit_kind === 'avoid' ? 'avoid' : 'want',
    session_minutes: r.session_minutes || 15,
    ladder: parseMessages(r.ladder),
    ladder_index: r.ladder_index ?? 0,
    pair_with: r.pair_with,
    plan_when: r.plan_when,
    plan_action: r.plan_action,
    obstacle: r.obstacle,
    frequency,
    order: r.sort_order,
    stack_after: r.stack_after,
    paused_from: r.paused_from,
    paused_until: r.paused_until,
    created_at: r.created_at,
    scheduled_time: r.scheduled_time,
    end_time: r.end_time,
    reminder: !!r.reminder,
    remind_before: r.remind_before ?? 0,
    meta: parseMeta(r.meta),
  };
}

export async function loadHabits(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>('SELECT * FROM habits ORDER BY section, sort_order, id');
  return rows.map(rowToHabit);
}

export async function loadRecords(): Promise<DayRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<DayRecord, 'meta'> & { meta: string | null }>(
    'SELECT habit_id, date, status, feeling, timestamp, meta FROM records',
  );
  return rows.map((r) => ({ ...r, meta: parseMeta(r.meta) }));
}

export async function createHabit(input: HabitInput): Promise<number> {
  const db = await getDb();
  const max = await db.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(sort_order) AS m FROM habits WHERE section = ?',
    input.section,
  );
  const res = await db.runAsync(
    `INSERT INTO habits (kind, name, section, why, minimum_version, frequency, sort_order, stack_after,
       scheduled_time, end_time, reminder, remind_before, meta, messages,
       habit_kind, session_minutes, ladder, ladder_index, pair_with, plan_when, plan_action, obstacle, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.kind,
    input.name,
    input.section,
    input.why,
    input.minimum_version,
    JSON.stringify(input.frequency),
    (max?.m ?? -1) + 1,
    input.stack_after,
    input.scheduled_time,
    input.end_time,
    input.reminder ? 1 : 0,
    input.remind_before,
    input.meta ? JSON.stringify(input.meta) : null,
    JSON.stringify(input.messages),
    input.habit_kind,
    input.session_minutes,
    JSON.stringify(input.ladder),
    input.ladder_index,
    input.pair_with,
    input.plan_when,
    input.plan_action,
    input.obstacle,
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
    input.scheduled_time,
    input.end_time,
    input.reminder ? 1 : 0,
    input.remind_before,
    input.meta ? JSON.stringify(input.meta) : null,
    JSON.stringify(input.messages),
    input.habit_kind,
    input.session_minutes,
    JSON.stringify(input.ladder),
    input.ladder_index,
    input.pair_with,
    input.plan_when,
    input.plan_action,
    input.obstacle,
  ];
  if (current && current.section !== input.section) {
    // Moving sections: append to the end of the new one, and detach anything stacked on it.
    const max = await db.getFirstAsync<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM habits WHERE section = ?',
      input.section,
    );
    orderClause = ', sort_order = ?';
    params.push((max?.m ?? -1) + 1);
    // Habits stacked on a habit that changed section would end up in limbo; anchors keep their followers.
    if (input.kind === 'habit') await db.runAsync('UPDATE habits SET stack_after = NULL WHERE stack_after = ?', id);
  }
  params.push(id);
  await db.runAsync(
    `UPDATE habits SET name = ?, section = ?, why = ?, minimum_version = ?, frequency = ?, stack_after = ?,
       scheduled_time = ?, end_time = ?, reminder = ?, remind_before = ?, meta = ?, messages = ?,
       habit_kind = ?, session_minutes = ?, ladder = ?, ladder_index = ?, pair_with = ?,
       plan_when = ?, plan_action = ?, obstacle = ?${orderClause}
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
  meta: Meta | null = null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO records (habit_id, date, status, feeling, timestamp, meta) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status, feeling = excluded.feeling,
       timestamp = excluded.timestamp, meta = excluded.meta`,
    habitId,
    date,
    status,
    feeling,
    new Date().toISOString(),
    meta ? JSON.stringify(meta) : null,
  );
}

export async function setLadderIndex(habitId: number, index: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE habits SET ladder_index = ? WHERE id = ?', index, habitId);
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
