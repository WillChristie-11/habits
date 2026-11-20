import * as SQLite from 'expo-sqlite';
import type { DayRecord, Frequency, Habit, HabitInput, ItemKind, JournalPage, Meta, RecordStatus } from '../types';
import { entryToLines } from '../lib/journal';
import { defaultAnchors } from '../lib/defaults';
import { BACKUP_APP, type Backup } from '../lib/backupFormat';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

export const SCHEMA_VERSION = 10;

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
  if (version < 6) {
    // v6: journal entries (intentions, reflections, weekly reviews, notes to future me).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('intention','reflection','weekly','note')),
        date TEXT NOT NULL,
        habit_id INTEGER REFERENCES habits(id) ON DELETE SET NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS entries_by_date ON entries (date);
    `);
  }
  if (version < 7) {
    // v7: the Journal becomes one free-form page per day. Anything written in v6's structured
    // entries is folded into that day's page (intention first, so it stays the first line).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pages (
        date TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const hasEntries = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'entries'",
    );
    if (hasEntries?.n) {
      const rows = await db.getAllAsync<{ type: string; date: string; data: string }>(
        `SELECT type, date, data FROM entries
         ORDER BY date, CASE type WHEN 'intention' THEN 0 WHEN 'reflection' THEN 1 WHEN 'weekly' THEN 2 ELSE 3 END, id`,
      );
      const byDate = new Map<string, string[]>();
      for (const r of rows) {
        const lines = entryToLines(r.type, r.data);
        if (!lines.length) continue;
        if (!byDate.has(r.date)) byDate.set(r.date, []);
        byDate.get(r.date)!.push(...lines);
      }
      const now = new Date().toISOString();
      await db.withTransactionAsync(async () => {
        for (const [date, lines] of byDate) {
          await db.runAsync(
            'INSERT OR IGNORE INTO pages (date, text, updated_at) VALUES (?, ?, ?)',
            date,
            lines.join('\n'),
            now,
          );
        }
        await db.execAsync('DROP TABLE entries;');
      });
    }
  }
  if (version < 8) {
    // v8: per-item "Get ready" countdown length.
    await db.execAsync(`ALTER TABLE habits ADD COLUMN ready_minutes INTEGER NOT NULL DEFAULT 3;`);
  }
  if (version < 9) {
    // v9: logged activities (unit + soft weekly target) and the weekly intention.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE habits ADD COLUMN unit TEXT;
        ALTER TABLE habits ADD COLUMN target_min INTEGER;
        ALTER TABLE habits ADD COLUMN target_max INTEGER;
        CREATE TABLE IF NOT EXISTS weeks (
          week_start TEXT PRIMARY KEY,
          intention TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    });
  }
  if (version >= 1 && version < 10) {
    // v10: Today is grouped by anchors instead of Morning / Evening. Untimed daily habits that
    // were in Morning go under the first anchor before noon; Evening ones become "Anytime".
    // The section column stays (SQLite can't drop it easily) but is no longer read.
    await db.runAsync(
      `UPDATE habits SET stack_after = (
          SELECT a.id FROM habits a WHERE a.kind = 'anchor' AND a.scheduled_time IS NOT NULL AND a.scheduled_time < '12:00'
          ORDER BY a.scheduled_time, a.id LIMIT 1)
       WHERE kind = 'habit' AND section = 'morning' AND stack_after IS NULL AND scheduled_time IS NULL
         AND json_extract(frequency, '$.type') IN ('daily', 'specific_days')`,
    );
  }
  if (version === 0) {
    // Brand-new install: start with a few editable anchors.
    const now = new Date().toISOString();
    for (const [i, a] of defaultAnchors().entries()) {
      await db.runAsync(
        `INSERT INTO habits (kind, name, section, frequency, sort_order, scheduled_time, end_time, ready_minutes, created_at)
         VALUES ('anchor', ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.name,
        legacySection(a),
        JSON.stringify(a.frequency),
        i,
        a.scheduled_time,
        a.end_time,
        a.ready_minutes,
        now,
      );
    }
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
  ready_minutes: number;
  unit: string | null;
  target_min: number | null;
  target_max: number | null;
  ladder: string | null;
  ladder_index: number;
  pair_with: string | null;
  plan_when: string | null;
  plan_action: string | null;
  obstacle: string | null;
  name: string;
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
    kind: r.kind === 'anchor' || r.kind === 'activity' ? r.kind : 'habit',
    unit: r.unit === 'mi' || r.unit === 'min' ? r.unit : null,
    target_min: r.target_min ?? null,
    target_max: r.target_max ?? null,
    name: r.name,
    why: r.why,
    minimum_version: r.minimum_version,
    messages: parseMessages(r.messages),
    habit_kind: r.habit_kind === 'avoid' ? 'avoid' : 'want',
    session_minutes: r.session_minutes || 15,
    ready_minutes: r.ready_minutes || 3,
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
  const rows = await db.getAllAsync<HabitRow>('SELECT * FROM habits ORDER BY sort_order, id');
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
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM habits');
  const res = await db.runAsync(
    `INSERT INTO habits (kind, name, section, why, minimum_version, frequency, sort_order, stack_after,
       scheduled_time, end_time, reminder, remind_before, meta, messages,
       habit_kind, session_minutes, ladder, ladder_index, pair_with, plan_when, plan_action, obstacle, ready_minutes,
       unit, target_min, target_max, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.kind,
    input.name,
    legacySection(input),
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
    input.ready_minutes,
    input.unit,
    input.target_min,
    input.target_max,
    new Date().toISOString(),
  );
  return res.lastInsertRowId;
}

export async function updateHabit(id: number, input: HabitInput): Promise<void> {
  const db = await getDb();
  const params: (string | number | null)[] = [
    input.name,
    legacySection(input),
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
    input.ready_minutes,
    input.unit,
    input.target_min,
    input.target_max,
  ];
  params.push(id);
  await db.runAsync(
    `UPDATE habits SET name = ?, section = ?, why = ?, minimum_version = ?, frequency = ?, stack_after = ?,
       scheduled_time = ?, end_time = ?, reminder = ?, remind_before = ?, meta = ?, messages = ?,
       habit_kind = ?, session_minutes = ?, ladder = ?, ladder_index = ?, pair_with = ?,
       plan_when = ?, plan_action = ?, obstacle = ?, ready_minutes = ?,
       unit = ?, target_min = ?, target_max = ?
     WHERE id = ?`,
    ...params,
  );
}

/** The old section column is NOT NULL with a CHECK, so keep writing a valid (unused) value. */
function legacySection(h: Pick<HabitInput, 'frequency'>): 'morning' | 'week' {
  return h.frequency.type === 'weekly_count' || h.frequency.type === 'every_n_days' ? 'week' : 'morning';
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

// --- Journal ------------------------------------------------------------------------------

export async function loadPages(): Promise<JournalPage[]> {
  const db = await getDb();
  return db.getAllAsync<JournalPage>('SELECT date, text, updated_at FROM pages ORDER BY date DESC');
}

/** Write a day's page; an empty page is removed so it doesn't appear in the date wheel. */
export async function savePage(date: string, text: string): Promise<void> {
  const db = await getDb();
  if (!text.trim()) {
    await db.runAsync('DELETE FROM pages WHERE date = ?', date);
    return;
  }
  await db.runAsync(
    `INSERT INTO pages (date, text, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    date,
    text,
    new Date().toISOString(),
  );
}

