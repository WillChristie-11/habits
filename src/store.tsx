import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { AppearanceContext, DEFAULT_APPEARANCE, type Appearance } from './theme';
import * as db from './db/db';
import { indexRecords, type Ctx, type RecordIndex } from './lib/schedule';
import { todayKey } from './lib/dates';
import type { DayRecord, Habit, HabitInput, Meta, Occurrence, Priority, RecordStatus, ReminderSettings } from './types';
import { DEFAULT_REMINDERS } from './types';
import { SNOOZE_MIN } from './lib/reminders';

export interface Settings {
  feelingAutoDismiss: boolean;
  appearance: Appearance;
  reminders: ReminderSettings;
  /** notification taps already applied (so a replayed response isn't applied twice) */
  handledResponses: string[];
  /** Running timers' end times (ms since epoch) by key, so they survive the app being closed. */
  timers: Record<string, number>;
}

const DEFAULT_SETTINGS: Settings = {
  feelingAutoDismiss: true,
  appearance: DEFAULT_APPEARANCE,
  reminders: DEFAULT_REMINDERS,
  handledResponses: [],
  timers: {},
};

/**
 * The card after a check-off, a finished session or a skip: a 1–5 feeling (habits) and/or a
 * one-line "what did you do?" (items with ask_note). Lives in the store so the timer screen can
 * raise it on the screen underneath.
 */
export interface AfterPrompt {
  habitId: number;
  date: string;
  feelings: boolean;
  note: boolean;
  /** 'skip' asks how the day feels rather than how the habit felt */
  reason: 'done' | 'skip';
}

