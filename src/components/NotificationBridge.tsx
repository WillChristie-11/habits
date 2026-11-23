import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { planNotifications } from '../lib/reminders';
import { windDownAnchor } from '../lib/dayClose';
import { REASON_REPLY, type Frame } from '../lib/nudges';
import {
  initNotifications,
  listenForResponses,
  notifyNow,
  requestPermission,
  syncNotifications,
  type ItemResponse,
} from '../lib/notifications';

const SYNC_DEBOUNCE_MS = 400;

/**
 * Keeps scheduled notifications in step with the data (today + tomorrow only, so we stay
 * under iOS's 64-pending cap), and applies Done / Later / Skip from notification buttons.
 * Re-plans on app open, on any check-off or edit, and on settings changes.
 */
export function NotificationBridge() {
  const store = useStore();
  const { habits, records, idx, ctx, settings, dayCloses, notToday, weeks } = store;
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
      // Focus / Meditate end: open the running timer (Focus buttons: Break · Keep going · Done).
      if ((r.type === 'timer' || r.type === 'timer-quiet') && (r.timerKey === 'focus' || r.timerKey === 'meditate')) {
        router.push({ pathname: `/${r.timerKey}`, params: r.focusAction ? { action: r.focusAction } : {} });
        return;
      }
      // Cut-back follow-up: 1–5 and a note straight from the notification; a tap opens Tempted?.
      if (r.type === 'follow' && r.occurrenceId != null) {
        if (r.action === 'feel') await s.rateOccurrence(r.occurrenceId, { feeling: r.feeling });
        else if (r.action === 'note') await s.rateOccurrence(r.occurrenceId, { note: r.text });
        else router.push({ pathname: '/tempted', params: { occ: String(r.occurrenceId) } });
        return;
      }
      // Close the day?: Close (or a tap) opens the sheet; Not tonight does nothing.
      if (r.type === 'close') {
        if (r.action !== 'skip') router.push({ pathname: '/close', params: r.date ? { date: r.date } : {} });
        return;
      }
      // Any tap or button on a nudge means it landed.
      if (r.id.startsWith('nudge-')) await s.markNudge(r.id, r.action);
      if (r.habitId == null || !r.date) return;
      const habit = s.habits.find((h) => h.id === r.habitId);
      if (!habit) return;
      // Name it's reason buttons: save the Not today reason, then a short reply that fits it.
      if (r.action === 'reason' && r.reason && r.reason in REASON_REPLY) {
        await s.passToday(habit, r.date, r.reason);
        const reply = REASON_REPLY[r.reason as keyof typeof REASON_REPLY];
        await notifyNow(`reason-${r.habitId}-${r.date}`, reply.title, reply.body);
        return;
      }
      if (r.action === 'done') await s.mark(r.habitId, 'done', r.date);
      else if (r.action === 'skip') await s.mark(r.habitId, 'skipped', r.date);
      else if (r.action === 'later') await s.snooze(r.habitId, r.date);
      else if (r.action === 'start') {
        // Focus 25: opens "How heavy does this feel?" (avoid habits), which starts the round.
        router.push({ pathname: '/weigh', params: { habitId: String(r.habitId), date: r.date } });
      }
    };
    return listenForResponses((r) => {
      apply(r);
    });
  }, []);

  // Re-plan when the app comes back to the foreground.
  useEffect(() => {
    // Remember when the app is opened (to the half hour): Not landing offers those times.
    const opened = () => {
      const d = new Date();
      const hm = `${String(d.getHours()).padStart(2, '0')}:${d.getMinutes() < 30 ? '00' : '30'}`;
      const s = storeRef.current;
      s.updateSettings({ appOpens: [...s.settings.appOpens, hm].slice(-40) });
    };
    opened();
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      setForegroundTick((t) => t + 1);
      opened();
    });
    return () => sub.remove();
  }, []);

  // Ask for permission once there's something to remind about.
  const wantsReminders =
    habits.length > 0 &&
    (settings.reminders.morningEnabled || settings.reminders.eveningEnabled || habits.some((h) => h.reminder));
  useEffect(() => {
    if (wantsReminders) requestPermission();
  }, [wantsReminders]);

  // Debounced re-plan + reschedule.
  useEffect(() => {
    const t = setTimeout(() => {
      const close = {
        windDown: windDownAnchor(habits)?.scheduled_time ?? null,
        closed: dayCloses.map((c) => c.date),
        better: Object.fromEntries(dayCloses.filter((c) => c.better).map((c) => [c.date, c.better as string])),
      };
      // The nudge log is read through the ref: writing it must not start another re-plan.
      const s = storeRef.current;
      const nudges = { log: s.nudgeLog, notToday, weeks, horizon: null };
      const plan = planNotifications(habits, idx, ctx, settings.reminders, new Date(), close, nudges);
      syncNotifications(plan);
      s.syncNudgeLog(
        plan
          .filter((p) => p.data.type === 'nudge')
          .map((p) => ({
            id: p.id,
            habitId: p.data.habitId as number,
            date: p.data.date,
            at: p.at,
            frame: p.data.frame as Frame,
            title: p.title,
            body: p.body,
            category: p.category ?? '',
          })),
      );
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [habits, records, idx, ctx, settings.reminders, dayCloses, notToday, weeks, foregroundTick]);

  return null;
}
