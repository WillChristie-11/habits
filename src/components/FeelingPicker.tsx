import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FEELINGS } from '../types';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const AUTO_DISMISS_MS = 7000;

interface Props {
  title: React.ReactNode;
  /** Show the 1–5 scale. */
  feelings: boolean;
  /** Show a one-line "What did you do?" field. */
  note: boolean;
  autoDismiss: boolean;
  onPick(feeling: number): void;
  onNote(text: string): void;
  onDismiss(): void;
}

/**
 * Slides up after a check-off (or a finished session, or a skip). Records how you felt, not how
 * much you did, and optionally one line about what you did. Hides itself after 7 s unless touched.
 */
export function FeelingPicker({ title, feelings, note, autoDismiss, onPick, onNote, onDismiss }: Props) {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();
  const [slide] = useState(() => new Animated.Value(0));
  const [timer] = useState(() => new Animated.Value(1));
  const [touched, setTouched] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [kb, setKb] = useState(0);
  const textRef = useRef('');
  const done = useRef(false);

  // Save whatever was typed, once, then close.
  const close = () => {
    if (done.current) return;
    done.current = true;
    if (textRef.current.trim()) onNote(textRef.current.trim());
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

  // Sit above the keyboard while typing.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setKb(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.card,
        kb > 0 && { bottom: kb + 8 },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close">
          <Text style={styles.close}>{touched ? 'Done' : '✕'}</Text>
        </Pressable>
      </View>
      {feelings && (
        <View style={styles.options}>
          {FEELINGS.map((label, i) => (
            <Pressable
              key={label}
              style={({ pressed }) => [styles.opt, (pressed || picked === i + 1) && styles.optPressed]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPick(i + 1);
                if (!note) {
                  done.current = true;
                  onDismiss();
                } else {
                  setPicked(i + 1);
                  setTouched(true);
                }
              }}
            >
              <Text style={styles.num}>{i + 1}</Text>
              <Text style={styles.optLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {note && (
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
          style={[styles.input, feelings && { marginTop: 10 }]}
        />
      )}
      {autoDismiss && !touched && (
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
    close: { color: t.textMuted, fontSize: 14, paddingLeft: 10, fontWeight: '600' },
    options: { flexDirection: 'row', gap: 6 },
    opt: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: t.muted },
    num: { fontSize: 16, fontWeight: '600', color: t.text },
    optLabel: { fontSize: 11, color: t.textMuted, marginTop: 2 },
    optPressed: { backgroundColor: t.accentSoft },
    input: {
      backgroundColor: t.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: t.text,
    },
    bar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: t.accent },
  });
