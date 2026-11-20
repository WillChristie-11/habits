import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Section } from '../types';
import { useStore } from '../store';
import { dayCompletion, layoutDay, visibleOn } from '../lib/schedule';
import { fromKey } from '../lib/dates';
import { ProgressRing } from '../components/ProgressRing';
import { SectionBlock } from '../components/SectionBlock';
import { Banners } from '../components/Banners';
import { WeekStrip } from '../components/WeekStrip';
import { useHabitActions } from '../components/useHabitActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { NextAnchorLine } from '../components/NextAnchorLine';
import { router } from 'expo-router';
import { intentionFrom } from '../lib/journal';
import { useThemedStyles, type Theme } from '../theme';

const SECTIONS: Section[] = ['morning', 'evening', 'week'];

/** Habits for one day (today by default), with the week strip on top. Anchors live on Schedule. */
export function TodayScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, pages } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  // Follow "today" across midnight unless a past day is being viewed.
  const date = picked && picked < ctx.today ? picked : ctx.today;
  const isToday = date === ctx.today;
  const [editMode, setEditMode] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const actions = useHabitActions(date);

  // The day's intention is simply the first line of that day's journal page, if it's short.
  const intention = intentionFrom(pages[date]);

  const tracked = useMemo(() => habits.filter((h) => h.kind === 'habit'), [habits]);
  const ring = dayCompletion(habits, idx, ctx, date);
  const layout = useMemo(
    () => layoutDay(tracked, editMode ? () => true : (h) => visibleOn(h, idx, ctx, date), { timeline: false }),
    [tracked, editMode, idx, ctx, date],
  );
  const hasRows = SECTIONS.some((sec) => layout.sections[sec].length > 0);

  const title = isToday
    ? 'Today'
    : fromKey(date).toLocaleDateString(undefined, { weekday: 'long' });
  const dateLine = fromKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        dateLine={dateLine}
        title={title}
        right={ring.total > 0 ? <ProgressRing done={ring.done} total={ring.total} /> : null}
        onAdd={isToday ? () => actions.openForm(null) : undefined}
        addLabel="Habit"
        links={
          isToday
            ? tracked.length > 0
              ? [{ label: editMode ? 'Done' : 'Edit', onPress: () => setEditMode((e) => !e), strong: editMode }]
              : []
            : [{ label: '← Back to today', onPress: () => setPicked(null), strong: true }]
        }
      />

      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {intention && (
          <Pressable onPress={() => router.push('/journal')} style={s.intention} accessibilityHint="Opens the journal">
            <Text style={s.intentionText}>{intention}</Text>
          </Pressable>
        )}
        {isToday && <NextAnchorLine onDone={(a) => actions.onToggle(a, 'pending')} onReady={actions.getReady} />}
        {isToday && <Banners onStart={actions.startTimer} />}
        {tracked.length > 0 && <WeekStrip selected={date} onSelect={(d) => setPicked(d === ctx.today ? null : d)} />}
        {!isToday && (
          <Text style={s.pastHint}>Editing {dateLine}. Tap a circle to mark it done, long-press for a rest day.</Text>
        )}

        {tracked.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Start small.</Text>
            <Text style={s.emptyText}>Add one habit for the morning and one for the evening.</Text>
            <Pressable style={s.emptyBtn} onPress={() => actions.openForm(null)}>
              <Text style={s.emptyBtnText}>Add a habit</Text>
            </Pressable>
          </View>
        ) : !hasRows && !editMode ? (
          <Text style={s.none}>Nothing due this day.</Text>
        ) : (
          SECTIONS.map((sec) => (
            <SectionBlock
              key={sec}
              section={sec}
              rows={layout.sections[sec]}
              date={date}
              editMode={editMode && isToday}
              setScrollEnabled={setScrollEnabled}
              onToggle={actions.onToggle}
              onOpen={actions.onOpen}
              onLongPress={actions.onLongPress}
              onDelete={actions.onDelete}
            />
          ))
        )}
        {editMode && <Text style={s.editHint}>Drag ≡ to reorder. Tap ✕ to remove.</Text>}
      </ScrollView>

      {actions.overlays}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    pastHint: { fontSize: 13, color: t.textMuted, marginTop: 12, marginHorizontal: 4, lineHeight: 18 },
    none: { fontSize: 15, color: t.textMuted, marginTop: 24, textAlign: 'center' },
    empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
    emptyTitle: { fontSize: 22, fontWeight: '600', color: t.text },
    emptyText: { fontSize: 15, color: t.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    emptyBtn: { marginTop: 20, backgroundColor: t.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
    emptyBtnText: { color: t.onAccent, fontWeight: '600', fontSize: 16 },
    intention: { marginTop: 10, paddingHorizontal: 4, paddingVertical: 4 },
    intentionText: { fontSize: 18, fontWeight: '600', color: t.text, lineHeight: 24 },
    editHint: { textAlign: 'center', color: t.textMuted, fontSize: 13, marginTop: 16 },
  });