interface Store {
  ready: boolean;
  /** Today's priorities (all of them; see lib/priorities for what a day shows). */
  priorities: Priority[];
  addPriority(text: string): Promise<void>;
  togglePriority(p: Priority): Promise<void>;
  removePriority(id: number): Promise<void>;
  /** Save (or clear, with null) a timer's end time. */
  setTimerEnd(key: string, endsAt: number | null): void;
  /** Cut-back logs, oldest first. */
  occurrences: Occurrence[];
  /** Log a cut-back occurrence now; returns its id. */
  logOccurrence(h: Habit): Promise<number>;
  rateOccurrence(id: number, patch: { feeling?: number | null; note?: string | null }): Promise<void>;
  removeOccurrence(id: number): Promise<void>;
  afterPrompt: AfterPrompt | null;
  setAfterPrompt(p: AfterPrompt | null): void;
  /** Save a "what did you do?" line on a day's record. */
  setNote(habitId: number, date: string, text: string): Promise<void>;
  habits: Habit[];
  records: DayRecord[];
  /** Journal pages by date. */
  pages: Record<string, string>;
  /** Weekly intention by week start (Monday). */
  weeks: Record<string, string>;
  saveWeek(weekStart: string, intention: string): Promise<void>;
  /** Log an activity for a day (light haptic is the caller's). */
  logActivity(h: Habit, date: string): Promise<void>;
  /** Set or clear an activity log's amount. */
  setActivityAmount(h: Habit, date: string, amount: number | null): Promise<void>;
  idx: RecordIndex;
  ctx: Ctx;
  settings: Settings;
  now: Date;
  addHabit(input: HabitInput): Promise<void>;
  editHabit(id: number, input: HabitInput): Promise<void>;
  removeHabit(id: number): Promise<void>;
  reorder(ids: number[]): Promise<void>;
  mark(habitId: number, status: RecordStatus, date?: string, meta?: Meta | null): Promise<void>;
  unmark(habitId: number, date?: string): Promise<void>;
  rateFeeling(habitId: number, feeling: number | null, date?: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  /** Re-read everything from the database (after an import). */
  reloadAll(): Promise<void>;
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
  /** Updates the page in memory at once and writes it to the database. */
  savePage(date: string, text: string): Promise<void>;
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
  const [pages, setPages] = useState<Record<string, string>>({});
  const [weeks, setWeeks] = useState<Record<string, string>>({});
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [afterPrompt, setAfterPrompt] = useState<AfterPrompt | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    const [h, r, p, w, o, pr] = await Promise.all([
      db.loadHabits(),
      db.loadRecords(),
      db.loadPages(),
      db.loadWeeks(),
      db.loadOccurrences(),
      db.loadPriorities(),
    ]);
    setPriorities(pr);
    setHabits(h);
    setOccurrences(o);
    setRecords(r);
    setWeeks(w);
    setPages(Object.fromEntries(p.map((x) => [x.date, x.text])));
  }, []);

  const loadSettingsFromDb = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    (async () => {
      await loadSettingsFromDb();
      await reload();
      setReady(true);
    })();
  }, [reload, loadSettingsFromDb]);

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
      priorities,
      async addPriority(text) {
        if (!text.trim()) return;
        await db.addPriority(text.trim(), today);
        await reload();
      },
      async togglePriority(p) {
        await db.setPriorityDone(p.id, p.done_on ? null : today);
        await reload();
      },
      async removePriority(id) {
        await db.deletePriority(id);
        await reload();
      },
      setTimerEnd(key, endsAt) {
        setSettings((cur) => {
          const timers = { ...cur.timers };
          if (endsAt == null) delete timers[key];
          else timers[key] = endsAt;
          // Drop anything that ended more than a day ago.
          for (const k of Object.keys(timers)) if (timers[k] < Date.now() - 86_400_000) delete timers[k];
          db.saveSetting('timers', JSON.stringify(timers));
          return { ...cur, timers };
        });
      },
      occurrences,
      afterPrompt,
      setAfterPrompt,
      async logOccurrence(h) {
        const id = await db.addOccurrence(h.id, new Date().toISOString());
        await reload();
        return id;
      },
      async rateOccurrence(id, patch) {
        setOccurrences((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
        await db.updateOccurrence(id, patch);
      },
      async removeOccurrence(id) {
        await db.deleteOccurrence(id);
        await reload();
      },
      async setNote(habitId, date, text) {
        const existing = records.find((r) => r.habit_id === habitId && r.date === date);
        if (!existing) return;
        const meta = { ...(existing.meta ?? {}) };
        if (text.trim()) meta.note = text.trim();
        else delete meta.note;
        await db.setRecordMeta(habitId, date, meta);
        await reload();
      },
      habits,
      records,
      pages,
      weeks,
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
      async mark(habitId, status, date = today, meta = null) {
        await db.setRecord(habitId, date, status, null, meta);
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
      async reloadAll() {
        await loadSettingsFromDb();
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
      async saveWeek(weekStart, intention) {
        setWeeks((w) => {
          const next = { ...w };
          if (intention.trim()) next[weekStart] = intention.trim();
          else delete next[weekStart];
          return next;
        });
        await db.saveWeek(weekStart, intention);
      },
      async logActivity(h, date) {
        const existing = records.find((r) => r.habit_id === h.id && r.date === date);
        if (existing?.status === 'done') return; // already logged that day; the sheet edits it
        await db.setRecord(h.id, date, 'done', null, { type: h.name.toLowerCase(), amount: null, unit: h.unit });
        await reload();
      },
      async setActivityAmount(h, date, amount) {
        await db.setRecordMeta(h.id, date, { type: h.name.toLowerCase(), amount, unit: h.unit });
        await reload();
      },
      async savePage(date, text) {
        if ((pages[date] ?? '') === (text.trim() ? text : '')) return;
        setPages((p) => {
          const next = { ...p };
          if (text.trim()) next[date] = text;
          else delete next[date];
          return next;
        });
        await db.savePage(date, text);
      },
      async dismissMorning() {
        const next = { ...settings.reminders, morningDismissedOn: today };
        setSettings((s) => ({ ...s, reminders: next }));
        await db.saveSetting('reminders', JSON.stringify(next));
      },
    }),
    [
      ready,
      habits,
      records,
      pages,
      weeks,
      occurrences,
      priorities,
      afterPrompt,
      idx,
      ctx,
      settings,
      now,
      today,
      reload,
      loadSettingsFromDb,
    ],
  );

  return (
    <StoreContext.Provider value={store}>
      <AppearanceContext.Provider value={settings.appearance}>{children}</AppearanceContext.Provider>
    </StoreContext.Provider>
  );
}
