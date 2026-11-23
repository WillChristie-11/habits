import { useCallback } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { habitTimerButtons } from '../lib/timers';
import type { Habit } from '../types';
import { useTimerStart } from './useTimerStart';

/**
 * Start one of a habit's two timers (0: the main one, 1: the second). Focus for an avoid habit
 * goes through "How heavy does this feel?" first, which then starts the round.
 */
export function useHabitTimer() {
  const { ctx } = useStore();
  const timerStart = useTimerStart();
  return useCallback(
    (h: Habit, which: 0 | 1 = 0, opts: { replace?: boolean; force?: boolean } = {}) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const b = habitTimerButtons(h)[which];
      const avoid = h.kind === 'habit' && h.habit_kind === 'avoid';
      if (avoid && b.kind === 'focus') {
        const to = { pathname: '/weigh' as const, params: { habitId: String(h.id), date: ctx.today } };
        if (opts.replace) router.replace(to);
        else router.push(to);
        return;
      }
      timerStart(b.kind, b.minutes, h.id, { clearHead: b.clearHead, ...opts });
    },
    [ctx.today, timerStart],
  );
}
