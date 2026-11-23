import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { Habit } from '../types';
import { useStore } from '../store';
import { HEAVINESS, expectedFeltText, expectedVsFelt } from '../lib/insights';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const AUTO_DISMISS_MS = 7000;

/**
 * After an avoid session: "How heavy was it actually?" on the same 1–5 scale as before (the
 * number picked before shown faintly), then the "what did you do?" line and "Remind me of this
 * line on a hard day". Shows "Expected 4, felt like 2" and the last 9 sessions as expected
 * (hollow) vs felt (filled) dots. Stores meta.feltScore / note / keepLine; never a count or %.
 */
export function AvoidAfterCard({
  habit,
  date,
  autoDismiss,
  onDismiss,
}: {
  habit: Habit;
  date: string;
  autoDismiss: boolean;
  onDismiss(): void;
}) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { idx, mergeMeta } = useStore();
  const rec = idx.get(habit.id)?.get(date);
  const before = typeof rec?.meta?.dreadBefore === 'number' ? (rec.meta.dreadBefore as number) : null;
  const [felt, setFelt] = useState<number | null>(
    typeof rec?.meta?.feltScore === 'number' ? (rec.meta.feltScore as number) : null,
  );
  const [text, setText] = useState(typeof rec?.meta?.note === 'string' ? rec.meta.note : '');
  const [keep, setKeep] = useState(rec?.meta?.keepLine === true);
  const [touched, setTouched] = useState(false);
  const [kb, setKb] = useState(0);
  const [slide] = useState(() => new Animated.Value(0));
  const [timer] = useState(() => new Animated.Value(1));
  const textRef = useRef(text);
  const keepRef = useRef(keep);
  const done = useRef(false);

  const close = () => {
    if (done.current) return;
    done.current = true;
    const line = textRef.current.trim();
    // A line can only be kept if there is one.
    mergeMeta(habit.id, date, { note: line || undefined, keepLine: !!line && keepRef.current });
    Keyboard.dismiss();
    onDismiss();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [slide]);
  useEffect(() => {
    if (!autoDismiss || touched) {
      timer.stopAnimation();
      return;
    }
    timer.setValue(1);
    const anim = Animated.timing(timer, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && closeRef.current());
    return () => anim.stop();
  }, [autoDismiss, touched, timer]);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setKb(e.endCoordinates.height),
    );
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const pick = (n: number) => {
    Haptics.selectionAsync().catch(() => {});
    setTouched(true);
    setFelt(n);
    mergeMeta(habit.id, date, { feltScore: n });
  };

  const history = expectedVsFelt(habit, idx);

  return (
    <Animated.View
      style={[
        s.card,
        kb > 0 && { bottom: kb + 8 },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}
    >
      <View style={s.head}>
        <Text style={s.title}>How heavy was it actually?</Text>
        <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close">
          <Text style={s.close}>{touched ? 'Done' : '✕'}</Text>
        </Pressable>
      </View>
      <View style={s.scale}>
        {HEAVINESS.map((label, i) => {
          const n = i + 1;
          const on = felt === n;
          const wasBefore = before === n;
          return (
            <Pressable
              key={label}
              onPress={() => pick(n)}
              style={[s.opt, wasBefore && !on && s.optBefore, on && s.optOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${n} ${label}${wasBefore ? ', what you expected' : ''}`}
            >
              <Text style={[s.optNum, on && s.optTextOn]}>{n}</Text>
              <Text style={[s.optLabel, on && s.optTextOn]}>{wasBefore && !on ? 'before' : label}</Text>
            </Pressable>
          );
        })}
      </View>

      {felt != null && before != null && (
        <View style={s.compare}>
          <Text style={s.compareText}>{expectedFeltText({ expected: before, felt })}</Text>
          {history.pairs.length > 1 && (
            <PairDots pairs={history.pairs} hollow={t.textMuted} filled={t.accent} track={t.border} />
          )}
        </View>
      )}

      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          textRef.current = v;
          setTouched(true);
        }}
        onFocus={() => setTouched(true)}
        onSubmitEditing={close}
        placeholder="What did you do? (optional)"
        placeholderTextColor={t.textMuted}
        keyboardAppearance={t.dark ? 'dark' : 'light'}
        returnKeyType="done"
        maxLength={120}
        style={s.input}
      />
      <Pressable
        style={s.keepRow}
        onPress={() => {
          setTouched(true);
          setKeep((k) => (keepRef.current = !k));
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: keep }}
      >
        <Text style={s.keepText}>Remind me of this line on a hard day</Text>
        <Switch
          value={keep}
          onValueChange={(v) => {
            setTouched(true);
            keepRef.current = v;
            setKeep(v);
          }}
          trackColor={{ true: t.accent, false: t.muted }}
        />
      </Pressable>

      {autoDismiss && !touched && (
        <Animated.View
          style={[s.bar, { width: timer.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      )}
    </Animated.View>
  );
}

/** The last sessions: expected (hollow) and felt (filled) on the 1–5 scale; 5 Dread at the top. */
function PairDots({
  pairs,
  hollow,
  filled,
  track,
}: {
  pairs: { expected: number; felt: number }[];
  hollow: string;
  filled: string;
  track: string;
}) {
  const COL = 16;
  const H = 46;
  const y = (v: number) => 5 + ((5 - v) / 4) * (H - 10);
  return (
    <Svg width={pairs.length * COL} height={H} accessibilityLabel="Expected and felt, last sessions">
      {pairs.map((p, i) => {
        const cx = i * COL + COL / 2;
        return (
          <React.Fragment key={i}>
            <Line x1={cx} y1={y(p.expected)} x2={cx} y2={y(p.felt)} stroke={track} strokeWidth={1.5} />
            <Circle cx={cx} cy={y(p.expected)} r={4} stroke={hollow} strokeWidth={1.5} fill="none" />
            <Circle cx={cx} cy={y(p.felt)} r={3.5} fill={filled} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 28,
      backgroundColor: t.surface,
      borderRadius: 16,
      paddingTop: 12,
      paddingHorizontal: 12,
      paddingBottom: 14,
      gap: 10,
      overflow: 'hidden',
      shadowColor: t.shadow,
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
    head: { flexDirection: 'row', alignItems: 'center' },
    title: { flex: 1, fontSize: 15, fontWeight: '600', color: t.text },
    close: { color: t.textMuted, fontSize: 14, paddingLeft: 10, fontWeight: '600' },
    scale: { flexDirection: 'row', gap: 6 },
    opt: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: t.muted,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    optBefore: { borderColor: t.dotEmpty },
    optOn: { backgroundColor: t.accent },
    optNum: { fontSize: 16, fontWeight: '600', color: t.text },
    optLabel: { fontSize: 11, color: t.textMuted, marginTop: 2 },
    optTextOn: { color: t.onAccent },
    compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    compareText: { fontSize: 15, fontWeight: '600', color: t.accent, flexShrink: 1 },
    input: {
      backgroundColor: t.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: t.text,
    },
    keepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    keepText: { flex: 1, fontSize: 14, color: t.text },
    bar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: t.accent },
  });
