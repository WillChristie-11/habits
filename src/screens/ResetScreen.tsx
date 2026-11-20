import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { counts, nextAnchor, stateOn, todayGroups, visibleOn } from '../lib/schedule';
import { openPriorities } from '../lib/priorities';
import { useEndTime } from '../components/useEndTime';
import { Button } from '../components/ui';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const JUST_START_MIN = 5;
const INHALE_MS = 4000;
const EXHALE_MS = 6000;
const CYCLE_MS = INHALE_MS + EXHALE_MS;
const START_KEY = 'reset-start';
const BREATHE_KEY = (min: number) => `reset-breathe-${min}`;

const mmss = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

type Mode = 'menu' | 'start' | 'clear' | 'switch';

/**
 * Reset: three small tools, nothing tracked or counted.
 *  Just Start — one optional line, then 5 minutes; Keep going or Done.
 *  Clear Head — 1 / 2 / 3 min of slow breathing (in 4 s, out 6 s) with a light haptic each phase.
 *  Switching tasks — where you left off (saved to today's journal page), an optional 1-min
 *  Clear Head, then what's next → its Get ready countdown.
 */
export function ResetScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { settings } = useStore();
  // Reopened while a timer is still running: go straight back to it.
  const [mode, setMode] = useState<Mode>(() =>
    settings.timers[START_KEY] ? 'start' : [1, 2, 3].some((m) => settings.timers[BREATHE_KEY(m)]) ? 'clear' : 'menu',
  );
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.topBar}>
        {mode === 'menu' ? (
          <View style={{ width: 60 }} />
        ) : (
          <Pressable onPress={() => setMode('menu')} hitSlop={12} style={{ width: 60 }} accessibilityRole="button">
            <Text style={s.back}>‹ Reset</Text>
          </Pressable>
        )}
        <Text style={s.kicker}>{mode === 'menu' ? 'Reset' : ''}</Text>
        <Pressable
          onPress={close}
          hitSlop={12}
          style={{ width: 60, alignItems: 'flex-end' }}
          accessibilityLabel="Close"
        >
          <Text style={s.close}>✕</Text>
        </Pressable>
      </View>
      {mode === 'menu' && <Menu onPick={setMode} />}
      {mode === 'start' && <JustStart onDone={close} />}
      {mode === 'clear' && <ClearHead onDone={close} />}
      {mode === 'switch' && <Switching onDone={close} />}
    </View>
  );
}

function Menu({ onPick }: { onPick(m: Mode): void }) {
  const s = useThemedStyles(makeStyles);
  const card = (m: Mode, title: string, sub: string) => (
    <Pressable
      onPress={() => onPick(m)}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.cardSub}>{sub}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 24 }}>
      <Text style={s.lead}>A moment to reset. Nothing here is tracked.</Text>
      {card('start', 'Just Start', `Pick one thing and give it ${JUST_START_MIN} minutes.`)}
      {card('clear', 'Clear Head', 'Slow breathing for 1, 2 or 3 minutes.')}
      {card('switch', 'Switching tasks', 'Park where you left off, breathe, pick what’s next.')}
    </ScrollView>
  );
}

