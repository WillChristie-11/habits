import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { cancelTimerEnd } from '../lib/notifications';
import { timerName, type TimerKind } from '../lib/timers';

export interface TimerStartOptions {
  /** Clear head: Meditate for a habit that doesn't check it off, then offers Focus. */
  clearHead?: boolean;
  /** "How heavy does this feel?" (avoid habits), saved with the session. */
  dread?: number | null;
  /** Replace the current screen (from Weigh it, or one timer handing over to the next). */
  replace?: boolean;
  /** The running timer was already ended by the caller. */
  force?: boolean;
}

/**
 * Start Focus or Meditate (optionally for a habit). One timer at a time: if another is running,
 * asks "End the Focus timer?" first. Remembers the kind and length for hold-to-restart; lengths
 * picked on the Timers tab become its defaults (starts from a habit leave those alone).
 */
export function useTimerStart() {
  const { settings, updateSettings, setTimerEnd } = useStore();
  return useCallback(
    (kind: TimerKind, minutes: number, habitId: number | null = null, opts: TimerStartOptions = {}) => {
      const go = () => {
        updateSettings(
          habitId == null
            ? { lastTimer: { kind, minutes }, timerPrefs: { ...settings.timerPrefs, [kind]: minutes } }
            : { lastTimer: { kind, minutes } },
        );
        router[opts.replace ? 'replace' : 'push']({
          pathname: kind === 'focus' ? '/focus' : '/meditate',
          params: {
            startId: String(Date.now()),
            minutes: String(minutes),
            ...(habitId != null ? { habitId: String(habitId) } : {}),
            ...(opts.clearHead ? { clear: '1' } : {}),
            ...(opts.dread != null ? { dread: String(opts.dread) } : {}),
          },
        });
      };
      const running = settings.activeTimer;
      if (!running || opts.force) return go();
      Alert.alert(`End the ${timerName(running.kind)} timer?`, undefined, [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'End it',
          style: 'destructive',
          onPress: () => {
            setTimerEnd(running.kind, null);
            cancelTimerEnd(running.kind);
            updateSettings({ activeTimer: null });
            go();
          },
        },
      ]);
    },
    [settings.activeTimer, settings.timerPrefs, updateSettings, setTimerEnd],
  );
}
