import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { layoutDay, visibleToday } from '../lib/schedule';
import { TimelineBlock } from '../components/TimelineBlock';
import { useHabitActions } from '../components/useHabitActions';
import { ScreenHeader } from '../components/ScreenHeader';
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
      <ScreenHeader
        dateLine={dateLine}
        title="Schedule"
        onAdd={() => actions.openForm(null, 'anchor')}
        addLabel="Anchor"
        links={[
          { label: '＋ Habit', onPress: () => actions.openForm(null, 'habit') },
          ...(habits.length > 0
            ? [{ label: editMode ? 'Done' : 'Edit', onPress: () => setEditMode((e) => !e), strong: editMode }]
            : []),
        ]}
      />

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
    tip: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginBottom: 16 },
    tipTitle: { fontSize: 15, fontWeight: '600', color: t.text },
    tipText: { fontSize: 14, color: t.textMuted, marginTop: 4, lineHeight: 20 },
    hint: { textAlign: 'center', color: t.textMuted, fontSize: 12, marginTop: 14 },
  });
