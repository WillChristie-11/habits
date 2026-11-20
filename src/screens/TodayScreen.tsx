import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { dayCompletion, nextAnchor, stateOn, todayGroups, visibleOn } from '../lib/schedule';
import { fromKey } from '../lib/dates';
import { ProgressRing } from '../components/ProgressRing';
import { SectionBlock } from '../components/SectionBlock';
import { Banners } from '../components/Banners';
import { WeekStrip } from '../components/WeekStrip';
import { useHabitActions } from '../components/useHabitActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { WeekIntentionLine } from '../components/WeekIntention';
import { LogRow } from '../components/LogRow';
import { AnchorRow } from '../components/AnchorRow';
import { SwipeRow } from '../components/SwipeRow';
import { useThemedStyles, type Theme } from '../theme';

/**
 * One day (today by default), grouped by anchors in time order: each anchor is a header you tap
 * to mark done, with the habits stacked after it underneath. Then Anytime and This week.
 */
export function TodayScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, now } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  // Follow "today" across midnight unless a past day is being viewed.
  const date = picked && picked < ctx.today ? picked : ctx.today;
  const isToday = date === ctx.today;
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const actions = useHabitActions(date);

  const items = useMemo(() => habits.filter((h) => h.kind === 'habit' || h.kind === 'anchor'), [habits]);
  const tracked = useMemo(() => items.filter((h) => h.kind === 'habit'), [items]);
  const dayCtx = useMemo(() => ({ ...ctx, today: date }), [ctx, date]);
  const groups = useMemo(() => todayGroups(items, (h) => visibleOn(h, idx, ctx, date)), [items, idx, ctx, date]);
  const notToday = tracked.filter((h) => !visibleOn(h, idx, ctx, date));
  const ring = dayCompletion(habits, idx, ctx, date);
  const focus = isToday ? nextAnchor(habits, idx, ctx, now.getHours() * 60 + now.getMinutes()) : null;
  const empty = groups.anchors.length === 0 && groups.anytime.length === 0 && groups.week.length === 0;

  const title = isToday ? 'Today' : fromKey(date).toLocaleDateString(undefined, { weekday: 'long' });
  const dateLine = fromKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const common = {
    date,
    setScrollEnabled,
    onToggle: actions.onToggle,
    onOpen: actions.onOpen,
    onDelete: actions.onDelete,
    swipeActions: actions.swipeActions,
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        dateLine={dateLine}
        title={title}
        right={ring.total > 0 ? <ProgressRing done={ring.done} total={ring.total} /> : null}
        onAdd={isToday ? actions.openChooser : undefined}
        links={isToday ? [] : [{ label: '← Back to today', onPress: () => setPicked(null), strong: true }]}
      />

      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {isToday && <WeekIntentionLine />}
        {isToday && <Banners onStart={actions.startTimer} />}
        {tracked.length > 0 && <WeekStrip selected={date} onSelect={(d) => setPicked(d === ctx.today ? null : d)} />}
        {!isToday && (
          <Text style={s.pastHint}>Editing {dateLine}. Tap a circle to mark it done, swipe right to skip.</Text>
        )}

        {tracked.length === 0 && groups.anchors.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Start small.</Text>
            <Text style={s.emptyText}>Add one habit after you wake up and one for the evening.</Text>
            <Pressable style={s.emptyBtn} onPress={() => actions.openForm(null)}>
              <Text style={s.emptyBtnText}>Add a habit</Text>
            </Pressable>
          </View>
        ) : empty ? (
          <Text style={s.none}>Nothing due this day.</Text>
        ) : (
          <>
            {groups.anchors.map(({ anchor, rows }) => {
              const st = stateOn(anchor, idx, date, dayCtx);
              return (
                <SectionBlock
                  key={anchor.id}
                  {...common}
                  rows={rows}
                  nested
                  head={
                    <SwipeRow
                      name={anchor.name}
                      onDelete={() => actions.onDelete(anchor)}
                      actions={actions.swipeActions(anchor)}
                      gap={8}
                      radius={14}
                    >
                      <AnchorRow
                        anchor={anchor}
                        state={st}
                        showTime
                        focus={focus?.anchor.id === anchor.id ? focus.label : null}
                        onToggle={() => actions.onToggle(anchor, st)}
                      />
                    </SwipeRow>
                  }
                />
              );
            })}
            <SectionBlock {...common} title="Anytime" rows={groups.anytime} />
            <SectionBlock {...common} title="This week" rows={groups.week} />
          </>
        )}

        {isToday && tracked.length === 0 && groups.anchors.length > 0 && (
          <View style={s.tip}>
            <Text style={s.tipText}>Add a habit and put it after one of your anchors, or leave it for anytime.</Text>
            <Pressable style={s.tipBtn} onPress={() => actions.openForm(null)} accessibilityRole="button">
              <Text style={s.tipBtnText}>Add a habit</Text>
            </Pressable>
          </View>
        )}
        {notToday.length > 0 && (
          <View style={s.notToday}>
            <Text style={s.notTodayLabel}>{isToday ? 'Not today' : 'Not due this day'}</Text>
            <View style={s.notTodayList}>
              {notToday.map((h) => (
                <Pressable key={h.id} onPress={() => actions.onOpen(h)} hitSlop={6}>
                  <Text style={s.notTodayItem}>{h.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {isToday && <LogRow onEdit={(h) => actions.openForm(h)} onDelete={actions.onDelete} />}
        {!empty && isToday && (
          <Text style={s.hint}>Swipe right to skip or get ready · left to delete · hold and drag to reorder</Text>
        )}
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
    emptyBtn: {
      marginTop: 20,
      backgroundColor: t.accent,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 12,
    },
    emptyBtnText: { color: t.onAccent, fontWeight: '600', fontSize: 16 },
    notToday: { marginTop: 22, marginHorizontal: 4 },
    notTodayLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    notTodayList: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
    notTodayItem: { fontSize: 14, color: t.textMuted, textDecorationLine: 'underline' },
    tip: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginTop: 18, gap: 10 },
    tipText: { fontSize: 14, color: t.textMuted, lineHeight: 20 },
    tipBtn: { alignSelf: 'flex-start', backgroundColor: t.accent, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
    tipBtnText: { color: t.onAccent, fontWeight: '600', fontSize: 15 },
    hint: { textAlign: 'center', color: t.textMuted, fontSize: 12, marginTop: 20, lineHeight: 17 },
  });
