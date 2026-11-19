import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { layoutDay, visibleToday } from '../lib/schedule';
import { TimelineBlock } from '../components/TimelineBlock';
import { useHabitActions } from '../components/useHabitActions';
import { useThemedStyles, type Theme } from '../theme';

/** Today's plan: anchors and timed habits at their times, flexible habits in their windows. */
export function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, now } = useStore();
  const [editMode, setEditMode] = useState(false);
  const actions = useHabitActions();

  const layout = useMemo(
    () => layoutDay(habits, editMode ? () => true : (h) => visibleToday(h, idx, ctx)),
    [habits, editMode, idx, ctx],
  );
  const anchors = habits.filter((h) => h.kind === 'anchor').length;
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.date}>{dateLine}</Text>
        <Text style={s.title}>Schedule</Text>
        <View style={s.actions}>
          {habits.length > 0 && (
            <Pressable onPress={() => setEditMode((e) => !e)} hitSlop={8}>
              <Text style={[s.action, editMode && { fontWeight: '600' }]}>{editMode ? 'Done' : 'Edit'}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => actions.openForm(null, 'anchor')} hitSlop={8}>
            <Text style={s.action}>＋ Anchor</Text>
          </Pressable>
          <Pressable onPress={() => actions.openForm(null, 'habit')} hitSlop={8}>
            <Text style={s.action}>＋ Habit</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}>
        {anchors === 0 && (
          <View style={s.tip}>
            <Text style={s.tipTitle}>Add the fixed points of your day</Text>
            <Text style={s.tipText}>
              Anchors like Wake up, Breakfast or Work give the day its shape. Habits stay flexible in their
              Morning or Evening window unless you give them a time, or stack them after an anchor.
            </Text>
          </View>
        )}
        <TimelineBlock
          layout={layout}
          editMode={editMode}
          onToggle={actions.onToggle}
          onOpen={actions.onOpen}
          onLongPress={actions.onLongPress}
          onDelete={actions.onDelete}
        />
        {!editMode && anchors > 0 && <Text style={s.hint}>Tap an anchor to dismiss it · long-press to edit</Text>}
      </ScrollView>

      {actions.overlays}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    date: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
    title: { fontSize: 32, fontWeight: '700', color: t.text, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 18, marginTop: 6 },
    action: { fontSize: 15, color: t.accent },
    tip: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginBottom: 16 },
    tipTitle: { fontSize: 15, fontWeight: '600', color: t.text },
    tipText: { fontSize: 14, color: t.textMuted, marginTop: 4, lineHeight: 20 },
    hint: { textAlign: 'center', color: t.textMuted, fontSize: 12, marginTop: 14 },
  });
