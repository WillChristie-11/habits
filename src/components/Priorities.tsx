import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Priority } from '../types';
import { useStore } from '../store';
import { MAX_OPEN, canAddPriority, prioritiesOn } from '../lib/priorities';
import { SwipeRow } from './SwipeRow';
import { useTheme, useThemedStyles, type Theme } from '../theme';

/** Ask for a new priority with the native prompt (from the ＋ chooser). */
export function promptPriority(priorities: Priority[], add: (text: string) => void) {
  if (!canAddPriority(priorities)) {
    Alert.alert(`${MAX_OPEN} at a time`, 'Check one off (or delete it) before adding another.');
    return;
  }
  if (Platform.OS === 'ios') {
    Alert.prompt(
      'Today’s priority',
      'One thing that matters today.',
      (text) => text?.trim() && add(text),
      'plain-text',
    );
  }
}

/**
 * Today's priorities: up to 3 one-off tasks at the top of Today. Never counted in %, rings, the
 * grid, the recap or notifications. Open ones carry over until checked; a checked one stays on
 * the day it was checked. Swipe left to delete.
 */
export function Priorities({ date }: { date: string }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { priorities, ctx, addPriority, togglePriority, removePriority } = useStore();
  const isToday = date === ctx.today;
  const list = prioritiesOn(priorities, date, ctx.today);
  const canAdd = isToday && canAddPriority(priorities);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');

  if (!isToday && list.length === 0) return null;

  const submit = async () => {
    const v = text.trim();
    setText('');
    setAdding(false);
    if (v) await addPriority(v);
  };

  if (isToday && list.length === 0 && !adding) {
    return (
      <Pressable onPress={() => setAdding(true)} style={s.invite} accessibilityRole="button">
        <Text style={s.inviteText}>＋ Today’s priorities</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Priorities</Text>
        {canAdd && !adding && (
          <Pressable
            onPress={() => setAdding(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Add a priority"
          >
            <Text style={s.plus}>＋</Text>
          </Pressable>
        )}
      </View>
      {list.map((p) => {
        const done = p.done_on != null;
        return (
          <SwipeRow
            key={p.id}
            name={p.text}
            actions={[]}
            gap={6}
            radius={12}
            confirmTitle="Delete this priority?"
            confirmMessage={p.text}
            onDelete={() => removePriority(p.id)}
          >
            <View style={s.row}>
              <Pressable
                onPress={() => {
                  if (!isToday) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  togglePriority(p);
                }}
                disabled={!isToday}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={p.text}
              >
                <View style={[s.check, done && s.checkDone]}>{done && <Text style={s.checkMark}>✓</Text>}</View>
              </Pressable>
              <Text style={[s.text, done && s.textDone]}>{p.text}</Text>
            </View>
          </SwipeRow>
        );
      })}
      {adding && (
        <View style={s.row}>
          <View style={s.check} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            onBlur={submit}
            autoFocus
            placeholder="One thing that matters today"
            placeholderTextColor={t.textMuted}
            keyboardAppearance={t.dark ? 'dark' : 'light'}
            returnKeyType="done"
            maxLength={80}
            style={s.input}
          />
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 12 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      marginHorizontal: 4,
    },
    title: { fontSize: 13, fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    plus: { fontSize: 20, color: t.accent, fontWeight: '600' },
    invite: { marginTop: 10, paddingHorizontal: 4, paddingVertical: 4 },
    inviteText: { fontSize: 14, color: t.textMuted, fontWeight: '500' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.surface,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: t.dotEmpty,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDone: { backgroundColor: t.accent, borderColor: t.accent },
    checkMark: { color: t.onAccent, fontSize: 13, fontWeight: '800' },
    text: { flex: 1, fontSize: 16, color: t.text },
    textDone: { color: t.textMuted, textDecorationLine: 'line-through' },
    input: { flex: 1, fontSize: 16, color: t.text, padding: 0 },
  });
