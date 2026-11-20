import React, { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { DayState, Habit, ItemKind } from '../types';
import { useStore } from '../store';
import { stateOn } from '../lib/schedule';
import { feelingContrast, wakeAnchor } from '../lib/insights';
import type { SwipeAction } from './SwipeRow';
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
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function useHabitActions(date?: string) {
  const { habits, idx, ctx, settings, mark, unmark, rateFeeling, removeHabit, afterPrompt, setAfterPrompt, setNote } =
    useStore();
  const day = date ?? ctx.today;
  const isToday = day === ctx.today;
  const [form, setForm] = useState<{ habit: Habit | null; kind: ItemKind } | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);
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
        if (afterPrompt?.habitId === h.id) setAfterPrompt(null);
        await unmark(h.id, day);
      } else {
        // Anchors get a success haptic from their own completion animation.
        if (h.kind === 'habit') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        // Sleep log: tapping Wake up today records the actual time.
        const wake = isToday && wakeAnchor(habits)?.id === h.id;
        await mark(h.id, 'done', day, wake ? { wokeAt: hhmm(new Date()) } : null);
        // Habits get the feeling card; anchors only when they ask what you did.
        if (h.kind === 'habit' || h.ask_note)
          setAfterPrompt({ habitId: h.id, date: day, feelings: h.kind === 'habit', note: h.ask_note, reason: 'done' });
      }
    },
    [mark, unmark, day, isToday, startTimer, habits, afterPrompt, setAfterPrompt],
  );

  /** Skip (rest day). Want habits then get a quick "how do you feel today?" for the feeling contrast. */
  const skip = useCallback(
    async (h: Habit) => {
      Haptics.selectionAsync().catch(() => {});
      await mark(h.id, 'skipped', day);
      if (h.kind === 'habit' && h.habit_kind === 'want')
        setAfterPrompt({ habitId: h.id, date: day, feelings: true, note: false, reason: 'skip' });
    },
    [mark, day, setAfterPrompt],
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

  /** The header's ＋: Habit / Anchor / Activity. */
  const openChooser = useCallback(() => {
    const kinds: ItemKind[] = ['habit', 'anchor', 'activity'];
    const labels = ['Habit', 'Anchor', 'Activity'];
    if (Platform.OS === 'web') return setForm({ habit: null, kind: 'habit' }); // no action sheets on web
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Add', options: [...labels, 'Cancel'], cancelButtonIndex: 3 },
        (i) => i < 3 && setForm({ habit: null, kind: kinds[i] }),
      );
    } else {
      Alert.alert('Add', undefined, [
        ...kinds.map((k, i) => ({ text: labels[i], onPress: () => setForm({ habit: null, kind: k }) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, []);

  const onOpen = useCallback(
    (h: Habit) => {
      if (h.kind === 'anchor') return setForm({ habit: h, kind: 'anchor' });
      // Today, unchecked, and its part of the day has passed → show why / minimum first.
      if (isToday && stateOn(h, idx, ctx.today, ctx) === 'pending') {
        const behind = behindPace([h], idx, ctx).length > 0;
        const has =
          h.why ||
          h.minimum_version ||
          h.messages.length ||
          settings.reminders.messages.length ||
          feelingContrast(h, idx);
        if (has && sectionPassed(h, habits, settings.reminders, new Date(), behind)) return setMotivation(h);
      }
      setDetail(h);
    },
    [isToday, idx, ctx, habits, settings.reminders],
  );

  const onDelete = useCallback((h: Habit) => removeHabit(h.id), [removeHabit]);

  /** Swipe right on a row: Skip (or Undo skip) and Get ready; anchors also get Edit. */
  const swipeActions = useCallback(
    (h: Habit): SwipeAction[] => {
      const skipped = stateOn(h, idx, day, ctx) === 'skipped';
      const out: SwipeAction[] = [
        {
          label: skipped ? 'Undo skip' : 'Skip',
          onPress: () => {
            if (skipped) {
              Haptics.selectionAsync().catch(() => {});
              unmark(h.id, day);
            } else skip(h);
          },
        },
      ];
      if (isToday) out.push({ label: 'Get ready', tone: 'accent', onPress: () => getReady(h) });
      if (h.kind === 'anchor') out.push({ label: 'Edit', onPress: () => setForm({ habit: h, kind: 'anchor' }) });
      return out;
    },
    [idx, ctx, day, isToday, unmark, skip, getReady],
  );

  const dismissPrompt = useCallback(() => setAfterPrompt(null), [setAfterPrompt]);
  const promptHabit = afterPrompt ? habits.find((x) => x.id === afterPrompt.habitId) : undefined;

  const overlays = (
    <>
      {afterPrompt && promptHabit && (
        <FeelingPicker
          key={`${afterPrompt.habitId}-${afterPrompt.date}-${afterPrompt.reason}`}
          title={
            afterPrompt.reason === 'skip' ? (
              <>How do you feel today?</>
            ) : afterPrompt.feelings ? (
              <>
                How do you feel after <Text style={{ fontWeight: '600' }}>{promptHabit.name}</Text>?
              </>
            ) : (
              <Text style={{ fontWeight: '600' }}>{promptHabit.name}</Text>
            )
          }
          feelings={afterPrompt.feelings}
          note={afterPrompt.note}
          autoDismiss={settings.feelingAutoDismiss}
          onDismiss={dismissPrompt}
          onPick={(f) => rateFeeling(afterPrompt.habitId, f, afterPrompt.date)}
          onNote={(text) => setNote(afterPrompt.habitId, afterPrompt.date, text)}
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
          skip(h);
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

  return { onToggle, onOpen, onDelete, swipeActions, skip, openForm, openChooser, startTimer, getReady, overlays };
}