/** One optional line, then a 5-minute timer; at the end Keep going (counts up) or Done. */
function JustStart({ onDone }: { onDone(): void }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const [what, setWhat] = useState('');
  const [keepGoing, setKeepGoing] = useState(false);
  const timer = useEndTime(START_KEY, { title: `${JUST_START_MIN} minutes`, body: 'Keep going, or call it done.' });
  const buzzed = useRef(false);
  useEffect(() => {
    if (timer.ended && !buzzed.current) {
      buzzed.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [timer.ended]);

  const done = () => {
    timer.clear();
    onDone();
  };

  if (timer.endsAt == null) {
    return (
      <View style={s.body}>
        <Text style={s.h1}>Just Start</Text>
        <TextInput
          value={what}
          onChangeText={setWhat}
          placeholder="What are you starting? (optional)"
          placeholderTextColor={t.textMuted}
          keyboardAppearance={t.dark ? 'dark' : 'light'}
          returnKeyType="go"
          onSubmitEditing={() => timer.start(JUST_START_MIN * 60_000)}
          style={s.input}
          maxLength={80}
        />
        <Button title={`Start ${JUST_START_MIN} min`} onPress={() => timer.start(JUST_START_MIN * 60_000)} />
      </View>
    );
  }
  const over = timer.endsAt != null ? timer.now - timer.endsAt : 0;
  return (
    <View style={s.body}>
      {!!what.trim() && <Text style={s.what}>{what.trim()}</Text>}
      <Text style={s.clock}>
        {keepGoing ? `+${mmss(over)}` : timer.ended ? 'Time’s up' : mmss(timer.remaining ?? 0)}
      </Text>
      <Text style={s.sub}>
        {keepGoing
          ? 'Keep going as long as you like.'
          : timer.ended
            ? 'Nice. Keep going, or call it done.'
            : 'Just this, for a few minutes.'}
      </Text>
      <View style={s.actions}>
        {timer.ended && !keepGoing && <Button title="Keep going" onPress={() => setKeepGoing(true)} />}
        <Button kind={timer.ended && !keepGoing ? 'secondary' : 'primary'} title="Done" onPress={done} />
      </View>
    </View>
  );
}

/**
 * Slow breathing: a circle grows for 4 s (in) and shrinks for 6 s (out), with a light haptic on
 * each change. `fixed` skips the length choice (Switching tasks uses 1 min).
 */
function ClearHead({ onDone, fixed }: { onDone(): void; fixed?: number }) {
  const s = useThemedStyles(makeStyles);
  const { settings } = useStore();
  const running = [1, 2, 3].find((m) => settings.timers[BREATHE_KEY(m)]);
  const [minutes, setMinutes] = useState<number | null>(fixed ?? running ?? null);
  if (minutes == null) {
    return (
      <View style={s.body}>
        <Text style={s.h1}>Clear Head</Text>
        <Text style={s.sub}>Breathe in for 4, out for 6. Nothing to fill in.</Text>
        <View style={s.actions}>
          {[1, 2, 3].map((m) => (
            <Button key={m} kind={m === 1 ? 'primary' : 'secondary'} title={`${m} min`} onPress={() => setMinutes(m)} />
          ))}
        </View>
      </View>
    );
  }
  return <Breathing minutes={minutes} onDone={onDone} />;
}

function Breathing({ minutes, onDone }: { minutes: number; onDone(): void }) {
  const s = useThemedStyles(makeStyles);
  const total = minutes * 60_000;
  const timer = useEndTime(BREATHE_KEY(minutes), { title: 'Clear Head done', body: 'Take that calm with you.' });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (timer.endsAt == null) timer.start(total);
  }, [timer, total]);

  const startMs = timer.endsAt != null ? timer.endsAt - total : timer.now;
  const elapsed = Math.max(0, timer.now - startMs);
  const inCycle = elapsed % CYCLE_MS;
  const inhale = inCycle < INHALE_MS;
  const ended = timer.ended;

  // Animate the circle per phase; light haptic on every change.
  const [scale] = useState(() => new Animated.Value(0.55));
  const phaseKey = ended ? 'end' : `${Math.floor(elapsed / CYCLE_MS)}-${inhale ? 'in' : 'out'}`;
  const lastPhase = useRef('');
  useEffect(() => {
    if (phaseKey === lastPhase.current) return;
    lastPhase.current = phaseKey;
    if (phaseKey === 'end') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.timing(scale, { toValue: 0.7, duration: 800, useNativeDriver: true }).start();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const left = inhale ? INHALE_MS - inCycle : CYCLE_MS - inCycle;
    Animated.timing(scale, {
      toValue: inhale ? 1 : 0.55,
      duration: left,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
    }).start();
    // phaseKey captures inhale/inCycle at the change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, scale]);

  const finish = () => {
    timer.clear();
    onDone();
  };

  return (
    <View style={[s.body, { alignItems: 'center' }]}>
      <View style={s.circleWrap}>
        <Animated.View style={[s.circle, { transform: [{ scale }] }]} />
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <Text style={s.phase}>{ended ? 'Done' : inhale ? 'Breathe in' : 'Breathe out'}</Text>
        </View>
      </View>
      <Text style={s.sub}>{ended ? 'Take that calm with you.' : `${mmss(timer.remaining ?? total)} left`}</Text>
      <View style={[s.actions, { alignSelf: 'stretch' }]}>
        <Button kind={ended ? 'primary' : 'secondary'} title={ended ? 'Done' : 'Stop'} onPress={finish} />
      </View>
    </View>
  );
}

/** Where you left off → optional 1-min Clear Head → what's next → Get ready. */
function Switching({ onDone }: { onDone(): void }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { habits, idx, ctx, now, pages, savePage, priorities } = useStore();
  const [step, setStep] = useState<'leftoff' | 'breathe' | 'breathing' | 'next'>('leftoff');
  const [line, setLine] = useState('');

  const saveLeftOff = async () => {
    const v = line.trim();
    if (v) {
      const page = pages[ctx.today] ?? '';
      await savePage(ctx.today, page.trim() ? `${page.replace(/\s+$/, '')}\nLeft off: ${v}` : `Left off: ${v}`);
    }
    setStep('breathe');
  };

  // What's next: the current anchor's open habits, then open priorities; or anything open today.
  const options = useMemo(() => {
    const items = habits.filter((h) => counts(h) || h.kind === 'anchor');
    const g = todayGroups(items, (h) => visibleOn(h, idx, ctx));
    const open = (id: number) => stateOn(habits.find((h) => h.id === id)!, idx, ctx.today, ctx) === 'pending';
    const focus = nextAnchor(habits, idx, ctx, now.getHours() * 60 + now.getMinutes());
    const current = focus ? g.anchors.find((a) => a.anchor.id === focus.anchor.id) : undefined;
    const suggested = [
      ...(current?.rows ?? [])
        .filter((r) => open(r.habit.id))
        .map((r) => ({ key: `h${r.habit.id}`, name: r.habit.name, habitId: r.habit.id })),
      ...openPriorities(priorities).map((p) => ({ key: `p${p.id}`, name: p.text, priorityId: p.id })),
    ];
    const rest = [...g.anchors.flatMap((a) => a.rows), ...g.anytime, ...g.week]
      .filter((r) => open(r.habit.id) && !suggested.some((x) => x.key === `h${r.habit.id}`))
      .map((r) => ({ key: `h${r.habit.id}`, name: r.habit.name, habitId: r.habit.id }));
    return { suggested, rest };
  }, [habits, idx, ctx, now, priorities]);

  const go = (o: { habitId?: number; priorityId?: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.replace({
      pathname: '/ready',
      params: o.habitId != null ? { habitId: String(o.habitId) } : { priorityId: String(o.priorityId) },
    });
  };

  if (step === 'leftoff') {
    return (
      <View style={s.body}>
        <Text style={s.h1}>Where did you leave off?</Text>
        <Text style={s.sub}>One line, saved to today’s journal page so you can pick it up later.</Text>
        <TextInput
          value={line}
          onChangeText={setLine}
          placeholder="e.g. halfway through the intro"
          placeholderTextColor={t.textMuted}
          keyboardAppearance={t.dark ? 'dark' : 'light'}
          returnKeyType="next"
          onSubmitEditing={saveLeftOff}
          autoFocus
          style={s.input}
          maxLength={120}
        />
        <Button title="Next" onPress={saveLeftOff} />
      </View>
    );
  }
  if (step === 'breathe') {
    return (
      <View style={s.body}>
        <Text style={s.h1}>Clear your head?</Text>
        <Text style={s.sub}>One minute of slow breathing before the next thing.</Text>
        <View style={s.actions}>
          <Button title="1 min Clear Head" onPress={() => setStep('breathing')} />
          <Button kind="secondary" title="Skip" onPress={() => setStep('next')} />
        </View>
      </View>
    );
  }
  if (step === 'breathing') return <ClearHead fixed={1} onDone={() => setStep('next')} />;

  const first = options.suggested[0];
  return (
    <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
      <Text style={s.h1}>What’s next?</Text>
      {first ? (
        <Pressable onPress={() => go(first)} style={({ pressed }) => [s.card, s.cardOn, pressed && { opacity: 0.7 }]}>
          <Text style={s.cardSub}>Suggested</Text>
          <Text style={s.cardTitle}>{first.name}</Text>
          <Text style={s.cardSub}>Tap to get ready</Text>
        </Pressable>
      ) : (
        <Text style={s.sub}>Nothing open right now. Pick anything, or just close this.</Text>
      )}
      {[...options.suggested.slice(1), ...options.rest].length > 0 && <Text style={s.label}>Or pick</Text>}
      {[...options.suggested.slice(1), ...options.rest].map((o) => (
        <Pressable key={o.key} onPress={() => go(o)} style={({ pressed }) => [s.pick, pressed && { opacity: 0.6 }]}>
          <Text style={s.pickText}>{o.name}</Text>
        </Pressable>
      ))}
      <View style={{ marginTop: 8 }}>
        <Button kind="secondary" title="Close" onPress={onDone} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background, paddingHorizontal: 24 },
    center: { alignItems: 'center', justifyContent: 'center' },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    back: { fontSize: 16, color: t.accent, fontWeight: '600' },
    close: { fontSize: 20, color: t.textMuted },
    kicker: { fontSize: 13, fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    lead: { fontSize: 15, color: t.textMuted, marginBottom: 4 },
    card: { backgroundColor: t.surface, borderRadius: 16, padding: 18, gap: 4 },
    cardOn: { backgroundColor: t.rowHighlight, borderWidth: 1.5, borderColor: t.accent },
    cardTitle: { fontSize: 20, fontWeight: '700', color: t.text },
    cardSub: { fontSize: 14, color: t.textMuted },
    body: { flexGrow: 1, justifyContent: 'center', gap: 16 },
    h1: { fontSize: 28, fontWeight: '700', color: t.text },
    sub: { fontSize: 15, color: t.textMuted, lineHeight: 21 },
    what: { fontSize: 22, fontWeight: '600', color: t.text, textAlign: 'center' },
    clock: { fontSize: 64, fontWeight: '300', color: t.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
    input: {
      backgroundColor: t.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      color: t.text,
    },
    actions: { gap: 10 },
    circleWrap: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
    circle: {
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: t.accentSoft,
      borderWidth: 2,
      borderColor: t.accent,
    },
    phase: { fontSize: 22, fontWeight: '600', color: t.text },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 8,
    },
    pick: { backgroundColor: t.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
    pickText: { fontSize: 16, fontWeight: '600', color: t.text },
  });
