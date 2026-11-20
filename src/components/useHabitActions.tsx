import React, { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { DayState, Habit, ItemKind } from '../types';
import { useStore } from '../store';
import { stateOn } from '../lib/schedule';
import { behindPace, sectionPassed } from '../lib/reminders';
import { FeelingPicker } from './FeelingPicker';
import { MotivationSheet } from './MotivationSheet';
import { HabitForm } from '../screens/HabitForm';
import { HabitDetail } from '../screens/HabitDetail';

/**
 * Everything a list of habits/anchors does when tapped, for one day (today or a past day):
 * check-off + feeling card, skip, details, motivation sheet, add/edit form, delete.
 * Returns the handlers plus the sheets to render once at the bottom of the screen.
 */
export function useHabitActions(date?: string) {
  const { idx, ctx, settings, mark, unmark, rateFeeling, removeHabit } = useStore();
  const day = date ?? ctx.today;
  const isToday = day === ctx.today;
  const [form, setForm] = useState<{ habit: Habit | null; kind: ItemKind } | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);
  const [feeling, setFeeling] = useState<{ habit: Habit; date: string } | null>(null);
  const [motivation, setMotivation] = useState<Habit | null>(null);

  /** Open the full-screen session timer (starting it is what counts for avoid habits). */
  const startTimer = useCallback(
    (h: Habit) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      router.push({ pathname: '/timer', params: { habitId: String(h.id), date: day } });
    },
    [day],
  );

  const onToggle = useCallback(
    async (h: Habit, state: DayState) => {
      // Avoid habits: today, an unchecked circle starts a session instead of just ticking.
      if (h.kind === 'habit' && h.habit_kind === 'avoid' && isToday && state === 'pending') {
        startTimer(h);
        return;
      }
      if (state === 'done' || state === 'skipped') {
        Haptics.selectionAsync().catch(() => {});
        setFeeling((f) => (f?.habit.id === h.id ? null : f));
        await unmark(h.id, day);
      } else {
        // Anchors get a success haptic from their own completion animation.
        if (h.kind === 'habit') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await mark(h.id, 'done', day);
        // Anchors are just dismissed: no feeling score.
        if (h.kind === 'habit') setFeeling({ habit: h, date: day });
      }
    },
    [mark, unmark, day, isToday, startTimer],
  );

  const openForm = useCallback((habit: Habit | null, kind: ItemKind = 'habit') => setForm({ habit, kind }), []);

  /** The "Get ready" transition countdown before an item. */
  const getReady = useCallback(
    (h: Habit) => {
      Haptics.selectionAsync().catch(() => {});
      router.push({ pathname: '/ready', params: { habitId: String(h.id), date: day } });
    },
    [day],
  );

  const onOpen = useCallback(
    (h: Habit) => {
      if (h.kind === 'anchor') {
        // Long-press on an activity: get ready for it, or edit it.
        if (Platform.OS === 'ios' && isToday) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          ActionSheetIOS.showActionSheetWithOptions(
            { title: h.name, options: [`Get ready (${h.ready_minutes} min)`, 'Edit', 'Cancel'], cancelButtonIndex: 2 },
            (i) => {
              if (i === 0) getReady(h);
              if (i === 1) setForm({ habit: h, kind: 'anchor' });
            },
          );
          return;
        }
        return setForm({ habit: h, kind: 'anchor' });
      }
      // Today, unchecked, and its part of the day has passed → show why / minimum first.
      if (isToday && stateOn(h, idx, ctx.today, ctx) === 'pending') {
        const behind = behindPace([h], idx, ctx).length > 0;
        const has = h.why || h.minimum_version || h.messages.length || settings.reminders.messages.length;
        if (has && sectionPassed(h, settings.reminders, new Date(), behind)) return setMotivation(h);
      }
      setDetail(h);
    },
    [isToday, idx, ctx, settings.reminders, getReady],
  );

  const onDelete = useCallback(
    (h: Habit) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      removeHabit(h.id);
    },
    [removeHabit],
  );

  const onLongPress = useCallback(
    (h: Habit) => {
      const skipped = stateOn(h, idx, day, ctx) === 'skipped';
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const action = skipped ? 'Undo skip' : isToday ? 'Skip today (rest day)' : 'Mark as rest day';
      const run = () => (skipped ? unmark(h.id, day) : mark(h.id, 'skipped', day));
      const ready = `Get ready (${h.ready_minutes} min)`;
      if (Platform.OS === 'ios') {
        const options = isToday ? [ready, action, 'Details', 'Cancel'] : [action, 'Details', 'Cancel'];
        ActionSheetIOS.showActionSheetWithOptions({ title: h.name, options, cancelButtonIndex: options.length - 1 }, (i) => {
          const picked = options[i];
          if (picked === ready) getReady(h);
          else if (picked === action) run();
          else if (picked === 'Details') setDetail(h);
        });
      } else {
        Alert.alert(h.name, undefined, [
          ...(isToday ? [{ text: ready, onPress: () => getReady(h) }] : []),
          { text: action, onPress: run },
          { text: 'Details', onPress: () => setDetail(h) },
          { text: 'Cancel', style: 'cancel' as const },
        ]);
      }
    },
    [idx, ctx, day, isToday, mark, unmark, getReady],
  );

  const dismissFeeling = useCallback(() => setFeeling(null), []);

  const overlays = (
    <>
      {feeling && (
        <FeelingPicker
          key={feeling.habit.id + feeling.date}
          habitName={feeling.habit.name}
          autoDismiss={settings.feelingAutoDismiss}
          onDismiss={dismissFeeling}
          onPick={(f) => {
            rateFeeling(feeling.habit.id, f, feeling.date);
            setFeeling(null);
          }}
        />
      )}
      <MotivationSheet
        habit={motivation}
        onClose={() => setMotivation(null)}
        onDone={(h) => {
          setMotivation(null);
          onToggle(h, 'pending');
        }}
        onStart={(h) => {
          setMotivation(null);
          setTimeout(() => startTimer(h), 250);
        }}
        onSkip={(h) => {
          setMotivation(null);
          mark(h.id, 'skipped', day);
        }}
        onDetails={(h) => {
          setMotivation(null);
          setTimeout(() => setDetail(h), 300);
        }}
      />
      <HabitForm
        visible={!!form}
        habit={form?.habit ?? null}
        defaultKind={form?.kind ?? 'habit'}
        onClose={() => setForm(null)}
      />
      <HabitDetail
        habit={detail}
        onStart={(h) => {
          setDetail(null);
          setTimeout(() => startTimer(h), 350);
        }}
        onReady={(h) => {
          setDetail(null);
          setTimeout(() => getReady(h), 350);
        }}
        onClose={() => setDetail(null)}
        onEdit={(h) => {
          setDetail(null);
          // Let the sheet finish closing before presenting another.
          setTimeout(() => setForm({ habit: h, kind: h.kind }), 350);
        }}
      />
    </>
  );

  return { onToggle, onOpen, onLongPress, onDelete, openForm, startTimer, getReady, overlays };
}
