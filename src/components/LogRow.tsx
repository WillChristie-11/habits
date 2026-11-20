import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Habit } from '../types';
import { FEELINGS } from '../types';
import { useStore } from '../store';
import { addDays, fromKey } from '../lib/dates';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const AUTO_DISMISS_MS = 7000;
const unitLabel = (u: Habit['unit']) => (u === 'mi' ? 'mi' : u === 'min' ? 'min' : '');

/**
 * "Log" row at the bottom of Today: one button per activity. One tap logs it for today (light
 * haptic) and offers an optional amount + feeling sheet. Long-press to log one of the last 7 days,
 * or to edit/delete the activity.
 * Activities are never expected, missed or counted.
 */
export function LogRow({ onEdit, onDelete }: { onEdit(h: Habit): void; onDelete(h: Habit): void }) {
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, logActivity } = useStore();
  const activities = habits.filter((h) => h.kind === 'activity').sort((a, b) => a.order - b.order || a.id - b.id);
  const [sheet, setSheet] = useState<{ habit: Habit; date: string } | null>(null);
  if (!activities.length) return null;

  const log = async (h: Habit, date: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await logActivity(h, date);
    setSheet({ habit: h, date });
  };

  const pickDay = (h: Habit) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, -i));
    const label = (d: string, i: number) =>
      i === 0
        ? 'Today'
        : i === 1
          ? 'Yesterday'
          : fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const options = [...days.map(label), 'Edit activity', 'Delete activity', 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Log ${h.name} for…`,
          options,
          destructiveButtonIndex: days.length + 1,
          cancelButtonIndex: options.length - 1,
        },
        (i) => {
          if (i < days.length) log(h, days[i]);
          else if (i === days.length) onEdit(h);
          else if (i === days.length + 1)
            Alert.alert(`Delete ${h.name}?`, 'Its logged days are deleted too.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(h) },
            ]);
        },
      );
    } else log(h, ctx.today);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Log</Text>
      <View style={s.buttons}>
        {activities.map((h) => {
          const rec = idx.get(h.id)?.get(ctx.today);
          const logged = rec?.status === 'done';
          const amount = Number(rec?.meta?.amount) || 0;
          return (
            <Pressable
              key={h.id}
              onPress={() => (logged ? setSheet({ habit: h, date: ctx.today }) : log(h, ctx.today))}
              onLongPress={() => pickDay(h)}
              delayLongPress={350}
              style={({ pressed }) => [s.btn, logged && s.btnLogged, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={logged ? `${h.name}, logged today` : `Log ${h.name}`}
              accessibilityHint="Long-press to log an earlier day"
            >
              <Text style={[s.btnText, logged && s.btnTextLogged]}>
                {logged ? `✓ ${h.name}${amount ? ` · ${amount} ${unitLabel(h.unit)}` : ''}` : `＋ ${h.name}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {sheet && (
        <LogSheet
          key={`${sheet.habit.id}-${sheet.date}`}
          habit={sheet.habit}
          date={sheet.date}
          onClose={() => setSheet(null)}
        />
      )}
    </View>
  );
}

/** Optional amount + feeling after logging; hides itself like the feeling card unless touched. */
function LogSheet({ habit, date, onClose }: { habit: Habit; date: string; onClose(): void }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { idx, ctx, settings, setActivityAmount, rateFeeling, unmark } = useStore();
  const rec = idx.get(habit.id)?.get(date);
  const [amount, setAmount] = useState(rec?.meta?.amount != null ? String(rec.meta.amount) : '');
  const [feeling, setFeeling] = useState<number | null>(rec?.feeling ?? null);
  const [touched, setTouched] = useState(false);
  const [timer] = useState(() => new Animated.Value(1));
  const saved = useRef(false);

  const save = async () => {
    if (saved.current) return;
    saved.current = true;
    const n = parseFloat(amount.replace(',', '.'));
    await setActivityAmount(habit, date, Number.isFinite(n) && n > 0 ? n : null);
    if (feeling != null) await rateFeeling(habit.id, feeling, date);
    onClose();
  };

  useEffect(() => {
    if (!settings.feelingAutoDismiss || touched) {
      timer.stopAnimation();
      return;
    }
    const anim = Animated.timing(timer, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && onClose());
    return () => anim.stop();
  }, [settings.feelingAutoDismiss, touched, timer, onClose]);

  const dayText = date === ctx.today ? 'today' : fromKey(date).toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <View style={s.sheet}>
      <View style={s.sheetHead}>
        <Text style={s.sheetTitle}>
          {habit.name} logged {dayText}
        </Text>
        <Pressable
          onPress={async () => {
            await unmark(habit.id, date);
            onClose();
          }}
          hitSlop={10}
        >
          <Text style={s.undo}>Undo</Text>
        </Pressable>
      </View>
      {habit.unit && (
        <View style={s.amountRow}>
          <TextInput
            value={amount}
            onChangeText={(v) => {
              setTouched(true);
              setAmount(v);
            }}
            onFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={t.textMuted}
            keyboardAppearance={t.dark ? 'dark' : 'light'}
            style={s.amount}
            accessibilityLabel={`Amount in ${unitLabel(habit.unit)}`}
          />
          <Text style={s.unit}>{habit.unit === 'mi' ? 'miles' : 'minutes'}</Text>
        </View>
      )}
      <View style={s.feelings}>
        {FEELINGS.map((label, i) => (
          <Pressable
            key={label}
            onPress={() => {
              setTouched(true);
              setFeeling(i + 1);
              Haptics.selectionAsync().catch(() => {});
            }}
            style={[s.feel, feeling === i + 1 && s.feelOn]}
          >
            <Text style={[s.feelNum, feeling === i + 1 && s.feelTextOn]}>{i + 1}</Text>
            <Text style={[s.feelLabel, feeling === i + 1 && s.feelTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={save} style={s.save} accessibilityRole="button">
        <Text style={s.saveText}>{touched ? 'Save' : 'Done'}</Text>
      </Pressable>
      {settings.feelingAutoDismiss && !touched && (
        <Animated.View
          style={[s.bar, { width: timer.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 26 },
    title: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 8,
      marginLeft: 4,
    },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    btn: { borderRadius: 20, borderWidth: 1.5, borderColor: t.accent, paddingHorizontal: 14, paddingVertical: 8 },
    btnLogged: { backgroundColor: t.accent },
    btnText: { fontSize: 15, fontWeight: '600', color: t.accent },
    btnTextLogged: { color: t.onAccent },
    sheet: { backgroundColor: t.surface, borderRadius: 16, padding: 14, marginTop: 12, gap: 10, overflow: 'hidden' },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { fontSize: 15, fontWeight: '600', color: t.text },
    undo: { fontSize: 14, color: t.textMuted },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    amount: {
      backgroundColor: t.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 20,
      fontWeight: '600',
      color: t.text,
      minWidth: 90,
      fontVariant: ['tabular-nums'],
    },
    unit: { fontSize: 15, color: t.textMuted },
    feelings: { flexDirection: 'row', gap: 6 },
    feel: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, backgroundColor: t.muted },
    feelOn: { backgroundColor: t.accent },
    feelNum: { fontSize: 15, fontWeight: '600', color: t.text },
    feelLabel: { fontSize: 10, color: t.textMuted, marginTop: 1 },
    feelTextOn: { color: t.onAccent },
    save: {
      alignSelf: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: t.accent,
    },
    saveText: { color: t.onAccent, fontWeight: '700' },
    bar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: t.accent },
  });
