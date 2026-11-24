import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { todayKey } from '../lib/dates';

/**
 * Shows the Now page on the first open of each day (a fresh launch, or the first return on a new
 * day), over Today. Never on later returns the same day, never over a running timer, and never
 * over Schedule, Timers or Journal: it goes to Today first. Settings -> Opening screen turns it
 * off. Otherwise Now opens from Today (tap the ring, or pull down past the top).
 */
export function NowGate() {
  const store = useStore();
  const latest = useRef(store);
  useEffect(() => {
    latest.current = store;
  });

  useEffect(() => {
    if (!store.ready) return;
    const maybeShow = () => {
      const { settings, updateSettings } = latest.current;
      const today = todayKey(new Date());
      if (!settings.nowPage || settings.nowShownOn === today || settings.activeTimer) return;
      updateSettings({ nowShownOn: today });
      if (router.canDismiss()) router.dismissAll();
      router.navigate('/');
      setTimeout(() => router.push('/now'), 50);
    };
    maybeShow();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && maybeShow());
    return () => sub.remove();
  }, [store.ready]);
  return null;
}
