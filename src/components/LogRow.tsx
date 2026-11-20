import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { Habit } from '../types';
import { FEELINGS } from '../types';
import { useStore } from '../store';
import { addDays, fromKey } from '../lib/dates';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const AUTO_DISMISS_MS = 7000;
const unitLabel = (u: Habit['unit']) => (u === 'mi' ? 'mi' : u === 'min' ? 'min' : '');

/**
 * "＋ Log" at the bottom of Today: opens a list of activities (+ "New…"). One tap logs it for today
 * with a light haptic, then offers an optional amount + feeling sheet. Long-press an activity to log
 * an earlier day, or to edit or delete it. Today's logs show as chips beside the button.
 * Activities are never expected, missed or counted.
 */
export function LogRow({
  onEdit,
  onDelete,
  onNew,
  trailing,
}: {
  onEdit(h: Habit): void;
  onDelete(h: Habit): void;
  onNew(): void;
  /** Shown at the right end of the row (the "Tempted?" button). */
  trailing?: React.ReactNode;
}) {
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { habits, idx, ctx, logActivity } = useStore();
  const activities = habits.filter((h) => h.kind === 'activity').sort((a, b) => a.order - b.order || a.id - b.id);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<{ habit: Habit; date: string } | null>(null);

  const logged = (h: Habit) => idx.get(h.id)?.get(ctx.today)?.status === 'done';
  const log = async (h: Habit, date: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await logActivity(h, date);
    setSheet({ habit: h, date });
  };
  const pick = (h: Habit) => {
    setOpen(false);
    if (logged(h)) setSheet({ habit: h, date: ctx.today });
    else log(h, ctx.today);
  };

  const more = (h: Habit) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, -i));
    const label = (d: string, i: number) =>
      i === 0
        ? 'Today'
        : i === 1
          ? 'Yesterday'
          : fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const confirmDelete = () =>
      Alert.alert(`Delete ${h.name}?`, 'Its history will be removed.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(h) },
      ]);
    if (Platform.OS !== 'ios') return;
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
        if (i === options.length - 1) return;
        setOpen(false);
        if (i < days.length) log(h, days[i]);
        else if (i === days.length) setTimeout(() => onEdit(h), 300);
        else confirmDelete();
      },
    );
  };

  const todays = activities.filter(logged);

  return (
    <View style={s.wrap}>
      <View style={s.buttons}>
        <Pressable
          onPress={() => (activities.length ? setOpen(true) : onNew())}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Log an activity"
        >
          <Text style={s.btnText}>＋ Log</Text>
        </Pressable>
        {todays.map((h) => {
          const amount = Number(idx.get(h.id)?.get(ctx.today)?.meta?.amount) || 0;
          return (
            <Pressable
              key={h.id}
              onPress={() => setSheet({ habit: h, date: ctx.today })}
              style={({ pressed }) => [s.btn, s.btnLogged, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`${h.name}, logged today`}
            >
              <Text style={[s.btnText, s.btnTextLogged]}>
                ✓ {h.name}
                {amount ? ` · ${amount} ${unitLabel(h.unit)}` : ''}
              </Text>
            </Pressable>
          );
        })}
        {trailing && <View style={{ marginLeft: 'auto' }}>{trailing}</View>}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[s.list, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={s.listTitle}>Log</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {activities.map((h) => (
              <Pressable
                key={h.id}
                onPress={() => pick(h)}
                onLongPress={() => more(h)}
                delayLongPress={350}
                style={({ pressed }) => [s.item, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityHint="Long-press to log an earlier day, edit or delete"
              >
                <Text style={s.itemText}>{h.name}</Text>
                <Text style={s.itemMeta}>{logged(h) ? '✓ today' : ''}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setOpen(false);
                setTimeout(onNew, 300);
              }}
              style={({ pressed }) => [s.item, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Text style={[s.itemText, s.newText]}>New…</Text>
            </Pressable>
          </ScrollView>
          <Text style={s.listHint}>Tap to log today · long-press for an earlier day, edit or delete</Text>
        </View>
      </Modal>

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
    scrim: { flex: 1, backgroundColor: t.scrim },
    list: {
      backgroundColor: t.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingHorizontal: 16,
    },
    listTitle: { fontSize: 20, fontWeight: '700', color: t.text, marginBottom: 8, marginLeft: 4 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: t.surface,
      borderRadius: 12,
      marginBottom: 6,
    },
    itemText: { fontSize: 17, fontWeight: '600', color: t.text },
    itemMeta: { fontSize: 13, color: t.accent, fontWeight: '600' },
    newText: { color: t.accent },
    listHint: { fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: 8 },
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
