import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useStore, type ActiveTimer } from '../store';
import { stateOn } from '../lib/schedule';
import { DEFAULT_MINUTES, clock, meditateTint } from '../lib/timers';
import { useEndTime } from '../components/useEndTime';
import { TimerVideo } from '../components/TimerVideo';
import { FeelingPicker } from '../components/FeelingPicker';
import { useHabitTimer } from '../components/useHabitTimer';
import { timerColors } from '../theme';

const PEEK_MS = 3000;
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

/**
 * Meditate: the flower video fills the screen under a dark tint that lightens slowly (about 40% →
 * 15%). Only a close button and "Meditate · Tap anywhere to see time left"; a tap shows time left
 * for 3 s. Light haptic at the start, optional one halfway, three gentle ones at the end, when the
 * video slows and pauses. "10 minutes. Done." is notified only if the app is in the background.
 */
export function MeditateScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ startId?: string; minutes?: string; habitId?: string; clear?: string }>();
  const { settings, updateSettings, habits, idx, ctx, mark, rateFeeling } = useStore();
  const active = settings.activeTimer?.kind === 'meditate' ? settings.activeTimer : null;
  const timer = useEndTime('meditate', null);
  const [peek, setPeek] = useState(false);
  const [feeling, setFeeling] = useState(false);
  const habit = active?.habitId != null ? habits.find((h) => h.id === active.habitId) : undefined;
  // Clear head (Meditate before a habit's task): never checks it off; ends with "Ready? Focus on …".
  const clearHead = !!active?.clearHead;
  const habitTimer = useHabitTimer();

  // A new start; reopening resumes.
  const begun = useRef(false);
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    if (!params.startId || active?.startId === params.startId) return;
    const minutes = Number(params.minutes) || DEFAULT_MINUTES.meditate;
    const next: ActiveTimer = {
      kind: 'meditate',
      phase: 'focus',
      minutes,
      habitId: params.habitId ? Number(params.habitId) : null,
      line: '',
      startedAt: new Date().toISOString(),
      startId: params.startId,
      ...(params.clear ? { clearHead: true } : {}),
    };
    updateSettings({ activeTimer: next });
    timer.start(minutes * 60_000, { title: `${minutes} minutes. Done.`, body: 'Meditate', when: 'background' });
    light();
    // once, on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = (active?.minutes ?? DEFAULT_MINUTES.meditate) * 60_000;
  const left = timer.remaining ?? total;
  const ended = active?.phase === 'focusDone';

  // Optional halfway haptic (off by default).
  const halfway = useRef(false);
  useEffect(() => {
    if (!settings.timerPrefs.meditateHalfway || halfway.current || !active || ended) return;
    if (left <= total / 2 && left > 0) {
      halfway.current = true;
      light();
    }
  }, [left, total, active, ended, settings.timerPrefs.meditateHalfway]);

  // The end: three gentle haptics; a linked habit is checked off and asks how you feel.
  useEffect(() => {
    if (!active || active.phase !== 'focus' || !timer.ended) return;
    updateSettings({ activeTimer: { ...active, phase: 'focusDone' } });
    [0, 450, 900].forEach((ms) => setTimeout(light, ms));
    if (habit && !active.clearHead && stateOn(habit, idx, ctx.today, ctx) !== 'done')
      mark(habit.id, 'done', ctx.today).then(() => setFeeling(true));
    // on the end only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.ended, active?.phase]);

  useEffect(() => {
    if (!peek) return;
    const id = setTimeout(() => setPeek(false), PEEK_MS);
    return () => clearTimeout(id);
  }, [peek]);

  const end = () => {
    timer.clear();
    updateSettings({ activeTimer: null });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const close = () => {
    if (!active || ended || !habit || clearHead || stateOn(habit, idx, ctx.today, ctx) === 'done') return end();
    // Stopping early on a linked habit: it's your call whether it counts.
    Alert.alert('Count it anyway?', `${habit.name} for ${Math.max(1, Math.round((total - left) / 60_000))} min`, [
      { text: 'Not this time', style: 'cancel', onPress: end },
      { text: 'Count it', onPress: () => mark(habit.id, 'done', ctx.today).then(end) },
    ]);
  };

  // Clear head done: straight on to Focus for the habit (via the heavy question for avoid habits).
  const focusNow = () => {
    if (!habit) return end();
    timer.clear();
    updateSettings({ activeTimer: null });
    // A habit with Clear head has Focus as its main timer.
    habitTimer(habit, 0, { replace: true, force: true });
  };

  if (!active) {
    return (
      <View style={[s.screen, s.center]}>
        <StatusBar style="light" />
        <Text style={s.title}>No Meditate timer running.</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginTop: 16 }}>
          <Text style={s.hint}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const progress = ended ? 1 : 1 - left / total;
  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      {/* Tap anywhere (but the ✕) to see time left. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setPeek(true)}
        accessibilityLabel="Tap to see time left"
      >
        <TimerVideo kind="meditate" mode={ended ? 'slowStop' : 'play'} />
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: timerColors.tint, opacity: meditateTint(progress) }]}
        />
      </Pressable>
      <Pressable onPress={close} hitSlop={14} style={[s.close, { top: insets.top + 10 }]} accessibilityLabel="Close">
        <Text style={s.closeText}>✕</Text>
      </Pressable>
      {(peek || ended) && (
        <View style={s.peek} pointerEvents="none">
          <Text style={s.peekText}>{ended ? 'Done' : clock(left)}</Text>
        </View>
      )}
      {!(ended && clearHead && habit) && (
        <View style={[s.bottom, { paddingBottom: insets.bottom + 28 }]} pointerEvents="none">
          <Text style={s.title}>{clearHead ? 'Clear head' : 'Meditate'}</Text>
          <Text style={s.hint}>{ended ? 'Tap ✕ when you’re ready' : 'Tap anywhere to see time left'}</Text>
        </View>
      )}
      {ended && clearHead && habit && (
        <View style={[s.ready, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={s.readyTitle}>Ready? Focus on {habit.name}</Text>
          <Pressable onPress={focusNow} style={[s.readyBtn, s.readyPrimary]} accessibilityRole="button">
            <Text style={[s.readyText, s.readyPrimaryText]}>Focus · 25</Text>
          </Pressable>
          <Pressable onPress={end} style={s.readyBtn} accessibilityRole="button">
            <Text style={s.readyText}>Not now</Text>
          </Pressable>
        </View>
      )}
      {feeling && habit && (
        <FeelingPicker
          title={`How do you feel after ${habit.name}?`}
          feelings
          note={false}
          autoDismiss={settings.feelingAutoDismiss}
          onPick={(f) => rateFeeling(habit.id, f, ctx.today)}
          onNote={() => {}}
          onDismiss={() => setFeeling(false)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: timerColors.meditateShade },
  center: { alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: 18, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: timerColors.onVideo, fontSize: 22 },
  peek: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  peekText: { color: timerColors.onVideo, fontSize: 64, fontWeight: '200', fontVariant: ['tabular-nums'] },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 4 },
  title: { color: timerColors.onVideo, fontSize: 24, fontWeight: '700' },
  hint: { color: timerColors.onVideoMuted, fontSize: 14 },
  ready: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, gap: 10 },
  readyTitle: { color: timerColors.onVideo, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  readyBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: timerColors.chip },
  readyPrimary: { backgroundColor: timerColors.onVideo },
  readyText: { color: timerColors.onVideo, fontSize: 16, fontWeight: '600' },
  readyPrimaryText: { color: timerColors.meditateShade },
});