// --- Backup ---------------------------------------------------------------------------------

export { validateBackup, type Backup } from '../lib/backupFormat';

async function userTables(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((r) => r.name);
}

/** Everything in the database, as plain JSON. */
export async function exportAll(): Promise<Backup> {
  const db = await getDb();
  const tables: Backup['tables'] = {};
  for (const t of await userTables(db))
    tables[t] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${t}"`);
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

/**
 * Replace everything with the backup, in one transaction. Columns are matched by name, so a
 * backup from an older version restores into the current schema (new columns take defaults).
 * Returns row counts per table.
 */
export async function importAll(backup: Backup): Promise<Record<string, number>> {
  const db = await getDb();
  const tables = await userTables(db);
  // Parents before children (records reference habits).
  const order = [...tables].sort((a, b) => Number(a !== 'habits') - Number(b !== 'habits'));
  const counts: Record<string, number> = {};
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const t of [...order].reverse()) await tx.runAsync(`DELETE FROM "${t}"`);
      for (const t of order) {
        const rows = backup.tables[t];
        if (!Array.isArray(rows)) continue;
        const cols = (await tx.getAllAsync<{ name: string }>(`PRAGMA table_info("${t}")`)).map((c) => c.name);
        let n = 0;
        for (const row of rows) {
          const keys = cols.filter((c) => c in row);
          if (!keys.length) continue;
          await tx.runAsync(
            `INSERT INTO "${t}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
            ...keys.map((k) => row[k] as SQLite.SQLiteBindValue),
          );
          n++;
        }
        counts[t] = n;
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
  return counts;
}

// --- Weekly intention ------------------------------------------------------------------------

export async function loadWeeks(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ week_start: string; intention: string }>(
    'SELECT week_start, intention FROM weeks',
  );
  return Object.fromEntries(rows.map((r) => [r.week_start, r.intention]));
}

/** One line per week (keyed by its Monday); empty removes it. */
export async function saveWeek(weekStart: string, intention: string): Promise<void> {
  const db = await getDb();
  if (!intention.trim()) {
    await db.runAsync('DELETE FROM weeks WHERE week_start = ?', weekStart);
    return;
  }
  await db.runAsync(
    `INSERT INTO weeks (week_start, intention, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (week_start) DO UPDATE SET intention = excluded.intention, updated_at = excluded.updated_at`,
    weekStart,
    intention.trim(),
    new Date().toISOString(),
  );
}

/** Replace a record's meta (an activity log's amount). */
export async function setRecordMeta(habitId: number, date: string, meta: Meta | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE records SET meta = ? WHERE habit_id = ? AND date = ?',
    meta ? JSON.stringify(meta) : null,
    habitId,
    date,
  );
}
