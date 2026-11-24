import { useStore } from '../store';
import { diffDays, todayKey } from '../lib/dates';

/** Gesture hints show for the first few days after install, then stay out of the way. */
export const HINT_DAYS = 3;

/** True during the first 3 days (install = when the first item, the starter anchors, was made). */
export function useShowHints(): boolean {
  const { habits, ctx } = useStore();
  const first = habits.reduce<string | null>((m, h) => {
    const d = todayKey(new Date(h.created_at));
    return m == null || d < m ? d : m;
  }, null);
  return first == null || diffDays(first, ctx.today) < HINT_DAYS;
}
