import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { planNotifications } from '../lib/reminders';
import { noteFor } from '../lib/journal';
import { initNotifications, listenForResponses, requestPermission, syncNotifications, type ItemResponse } from '../lib/notifications';

const SYNC_DEBOUNCE_MS = 400;

/**
 * Keeps scheduled notifications in step with the data (today + tomorrow only, so we stay
 * under iOS's 64-pending cap), and applies Done / Later / Skip from notification buttons.
 * Re-plans on app open, on any check-off or edit, and on settings changes.
 */
export function NotificationBridge() {
  const store = useStore();
  const { habits, records, entries, idx, ctx, settings, updateEntry } = store;
  const [foregroundTick, setForegroundTick] = useState(0);

  // Latest store for the response listener, which is registered once.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  // Response handling (registered once).
  useEffect(() => {
    initNotifications();
    const handled = new Set<string>(storeRef.current.settings.handledResponses);
    const apply = async (r: ItemResponse) => {
      if (handled.has(r.key)) return;
      handled.add(r.key);
      const s = storeRef.current;
      await s.updateSettings({ handledResponses: [...handled].slice(-40) });
      // Tapping the evening nudge opens the Journal, where today's reflection is offered.
      if (r.action === 'open' && r.type === 'evening') {
        router.push('/journal');
        return;
      }
      if (r.habitId == null || !r.date) return;
      if (!s.habits.some((h) => h.id === r.habitId)) return;
      if (r.action === 'done') await s.mark(r.habitId, 'done', r.date);
      else if (r.action === 'skip') await s.mark(r.habitId, 'skipped', r.date);
      else if (r.action === 'later') await s.snooze(r.habitId, r.date);
      else if (r.action === 'start') {
        // Opens the app on the timer; the timer records the start.
        router.push({ pathname: '/timer', params: { habitId: String(r.habitId), date: r.date } });
      }
    };
    return listenForResponses((r) => {
      apply(r);
    });
  }, []);

  // Re-plan when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && setForegroundTick((t) => t + 1));
    return () => sub.remove();
  }, []);

  // Ask for permission once there's something to remind about.
  const wantsReminders =
    habits.length > 0 &&
    (settings.reminders.morningEnabled || settings.reminders.eveningEnabled || habits.some((h) => h.reminder));
  useEffect(() => {
    if (wantsReminders) requestPermission();
  }, [wantsReminders]);

  // A note to future me is delivered once: mark it on the first day its trigger fires.
  useEffect(() => {
    for (const h of habits) {
      const n = noteFor(h, entries, idx, ctx);
      if (n && !n.data.triggeredOn) updateEntry(n.id, { ...n.data, triggeredOn: ctx.today });
    }
  }, [habits, entries, idx, ctx, updateEntry]);

  // Debounced re-plan + reschedule.
  useEffect(() => {
    const t = setTimeout(() => {
      syncNotifications(planNotifications(habits, idx, ctx, settings.reminders, new Date(), entries));
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [habits, records, entries, idx, ctx, settings.reminders, foregroundTick]);

  return null;
}
