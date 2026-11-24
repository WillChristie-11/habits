import React, { useEffect, useRef, useState } from 'react';
import { useShowHints } from './useShowHints';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { DayState, Habit } from '../types';
import { FEELINGS } from '../types';
import { useStore } from '../store';
import { addDays, fromKey, last7, weekDays } from '../lib/dates';
import { weeklyGoal } from '../lib/journal';
import { DotRow } from './Dots';
import { ActivityIcon, activityLook } from './ActivityIcon';
import { SwipeRow } from './SwipeRow';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const AUTO_DISMISS_MS = 7000;
const UNDO_MS = 5000;
const unitLabel = (u: Habit['unit']) => (u === 'mi' ? 'mi' : u === 'min' ? 'min' : '');
const dayName = (d: string, today: string) =>
  d === today
    ? 'Today'
    : d === addDays(today, -1)
      ? 'Yesterday'
      : fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/**
 * Tiles (colour + SF Symbol, last 7 days, x/goal) and "＋ New". Tap = log now, with a 5 s Undo
 * bar and the amount/feeling panel once. Long-press: Edit · Log for another day · Delete.
 * Below: the last 7 days of logs; swipe one left to delete it.
 */
export function LogSheetBody({
  onClose,
  onEdit,
  onNew,
  onDelete,
}: {
  onClose(): void;
  onEdit(h: Habit): void;
  onNew(): void;
  onDelete(h: Habit): void;
}) {
  const showHints = useShowHints();
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { habits, idx, ctx, logActivity, unmark } = useStore();
  const activities = habits.filter((h) => h.kind === 'activity').sort((a, b) => a.order - b.order || a.id - b.id);
  const [panel, setPanel] = useState<{ habit: Habit; date: string; n: number } | null>(null);
  const [bar, setBar] = useState<{ habit: Habit; date: string; text: string; n: number } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!bar) return;
    const t = setTimeout(() => setBar((b) => (b?.n === bar.n ? null : b)), UNDO_MS);
    return () => clearTimeout(t);
  }, [bar]);

  const logged = (h: Habit, d: string) => idx.get(h.id)?.get(d)?.status === 'done';

  const log = async (h: Habit, date: string) => {
    const n = ++seq.current;
    if (logged(h, date)) {
      // One log per activity per day: say so, and don't reopen the panel.
      Haptics.selectionAsync().catch(() => {});
      setBar({
        habit: h,
        date,
        n,
        text: `${h.name} is already logged ${date === ctx.today ? 'today' : dayName(date, ctx.today)}`,
      });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await logActivity(h, date);
    setBar({
      habit: h,
      date,
      n,
      text: `Logged ${h.name}${date === ctx.today ? '' : ` · ${dayName(date, ctx.today)}`}`,
    });
    setPanel({ habit: h, date, n }); // once, right after logging
  };

  const undo = async () => {
    if (!bar) return;
    await unmark(bar.habit.id, bar.date);
    if (panel?.habit.id === bar.habit.id && panel.date === bar.date) setPanel(null);
    setBar(null);
  };

  const confirmDelete = (h: Habit) =>
    Alert.alert(`Delete ${h.name}?`, 'Its history will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(h) },
    ]);

  const anotherDay = (h: Habit) => {
    const days = Array.from({ length: 6 }, (_, i) => addDays(ctx.today, -(i + 1)));
    const options = [...days.map((d) => dayName(d, ctx.today)), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Log ${h.name} for…`, options, cancelButtonIndex: options.length - 1 },
      (i) => i < days.length && log(h, days[i]),
    );
  };

  const menu = (h: Habit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (Platform.OS !== 'ios') {
      Alert.alert(h.name, undefined, [
        { text: 'Edit', onPress: () => onEdit(h) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(h) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: h.name,
        options: ['Edit', 'Log for another day', 'Delete', 'Cancel'],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      (i) => {
        if (i === 0) onEdit(h);
        else if (i === 1) setTimeout(() => anotherDay(h), 350);
        else if (i === 2) confirmDelete(h);
      },
    );
  };

  const history = last7(ctx.today)
    .slice()
    .reverse()
    .map((d) => ({ date: d, items: activities.filter((h) => logged(h, d)) }))
    .filter((g) => g.items.length);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetScreen}>
        <View style={s.bar}>
          <Text style={s.barTitle}>Log</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={s.barDone}>Done</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 90 }]}
          keyboardShouldPersistTaps="handled"
        >
          {panel && (
            <AmountFeeling key={panel.n} habit={panel.habit} date={panel.date} onClose={() => setPanel(null)} />
          )}

          <View style={s.grid}>
            {activities.map((h) => (
              <Tile key={h.id} habit={h} onPress={() => log(h, ctx.today)} onLongPress={() => menu(h)} />
            ))}
            <Pressable
              onPress={onNew}
              style={({ pressed }) => [s.tile, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <View style={s.newBox}>
                <Text style={s.newPlus}>＋</Text>
              </View>
              <Text style={s.tileName}>New</Text>
            </Pressable>
          </View>
          {activities.length > 0 && showHints && (
            <Text style={s.hint}>Tap to log now · hold for Edit, another day or Delete</Text>
          )}

          {history.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Text style={s.section}>Last 7 days</Text>
              {history.map((g) => (
                <View key={g.date} style={{ marginTop: 10 }}>
                  <Text style={s.day}>{dayName(g.date, ctx.today)}</Text>
                  {g.items.map((h) => {
                    const rec = idx.get(h.id)?.get(g.date);
                    const amount = Number(rec?.meta?.amount) || 0;
                    const look = activityLook(h);
                    return (
                      <SwipeRow
                        key={h.id}
                        name={h.name}
                        actions={[]}
                        gap={6}
                        radius={12}
                        confirmTitle={`Delete this ${h.name} log?`}
                        confirmMessage={`${dayName(g.date, ctx.today)}'s ${h.name} will be removed.`}
                        onDelete={() => unmark(h.id, g.date)}
                      >
                        <View style={s.entry}>
                          <ActivityIcon color={look.color} icon={look.icon} size={30} label={h.name} />
                          <Text style={s.entryName}>{h.name}</Text>
                          <Text style={s.entryMeta}>
                            {[
                              amount ? `${amount} ${unitLabel(h.unit)}` : '',
                              rec?.feeling ? FEELINGS[rec.feeling - 1] : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                      </SwipeRow>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {bar && (
          <View style={[s.undoBar, { bottom: insets.bottom + 16 }]}>
            <Text style={s.undoText} numberOfLines={1}>
              {bar.text}
            </Text>
            <Pressable onPress={undo} hitSlop={10} accessibilityRole="button">
              <Text style={s.undoBtn}>Undo</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

/** One activity: colour + SF Symbol, name, the last 7 days as dots, and x/goal this week. */
function Tile({ habit, onPress, onLongPress }: { habit: Habit; onPress(): void; onLongPress(): void }) {
  const s = useThemedStyles(makeStyles);
  const { idx, ctx } = useStore();
  const look = activityLook(habit);
  const done = (d: string) => idx.get(habit.id)?.get(d)?.status === 'done';
  const states: DayState[] = last7(ctx.today).map((d) => (done(d) ? 'done' : 'none'));
  const goal = weeklyGoal(habit);
  const thisWeek = weekDays(ctx.today).filter((d) => d <= ctx.today && done(d)).length;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.96 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Log ${habit.name}`}
      accessibilityHint="Hold for Edit, Log for another day or Delete"
    >
      <ActivityIcon color={look.color} icon={look.icon} label={habit.name} />
      <Text style={s.tileName} numberOfLines={1}>
        {habit.name}
      </Text>
      <DotRow states={states} size={8} />
      {goal != null && (
        <Text style={s.goal}>
          {thisWeek}/{goal}
        </Text>
      )}
    </Pressable>
  );
}

/** Optional amount + feeling, shown once right after logging; hides itself unless touched. */
function AmountFeeling({ habit, date, onClose }: { habit: Habit; date: string; onClose(): void }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { idx, settings, setActivityAmount, rateFeeling } = useStore();
  const rec = idx.get(habit.id)?.get(date);
  const [amount, setAmount] = useState(rec?.meta?.amount != null ? String(rec.meta.amount) : '');
  const [feeling, setFeeling] = useState<number | null>(rec?.feeling ?? null);
  const [touched, setTouched] = useState(false);
  const [timer] = useState(() => new Animated.Value(1));
  const saved = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const save = async () => {
    if (saved.current) return;
    saved.current = true;
    const n = parseFloat(amount.replace(',', '.'));
    if (habit.unit) await setActivityAmount(habit, date, Number.isFinite(n) && n > 0 ? n : null);
    if (feeling != null) await rateFeeling(habit.id, feeling, date);
    closeRef.current();
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
    anim.start(({ finished }) => finished && closeRef.current());
    return () => anim.stop();
  }, [settings.feelingAutoDismiss, touched, timer]);

  return (
    <View style={s.panel}>
      <Text style={s.panelTitle}>How was {habit.name.toLowerCase()}?</Text>
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
          style={[s.timerBar, { width: timer.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginTop: 26 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    btn: { borderRadius: 20, borderWidth: 1.5, borderColor: t.accent, paddingHorizontal: 16, paddingVertical: 8 },
    btnText: { fontSize: 15, fontWeight: '600', color: t.accent },
    sheetScreen: { flex: 1, backgroundColor: t.background },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    barTitle: { fontSize: 24, fontWeight: '700', color: t.text },
    barDone: { fontSize: 16, fontWeight: '600', color: t.accent },
    content: { paddingHorizontal: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    tile: { width: '33.33%', alignItems: 'center', paddingVertical: 10, gap: 5 },
    tileName: { fontSize: 14, fontWeight: '600', color: t.text, maxWidth: '90%' },
    goal: { fontSize: 12, color: t.textMuted, fontVariant: ['tabular-nums'] },
    newBox: {
      width: 56,
      height: 56,
      borderRadius: 16,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: t.dotEmpty,
      alignItems: 'center',
      justifyContent: 'center',
    },
    newPlus: { fontSize: 24, color: t.textMuted },
    hint: { fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: 4 },
    section: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textMuted,
      marginLeft: 4,
    },
    day: { fontSize: 14, fontWeight: '700', color: t.text, marginBottom: 6, marginLeft: 4 },
    entry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.surface,
      borderRadius: 12,
      paddingVertical: 9,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    entryName: { fontSize: 16, fontWeight: '600', color: t.text, flex: 1 },
    entryMeta: { fontSize: 13, color: t.textMuted },
    undoBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: t.text,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    undoText: { flex: 1, color: t.background, fontSize: 15, fontWeight: '600' },
    undoBtn: { color: t.background, fontSize: 15, fontWeight: '800' },
    panel: { backgroundColor: t.surface, borderRadius: 16, padding: 14, marginTop: 6, gap: 10, overflow: 'hidden' },
    panelTitle: { fontSize: 15, fontWeight: '600', color: t.text },
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
    timerBar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: t.accent },
  });
