import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FEELINGS } from '../types';
import { useThemedStyles, type Theme } from '../theme';

const AUTO_DISMISS_MS = 4000;

interface Props {
  habitName: string;
  autoDismiss: boolean;
  onPick(feeling: number): void;
  onDismiss(): void;
}

/** Slides up after a check-off. Records how you felt, not how much you did. */
export function FeelingPicker({ habitName, autoDismiss, onPick, onDismiss }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [slide] = useState(() => new Animated.Value(0));
  const [timer] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (!autoDismiss) return;
    timer.setValue(1);
    const anim = Animated.timing(timer, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && onDismiss());
    return () => anim.stop();
  }, [habitName, autoDismiss, slide, timer, onDismiss]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          How do you feel after <Text style={{ fontWeight: '600' }}>{habitName}</Text>?
        </Text>
        <Pressable onPress={onDismiss} hitSlop={10}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.options}>
        {FEELINGS.map((label, i) => (
          <Pressable
            key={label}
            style={({ pressed }) => [styles.opt, pressed && styles.optPressed]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(i + 1);
            }}
          >
            <Text style={styles.num}>{i + 1}</Text>
            <Text style={styles.optLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {autoDismiss && (
        <Animated.View
          style={[styles.bar, { width: timer.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      )}
    </Animated.View>
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
    overflow: 'hidden',
    shadowColor: t.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { flex: 1, fontSize: 14, color: t.text },
  close: { color: t.textMuted, fontSize: 14, paddingLeft: 10 },
  options: { flexDirection: 'row', gap: 6 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: t.muted },
  num: { fontSize: 16, fontWeight: '600', color: t.text },
  optLabel: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  optPressed: { backgroundColor: t.accentSoft },
  bar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: t.accent },
});
