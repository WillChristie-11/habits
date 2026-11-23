import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';

/** Back after this long away shows the Now page again. */
const AWAY_MS = 5 * 60_000;

/**
 * Opens the Now page when the app starts and when it returns from the background after more
 * than 5 minutes (Settings → Opening screen turns it off). Not over a running timer.
 */
export function NowGate() {
  const store = useStore();
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });
  const shown = useRef(false);

  useEffect(() => {
    if (!store.ready || shown.current) return;
    shown.current = true;
    if (store.settings.nowPage && !store.settings.activeTimer) router.push('/now');
  }, [store.ready, store.settings.nowPage, store.settings.activeTimer]);

  useEffect(() => {
    let awaySince: number | null = null;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') awaySince = Date.now();
      if (st !== 'active' || awaySince == null) return;
      const away = Date.now() - awaySince;
      awaySince = null;
      const s = latest.current.settings;
      if (away > AWAY_MS && s.nowPage && !s.activeTimer) router.push('/now');
    });
    return () => sub.remove();
  }, []);
  return null;
}
