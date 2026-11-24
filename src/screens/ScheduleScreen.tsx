import { useShowHints } from '../components/useShowHints';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { counts, layoutDay, visibleToday } from '../lib/schedule';
import { TimelineBlock } from '../components/TimelineBlock';
import { useHabitActions } from '../components/useHabitActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { FloatingAdd } from '../components/FloatingAdd';
import { useThemedStyles, type Theme } from '../theme';

/** Today's plan: anchors and timed habits at their times, flexible habits in their windows. */
export function ScheduleScreen() {
  const showHints = useShowHints();
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, now } = useStore();
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const actions = useHabitActions();

  const layout = useMemo(
    // Activities and cut-backs are logged, not scheduled.
    () =>
      layoutDay(
        habits.filter((h) => counts(h) || h.kind === 'anchor'),
        (h) => visibleToday(h, idx, ctx),
      ),
    [habits, idx, ctx],
  );
  const anchors = habits.filter((h) => h.kind === 'anchor').length;
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScreenHeader dateLine={dateLine} title="Schedule" />

      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}
      >
        {anchors === 0 && (
          <View style={s.tip}>
            <Text style={s.tipTitle}>Add the fixed points of your day</Text>
            <Text style={s.tipText}>
              Anchors like Wake up, Breakfast or Work give the day its shape. Habits stay flexible in their Morning or
              Evening window unless you give them a time, or stack them after an anchor.
            </Text>
          </View>
        )}
        <TimelineBlock
          layout={layout}
          setScrollEnabled={setScrollEnabled}
          onToggle={actions.onToggle}
          onOpen={actions.onOpen}
          onDelete={actions.onDelete}
          swipeActions={actions.swipeActions}
        />
        {anchors > 0 && showHints && (
          <Text style={s.hint}>Tap an anchor to mark it done · swipe right for Edit or Skip · left to delete</Text>
        )}
      </ScrollView>

      <FloatingAdd onPress={actions.openChooser} />
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
