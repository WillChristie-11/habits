import { useEffect } from 'react';
import { router } from 'expo-router';
import { useStore } from '../store';
import { notLanding } from '../lib/nudges';

// Once per launch: the Not landing screen shows the first time it's needed.
let shownFor: number | null = null;

/** On open, if a habit's nudges stopped after 3 ignored in a row, ask what to change. */
export function NotLandingWatcher() {
  const { ready, habits, nudgeLog, idx, ctx } = useStore();
  const first = ready ? notLanding(habits, nudgeLog, idx, new Date(), ctx.today)[0] : undefined;
  useEffect(() => {
    if (!first || shownFor === first.id) return;
    shownFor = first.id;
    const t = setTimeout(() => router.push({ pathname: '/notlanding', params: { habitId: String(first.id) } }), 800);
    return () => clearTimeout(t);
  }, [first]);
  return null;
}
