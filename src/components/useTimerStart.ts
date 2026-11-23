import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { cancelTimerEnd } from '../lib/notifications';
import { timerName, type TimerKind } from '../lib/timers';

/**
 * Start Focus or Meditate (optionally for a linked habit). One timer at a time: if another is
 * running, asks "End the Focus timer?" first. Remembers the kind and length for hold-to-restart.
 */
export function useTimerStart() {
  const { settings, updateSettings, setTimerEnd } = useStore();
  return useCallback(
    (kind: TimerKind, minutes: number, habitId: number | null = null) => {
      const go = () => {
        updateSettings({
          lastTimer: { kind, minutes },
          timerPrefs: { ...settings.timerPrefs, [kind]: minutes },
        });
        router.push({
          pathname: kind === 'focus' ? '/focus' : '/meditate',
          params: {
            startId: String(Date.now()),
            minutes: String(minutes),
            ...(habitId != null ? { habitId: String(habitId) } : {}),
          },
        });
      };
      const running = settings.activeTimer;
      if (!running) return go();
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
