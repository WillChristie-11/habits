import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { cancelTimerEnd, scheduleTimerEnd } from '../lib/notifications';

/**
 * A timer kept as its end time (saved in the store), not a running count, so it stays right if
 * the app is backgrounded or even closed, and a local notification fires when it ends.
 *
 * `key` names the timer (one per key). If a saved end time exists, it's picked up again;
 * otherwise nothing runs until start(). `alert` is the notification shown at the end.
 */
export function useEndTime(key: string, alert: { title: string; body: string } | null) {
  const { settings, setTimerEnd } = useStore();
  // The store is the single source: it's saved, so a reopened app picks the timer up again.
  const endsAt = settings.timers[key] ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const start = useCallback(
    (durationMs: number) => {
      const end = Date.now() + durationMs;
      setNow(Date.now());
      setTimerEnd(key, end);
      if (alert) scheduleTimerEnd(key, new Date(end), alert.title, alert.body);
      return end;
    },
    [key, alert, setTimerEnd],
  );

  const clear = useCallback(() => {
    setTimerEnd(key, null);
    cancelTimerEnd(key);
  }, [key, setTimerEnd]);

  const remaining = endsAt == null ? null : Math.max(0, endsAt - now);
  return { endsAt, remaining, ended: remaining === 0, now, start, clear };
}
