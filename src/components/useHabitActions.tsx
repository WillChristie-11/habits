import React, { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { DayState, Habit, ItemKind } from '../types';
import { useStore } from '../store';
import { stateOn } from '../lib/schedule';
import { wakeAnchor } from '../lib/insights';
import { windDownAnchor } from '../lib/dayClose';
import { promptPriority } from './Priorities';
import { useHabitTimer } from './useHabitTimer';
import type { SwipeAction } from './SwipeRow';
import { FeelingPicker } from './FeelingPicker';
import { AvoidAfterCard } from './AvoidAfterCard';
import { HabitForm } from '../screens/HabitForm';
import { HabitDetail } from '../screens/HabitDetail';

/**
 * Everything a list of habits/anchors does when tapped, for one day (today or a past day):
 * check-off + feeling card, skip, details, motivation sheet, add/edit form, delete.
 * Returns the handlers plus the sheets to render once at the bottom of the screen.
 */
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function useHabitActions(date?: string) {
  const {
    habits,
    idx,
    ctx,
    settings,
    mark,
    unmark,
    rateFeeling,
    removeHabit,
    afterPrompt,
    setAfterPrompt,
    setNote,
    priorities,
    addPriority,
    dayCloses,
  } = useStore();
  const day = date ?? ctx.today;
  const isToday = day === ctx.today;
  const [form, setForm] = useState<{ habit: Habit | null; kind: ItemKind } | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);

  /** A habit's timers: 0 = Focus · 25 (Meditate · 10 for meditation), 1 = Clear head · 5 (or Focus). */
  const habitTimer = useHabitTimer();
  const startTimer = useCallback((h: Habit, which: 0 | 1 = 0) => habitTimer(h, which), [habitTimer]);

  const onToggle = useCallback(
    async (h: Habit, state: DayState) => {
      // Avoid habits: today, an unchecked circle opens Focus for it (via "How heavy does this feel?").
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
        // Checking off Wind down today opens Close the day (once it's saved, not again that day).
        const windDown = isToday && windDownAnchor(habits)?.id === h.id && !dayCloses.some((c) => c.date === day);
        await mark(h.id, 'done', day, wake ? { wokeAt: hhmm(new Date()) } : null);
        // Let the anchor's completion animation play, then the sheet.
        if (windDown) return void setTimeout(() => router.push({ pathname: '/close', params: { date: day } }), 600);
        // Habits get the feeling card; anchors only when they ask what you did.
        if (h.kind === 'habit' || h.ask_note)
          setAfterPrompt({ habitId: h.id, date: day, feelings: h.kind === 'habit', note: h.ask_note, reason: 'done' });
      }
    },
    [mark, unmark, day, isToday, startTimer, habits, dayCloses, afterPrompt, setAfterPrompt],
  );

  /** Skip (rest day). Want habits then get a quick "how do you feel today?" for the feeling contrast. */
  const skip = useCallback(
    async (h: Habit) => {
      Haptics.selectionAsync().catch(() => {});
      // Avoid habits: "Not today is allowed. What's in the way?" (the sheet does the skip).
      if (h.kind === 'habit' && h.habit_kind === 'avoid')
        return void router.push({ pathname: '/nottoday', params: { habitId: String(h.id), date: day } });
      await mark(h.id, 'skipped', day);
      if (h.kind === 'habit' && h.habit_kind === 'want')
        setAfterPrompt({ habitId: h.id, date: day, feelings: true, note: false, reason: 'skip' });
    },
    [mark, day, setAfterPrompt],
  );

  const openForm = useCallback((habit: Habit | null, kind: ItemKind = 'habit') => setForm({ habit, kind }), []);

  /** The header's ＋: Habit / Anchor / Activity. */
  const openChooser = useCallback(() => {
    const kinds: ItemKind[] = ['habit', 'anchor', 'activity'];
    const labels = ['Habit', 'Anchor', 'Activity'];
    if (Platform.OS === 'web') return setForm({ habit: null, kind: 'habit' }); // no action sheets on web
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Add', options: [...labels, 'Priority', 'Cancel'], cancelButtonIndex: 4 },
        (i) => {
          if (i < 3) setForm({ habit: null, kind: kinds[i] });
          else if (i === 3) setTimeout(() => promptPriority(priorities, addPriority), 300);
        },
      );
    } else {
      Alert.alert('Add', undefined, [
        ...kinds.map((k, i) => ({ text: labels[i], onPress: () => setForm({ habit: null, kind: k }) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [priorities, addPriority]);

  /** Tapping a habit's name: its detail sheet (with Edit). Anchors go straight to their form. */
  const onOpen = useCallback((h: Habit) => {
    if (h.kind === 'anchor') return setForm({ habit: h, kind: 'anchor' });
    setDetail(h);
  }, []);

  const onDelete = useCallback((h: Habit) => removeHabit(h.id), [removeHabit]);

  /** Swipe right on a row: Edit and Skip (or Undo skip). */
  const swipeActions = useCallback(
    (h: Habit): SwipeAction[] => {
      const skipped = stateOn(h, idx, day, ctx) === 'skipped';
      const out: SwipeAction[] = [
        { label: 'Edit', onPress: () => setForm({ habit: h, kind: h.kind }) },
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
      return out;
    },
    [idx, ctx, day, unmark, skip],
  );

  const dismissPrompt = useCallback(() => setAfterPrompt(null), [setAfterPrompt]);
  const promptHabit = afterPrompt ? habits.find((x) => x.id === afterPrompt.habitId) : undefined;

  const overlays = (
    <>
      {afterPrompt && promptHabit && afterPrompt.avoid && (
        <AvoidAfterCard
          key={`${afterPrompt.habitId}-${afterPrompt.date}-avoid`}
          habit={promptHabit}
          date={afterPrompt.date}
          autoDismiss={settings.feelingAutoDismiss}
          onDismiss={dismissPrompt}
        />
      )}
      {afterPrompt && promptHabit && !afterPrompt.avoid && (
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
      <HabitForm
        visible={!!form}
        habit={form?.habit ?? null}
        defaultKind={form?.kind ?? 'habit'}
        onClose={() => setForm(null)}
      />
      <HabitDetail
        habit={detail}
        onStart={(h, which) => {
          setDetail(null);
          setTimeout(() => startTimer(h, which), 350);
        }}
        onDone={(h) => {
          setDetail(null);
          onToggle(h, 'pending');
        }}
        onSkip={(h) => {
          setDetail(null);
          skip(h);
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

  return { onToggle, onOpen, onDelete, swipeActions, skip, openForm, openChooser, startTimer, overlays };
}
