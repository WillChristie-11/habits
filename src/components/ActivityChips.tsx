import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { activityWeek, chipLabel } from '../lib/activities';
import type { Habit } from '../types';
import { LogSheetBody } from './LogRow';
import { useThemedStyles, type Theme } from '../theme';

const UNDO_MS = 5000;

/**
 * One chip per activity near the top of Today ("Run 2/3"): tap logs it for today, with an Undo
 * line for 5 seconds. "All" opens the Log sheet (amounts, other days, edit, new).
 */
export function ActivityChips({
  onEdit,
  onDelete,
  onNew,
}: {
  onEdit(h: Habit): void;
  onDelete(h: Habit): void;
  onNew(): void;
}) {
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, logActivity, unmark } = useStore();
  const activities = habits.filter((h) => h.kind === 'activity').sort((a, b) => a.order - b.order || a.id - b.id);
  const [open, setOpen] = useState(false);
  const [bar, setBar] = useState<{ habit: Habit; text: string; undo: boolean; n: number } | null>(null);
  const seq = useRef(0);
  const after = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!bar) return;
    const id = setTimeout(() => setBar((b) => (b?.n === bar.n ? null : b)), UNDO_MS);
    return () => clearTimeout(id);
  }, [bar]);

  const log = async (h: Habit) => {
    const n = ++seq.current;
    if (activityWeek(h, idx, ctx.today).today)
      return setBar({ habit: h, text: `${h.name} is already logged today`, undo: false, n });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await logActivity(h, ctx.today);
    setBar({ habit: h, text: `Logged ${h.name}`, undo: true, n });
  };
  const closeThen = (fn: () => void) => {
    after.current = fn;
    setOpen(false);
  };

  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {activities.map((h) => {
          const logged = activityWeek(h, idx, ctx.today).today;
          return (
            <Pressable
              key={h.id}
              onPress={() => log(h)}
              style={({ pressed }) => [s.chip, logged && s.chipOn, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityLabel={`${chipLabel(h, idx, ctx.today)}${logged ? ', logged today' : ''}. Tap to log.`}
            >
              <Text style={[s.chipText, logged && s.chipTextOn]}>{chipLabel(h, idx, ctx.today)}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [s.chip, s.all, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="All activities: the Log sheet"
        >
          <Text style={s.allText}>{activities.length ? 'All' : '＋ Log an activity'}</Text>
        </Pressable>
      </ScrollView>
      {bar && (
        <View style={s.bar}>
          <Text style={s.barText} numberOfLines={1}>
            {bar.text}
          </Text>
          {bar.undo && (
            <Pressable
              onPress={async () => {
                await unmark(bar.habit.id, ctx.today);
                setBar(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Text style={s.undo}>Undo</Text>
            </Pressable>
          )}
        </View>
      )}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
        onDismiss={() => {
          after.current?.();
          after.current = null;
        }}
      >
        {open && (
          <LogSheetBody
            onClose={() => setOpen(false)}
            onEdit={(h) => closeThen(() => onEdit(h))}
            onNew={() => closeThen(onNew)}
            onDelete={onDelete}
          />
        )}
      </Modal>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 10 },
    row: { gap: 8, paddingVertical: 2 },
    chip: {
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    chipOn: { backgroundColor: t.accentSoft, borderColor: t.accent },
    chipText: { fontSize: 15, color: t.text, fontVariant: ['tabular-nums'] },
    chipTextOn: { color: t.accent, fontWeight: '600' },
    all: { backgroundColor: 'transparent', borderColor: t.accent },
    allText: { fontSize: 15, color: t.accent, fontWeight: '600' },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: t.text,
    },
    barText: { flex: 1, color: t.background, fontSize: 14, fontWeight: '600' },
    undo: { color: t.background, fontSize: 14, fontWeight: '800' },
  });
