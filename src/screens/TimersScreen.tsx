import React, { useState } from 'react';
import { ActionSheetIOS, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { FOCUS_LENGTHS, MEDITATE_LENGTHS, timerName, type TimerKind } from '../lib/timers';
import { TimerVideo } from '../components/TimerVideo';
import { useTimerStart } from '../components/useTimerStart';
import { timerColors, useThemedStyles, type Theme } from '../theme';

const GROW_MS = 400;

/**
 * Two large video cards, one above the other: Focus (clock) and Meditate (flowers), each a single
 * tap target with a length chip. Tapping one grows it to fill the screen and starts the timer.
 */
export function TimersScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { settings } = useStore();
  const start = useTimerStart();
  const [minutes, setMinutes] = useState<Record<TimerKind, number>>({
    focus: settings.timerPrefs.focus,
    meditate: settings.timerPrefs.meditate,
  });
  const [picked, setPicked] = useState<TimerKind | null>(null);
  const [anim] = useState(() => new Animated.Value(0));

  const choose = (kind: TimerKind) => {
    if (picked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPicked(kind);
    Animated.timing(anim, {
      toValue: 1,
      duration: GROW_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      router.back();
      start(kind, minutes[kind]);
    });
  };

  const pickLength = (kind: TimerKind) => {
    const options = kind === 'focus' ? FOCUS_LENGTHS : MEDITATE_LENGTHS;
    const set = (m: number) => setMinutes((cur) => ({ ...cur, [kind]: m }));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `${timerName(kind)} length`,
          options: [...options.map((m) => `${m} min`), 'Cancel'],
          cancelButtonIndex: options.length,
        },
        (i) => i < options.length && set(options[i]),
      );
    } else {
      const i = options.indexOf(minutes[kind] as never);
      set(options[(i + 1) % options.length]);
    }
  };

  // The tapped card grows; the other shrinks away and fades out.
  const flexOf = (kind: TimerKind) =>
    picked == null ? 1 : anim.interpolate({ inputRange: [0, 1], outputRange: picked === kind ? [1, 1] : [1, 0.0001] });
  const opacityOf = (kind: TimerKind) =>
    picked == null || picked === kind ? 1 : anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const gap = picked == null ? 12 : anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const pad = picked == null ? 16 : anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.bar}>
        <Text style={s.title}>Timers</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Text style={s.close}>✕</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[s.cards, { gap, paddingHorizontal: pad, paddingBottom: Animated.add(pad, insets.bottom) }]}
      >
        {(['focus', 'meditate'] as const).map((kind) => (
          <Animated.View key={kind} style={{ flex: flexOf(kind), opacity: opacityOf(kind) }}>
            <Card kind={kind} minutes={minutes[kind]} onPress={() => choose(kind)} onLength={() => pickLength(kind)} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

function Card({
  kind,
  minutes,
  onPress,
  onLength,
}: {
  kind: TimerKind;
  minutes: number;
  onPress(): void;
  onLength(): void;
}) {
  const s = useThemedStyles(makeStyles);
  const shade = kind === 'focus' ? timerColors.focusShade : timerColors.meditateShade;
  return (
    // The card is one tap target; the length chip sits on top of it (not nested inside it).
    <View style={s.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [StyleSheet.absoluteFill, s.cardTap, pressed && { opacity: 0.92 }]}
        accessibilityRole="button"
        accessibilityLabel={`Start ${timerName(kind)}, ${minutes} minutes`}
      >
        <TimerVideo kind={kind} mode="play" />
        {/* Text never sits straight on the video: a gradient runs up from the bottom. */}
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
          <Defs>
            <LinearGradient id={`g-${kind}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.45" stopColor={shade} stopOpacity="0" />
              <Stop offset="1" stopColor={shade} stopOpacity="0.92" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill={`url(#g-${kind})`} />
        </Svg>
        <View style={s.cardBottom}>
          <Text style={s.cardName}>{timerName(kind)}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onLength}
        hitSlop={8}
        style={s.chip}
        accessibilityRole="button"
        accessibilityLabel={`Length ${minutes} minutes`}
      >
        <Text style={s.chipText}>{minutes} min ▾</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    title: { fontSize: 28, fontWeight: '700', color: t.text },
    close: { fontSize: 20, color: t.textMuted },
    cards: { flex: 1 },
    card: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: t.surface, justifyContent: 'flex-end' },
    cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
    cardName: { color: timerColors.onVideo, fontSize: 26, fontWeight: '800' },
    cardTap: { justifyContent: 'flex-end' },
    chip: {
      position: 'absolute',
      right: 18,
      bottom: 20,
      backgroundColor: timerColors.chip,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: { color: timerColors.onVideo, fontSize: 15, fontWeight: '600' },
  });
