import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { keptLines } from '../lib/insights';
import { todaysStep } from '../lib/goals';
import { weekStart } from '../lib/dates';
import { FROM_HABIT } from '../lib/timers';
import { useHabitTimer } from './useHabitTimer';
import { useTheme, useThemedStyles, type Theme } from '../theme';

/** Minutes for "Just open it": a short Focus round (stopping early still counts). */
export const DOOR_MINUTES = 2;

/**
 * The goal card at the top of Today (it replaces Today's door): "Toward: <goal>" and "Today's
 * step: <step>". The step is the next rung of a linked avoid habit (Just open it · 2 min, Focus
 * · 25, Not today…) or a step typed for today (Done, Not today). Collapses to one line once done
 * or passed on. Tap the goal for its page.
 */
export function GoalCard() {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const store = useStore();
  const { habits, idx, ctx, goals, goalSteps, priorities, togglePriority, setGoalStepStatus, addGoalStep } = store;
  const habitTimer = useHabitTimer();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const step = todaysStep({
    goals,
    steps: goalSteps,
    priorities,
    habits,
    idx,
    ctx,
    weekStartKey: weekStart(ctx.today),
  });

  if (!step) {
    return (
      <Pressable onPress={() => router.push('/goals')} style={s.invite} accessibilityRole="button">
        <Text style={s.inviteText}>＋ Set a long-term goal</Text>
      </Pressable>
    );
  }

  const goal = step.goal;
  const openGoal = () => goal && router.push({ pathname: '/goal', params: { id: String(goal.id) } });
  const toward = goal ? (
    <Pressable onPress={openGoal} hitSlop={6} accessibilityRole="button" accessibilityHint="Opens the goal">
      <Text style={s.label} numberOfLines={1}>
        Toward: <Text style={s.goalName}>{goal.name}</Text> ›
      </Text>
    </Pressable>
  ) : (
    <View style={s.row}>
      <Text style={s.label}>Today’s step</Text>
      <Pressable onPress={() => router.push('/goals')} hitSlop={6} accessibilityRole="button">
        <Text style={s.link}>Set a goal ›</Text>
      </Pressable>
    </View>
  );

  if (step.kind !== 'none' && step.state !== 'open') {
    return (
      <Pressable onPress={openGoal} style={s.collapsed} accessibilityRole="button">
        <Text style={s.collapsedText} numberOfLines={1}>
          {goal ? `Toward ${goal.name} · ` : 'Today’s step · '}
          {step.text} · {step.state === 'done' ? 'done' : 'not today'}
        </Text>
      </Pressable>
    );
  }

  if (step.kind === 'none') {
    const save = async () => {
      if (text.trim()) await addGoalStep(step.goal.id, text);
      setText('');
      setTyping(false);
    };
    return (
      <View style={s.card}>
        {toward}
        {typing ? (
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder="Today’s step toward it"
            placeholderTextColor={t.textMuted}
            keyboardAppearance={t.dark ? 'dark' : 'light'}
            returnKeyType="done"
            onSubmitEditing={save}
            onBlur={save}
            style={s.input}
            maxLength={120}
          />
        ) : (
          <Pressable onPress={() => setTyping(true)} style={s.pick} accessibilityRole="button">
            <Text style={s.pickText}>＋ Pick today’s step</Text>
          </Pressable>
        )}
        <Text style={s.hint}>It also goes on today’s priorities.</Text>
      </View>
    );
  }

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  if (step.kind === 'typed') {
    const p = priorities.find((x) => x.id === step.step.priority_id);
    return (
      <View style={s.card}>
        {toward}
        <Text style={s.headline}>Today’s step: {step.text}</Text>
        <View style={s.row}>
          <Pressable
            onPress={() => {
              tap();
              if (p) togglePriority(p);
            }}
            style={({ pressed }) => [s.primary, s.flex, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.primaryText}>Done</Text>
          </Pressable>
          <Pressable
            onPress={() => setGoalStepStatus(step.step.id, 'not_today')}
            style={({ pressed }) => [s.secondary, s.flex, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.secondaryText}>Not today</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const h = step.habit;
  const line = keptLines(h, idx)[0];
  return (
    <View style={s.card}>
      {toward}
      <Text style={s.habitName}>{h.name}</Text>
      <Text style={s.headline}>Today’s step: {step.text}</Text>
      {line && <Text style={s.quote}>“{line.text}”</Text>}
      <Pressable
        onPress={() => {
          tap();
          // Through "How heavy does this feel?", then a short Focus round.
          router.push({
            pathname: '/weigh',
            params: { habitId: String(h.id), date: ctx.today, minutes: String(DOOR_MINUTES) },
          });
        }}
        style={({ pressed }) => [s.primary, pressed && s.pressed]}
        accessibilityRole="button"
      >
        <Text style={s.primaryText}>Just open it · {DOOR_MINUTES} min</Text>
      </Pressable>
      <View style={s.row}>
        <Pressable
          onPress={() => habitTimer(h, 0)}
          style={({ pressed }) => [s.secondary, s.flex, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Text style={s.secondaryText}>Focus · {FROM_HABIT.focus}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/nottoday', params: { habitId: String(h.id), date: ctx.today } })}
          style={({ pressed }) => [s.secondary, s.flex, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Text style={s.secondaryText}>Not today…</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.surface, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    invite: { marginTop: 12, paddingVertical: 6 },
    inviteText: { fontSize: 15, color: t.textMuted },
    collapsed: { marginTop: 12, paddingHorizontal: 4, paddingVertical: 4 },
    collapsedText: { fontSize: 14, color: t.textMuted },
    label: { fontSize: 13, fontWeight: '600', color: t.textMuted },
    goalName: { color: t.text },
    link: { fontSize: 13, fontWeight: '600', color: t.accent },
    habitName: { fontSize: 14, color: t.textMuted },
    headline: { fontSize: 19, fontWeight: '700', color: t.text },
    quote: { fontSize: 15, fontStyle: 'italic', color: t.textMuted },
    pick: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: t.dotEmpty,
      borderRadius: 22,
      paddingVertical: 11,
      paddingHorizontal: 16,
      alignSelf: 'flex-start',
    },
    pickText: { fontSize: 16, color: t.text },
    input: { fontSize: 17, color: t.text, borderBottomWidth: 1, borderColor: t.border, paddingVertical: 8 },
    hint: { fontSize: 12, color: t.textMuted },
    row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
    flex: { flex: 1 },
    primary: { marginTop: 4, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '600' },
    secondary: { backgroundColor: t.background, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    secondaryText: { color: t.text, fontSize: 15, fontWeight: '600' },
    pressed: { opacity: 0.8 },
  });
