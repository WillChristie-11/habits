import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { AppearanceContext, DEFAULT_APPEARANCE, type Appearance } from './theme';
import * as db from './db/db';
import { indexRecords, type Ctx, type RecordIndex } from './lib/schedule';
import { todayKey } from './lib/dates';
import type { DayRecord, EntryType, Habit, HabitInput, JournalEntry, RecordStatus, ReminderSettings } from './types';
import { DEFAULT_REMINDERS } from './types';
import { SNOOZE_MIN } from './lib/reminders';

export interface Settings {
  feelingAutoDismiss: boolean;
  appearance: Appearance;
  reminders: ReminderSettings;
  /** notification taps already applied (so a replayed response isn't applied twice) */
  handledResponses: string[];
  /** day the morning-intention prompt was last shown (answered or skipped) */
  intentionAskedOn: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  feelingAutoDismiss: true,
  appearance: DEFAULT_APPEARANCE,
  reminders: DEFAULT_REMINDERS,
  handledResponses: [],
  intentionAskedOn: null,
};

interface Store {
  ready: boolean;
  habits: Habit[];
  records: DayRecord[];
  entries: JournalEntry[];
  idx: RecordIndex;
  ctx: Ctx;
  settings: Settings;
  now: Date;
  addHabit(input: HabitInput): Promise<void>;
  editHabit(id: number, input: HabitInput): Promise<void>;
  removeHabit(id: number): Promise<void>;
  reorder(ids: number[]): Promise<void>;
  mark(habitId: number, status: RecordStatus, date?: string): Promise<void>;
  unmark(habitId: number, date?: string): Promise<void>;
  rateFeeling(habitId: number, feeling: number | null, date?: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateReminders(patch: Partial<ReminderSettings>): Promise<void>;
  /**
   * Begin a timed session. Avoid habits count as done the moment a session starts, so the
   * record is written now (with the session in its meta).
   */
  startSession(h: Habit, date?: string): Promise<void>;
  /** Finish a session: want habits are marked done now. */
  finishSession(h: Habit, date?: string): Promise<void>;
  advanceLadder(h: Habit): Promise<void>;
  /** "Later": remind again in 30 min */
  snooze(habitId: number, date: string): Promise<void>;
  dismissMorning(): Promise<void>;
  saveEntry(type: EntryType, date: string, data: Record<string, string>, habitId?: number | null): Promise<void>;
  deleteEntry(id: number): Promise<void>;
  updateEntry(id: number, data: Record<string, string>): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    const [h, r, e] = await Promise.all([db.loadHabits(), db.loadRecords(), db.loadEntries()]);
    setHabits(h);
    setRecords(r);
    setEntries(e);
  }, []);

  useEffect(() => {
    (async () => {
      const raw = await db.loadSettings();
      const s = { ...DEFAULT_SETTINGS };
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        if (raw[k] != null) {
          try {
            const v = JSON.parse(raw[k]);
            // Merge objects so settings added later get their defaults.
            (s as any)[k] =
              v && typeof v === 'object' && !Array.isArray(v) ? { ...(DEFAULT_SETTINGS as any)[k], ...v } : v;
          } catch {}
        }
      }
      setSettings(s);
      await reload();
      setReady(true);
    })();
  }, [reload]);

  // Keep "now" fresh so the date rolls over at midnight and banners update.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && setNow(new Date()));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);

  const today = todayKey(now);
  const ctx = useMemo<Ctx>(() => ({ today }), [today]);
  const idx = useMemo(() => indexRecords(records), [records]);

  const store = useMemo<Store>(
    () => ({
      ready,
      habits,
      records,
      entries,
      idx,
      ctx,
      settings,
      now,
      async addHabit(input) {
        await db.createHabit(input);
        await reload();
      },
      async editHabit(id, input) {
        await db.updateHabit(id, input);
        await reload();
      },
      async removeHabit(id) {
        await db.deleteHabit(id);
        await reload();
      },
      async reorder(ids) {
        // Optimistic: update order locally so the drop doesn't flicker.
        setHabits((prev) => prev.map((h) => (ids.includes(h.id) ? { ...h, order: ids.indexOf(h.id) } : h)));
        await db.reorderHabits(ids);
        await reload();
      },
      async mark(habitId, status, date = today) {
        await db.setRecord(habitId, date, status);
        await reload();
      },
      async unmark(habitId, date = today) {
        await db.clearRecord(habitId, date);
        await reload();
      },
      async rateFeeling(habitId, feeling, date = today) {
        await db.setFeeling(habitId, date, feeling);
        await reload();
      },
      async updateSettings(patch) {
        setSettings((s) => ({ ...s, ...patch }));
        await Promise.all(Object.entries(patch).map(([k, v]) => db.saveSetting(k, JSON.stringify(v))));
      },
      async updateReminders(patch) {
        const next = { ...settings.reminders, ...patch };
        setSettings((s) => ({ ...s, reminders: next }));
        await db.saveSetting('reminders', JSON.stringify(next));
      },
      async startSession(h, date = today) {
        if (h.kind !== 'habit' || h.habit_kind !== 'avoid') return;
        const step = h.ladder[h.ladder_index] ?? null;
        await db.setRecord(h.id, date, 'done', null, {
          session: { startedAt: new Date().toISOString(), minutes: h.session_minutes, step },
        });
        await reload();
      },
      async finishSession(h, date = today) {
        if (h.habit_kind === 'avoid') return; // already done at start
        const existing = records.find((r) => r.habit_id === h.id && r.date === date);
        if (existing?.status === 'done') return;
        await db.setRecord(h.id, date, 'done', null, {
          session: { finishedAt: new Date().toISOString(), minutes: h.session_minutes },
        });
        await reload();
      },
      async advanceLadder(h) {
        await db.setLadderIndex(h.id, Math.min(h.ladder.length, h.ladder_index + 1));
        await reload();
      },
      async snooze(habitId, date) {
        const nowMs = Date.now();
        const snoozes = [
          ...settings.reminders.snoozes.filter((x) => new Date(x.at).getTime() > nowMs && x.habitId !== habitId),
          { habitId, date, at: new Date(nowMs + SNOOZE_MIN * 60_000).toISOString() },
        ];
        const next = { ...settings.reminders, snoozes };
        setSettings((s) => ({ ...s, reminders: next }));
        await db.saveSetting('reminders', JSON.stringify(next));
      },
      async saveEntry(type, date, data, habitId = null) {
        await db.saveEntry(type, date, data, habitId);
        setEntries(await db.loadEntries());
      },
      async updateEntry(id, data) {
        await db.updateEntry(id, data);
        setEntries(await db.loadEntries());
      },
      async deleteEntry(id) {
        await db.deleteEntry(id);
        setEntries(await db.loadEntries());
      },
      async dismissMorning() {
        const next = { ...settings.reminders, morningDismissedOn: today };
        setSettings((s) => ({ ...s, reminders: next }));
        await db.saveSetting('reminders', JSON.stringify(next));
      },
    }),
    [ready, habits, records, entries, idx, ctx, settings, now, today, reload],
  );

  return (
    <StoreContext.Provider value={store}>
      <AppearanceContext.Provider value={settings.appearance}>{children}</AppearanceContext.Provider>
    </StoreContext.Provider>
  );
}
