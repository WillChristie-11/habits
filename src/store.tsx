import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { AppearanceContext, DEFAULT_APPEARANCE, type Appearance } from './theme';
import * as db from './db/db';
import { indexRecords, type Ctx, type RecordIndex } from './lib/schedule';
import { todayKey } from './lib/dates';
import type { DayRecord, Habit, HabitInput, RecordStatus } from './types';

export interface Settings {
  feelingAutoDismiss: boolean;
  appearance: Appearance;
}

const DEFAULT_SETTINGS: Settings = {
  feelingAutoDismiss: true,
  appearance: DEFAULT_APPEARANCE,
};

interface Store {
  ready: boolean;
  habits: Habit[];
  records: DayRecord[];
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    const [h, r] = await Promise.all([db.loadHabits(), db.loadRecords()]);
    setHabits(h);
    setRecords(r);
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
    }),
    [ready, habits, records, idx, ctx, settings, now, today, reload],
  );

  return (
    <StoreContext.Provider value={store}>
      <AppearanceContext.Provider value={settings.appearance}>{children}</AppearanceContext.Provider>
    </StoreContext.Provider>
  );
}
