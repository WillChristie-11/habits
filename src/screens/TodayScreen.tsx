import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { counts, dayCompletion, nextAnchor, stateOn, todayGroups, visibleOn, type Row } from '../lib/schedule';
import { router } from 'expo-router';
import { isCutBack } from '../lib/schedule';
import { fromKey } from '../lib/dates';
import { ProgressRing } from '../components/ProgressRing';
import { SectionBlock } from '../components/SectionBlock';
import { Banners } from '../components/Banners';
import { WeekStrip } from '../components/WeekStrip';
import { useHabitActions } from '../components/useHabitActions';
import { ScreenHeader } from '../components/ScreenHeader';
import { FloatingAdd } from '../components/FloatingAdd';
import { Priorities } from '../components/Priorities';
import { WeekIntentionLine, YesterdayBetterLine } from '../components/WeekIntention';
import { DoorCard } from '../components/DoorCard';
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

  const [nowView, setNowView] = useState(false);
  const items = useMemo(() => habits.filter((h) => counts(h) || h.kind === 'anchor'), [habits]);
  const tracked = useMemo(() => items.filter(counts), [items]);
  const hasCutBacks = habits.some(isCutBack);
  const dayCtx = useMemo(() => ({ ...ctx, today: date }), [ctx, date]);
  const groups = useMemo(() => todayGroups(items, (h) => visibleOn(h, idx, ctx, date)), [items, idx, ctx, date]);
  const notToday = tracked.filter((h) => !visibleOn(h, idx, ctx, date));
  const ring = dayCompletion(habits, idx, ctx, date);
  const focus = isToday ? nextAnchor(habits, idx, ctx, now.getHours() * 60 + now.getMinutes()) : null;
  const empty = groups.anchors.length === 0 && groups.anytime.length === 0 && groups.week.length === 0;

  const showNow = nowView && isToday;
  const title = showNow ? 'Now' : isToday ? 'Today' : fromKey(date).toLocaleDateString(undefined, { weekday: 'long' });
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
        right={
          ring.total > 0 ? (
            <Pressable
              onPress={() => isToday && setNowView((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showNow ? 'Show the whole day' : 'Show only what’s now'}
            >
              <ProgressRing done={ring.done} total={ring.total} />
            </Pressable>
          ) : null
        }
        links={isToday ? [] : [{ label: '← Back to today', onPress: () => setPicked(null), strong: true }]}
      />

      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Today's priorities sit at the very top (a past day shows the ones checked that day). */}
        {isToday && <DoorCard />}
        <Priorities date={date} />
        {showNow && (
          <NowView
            groups={groups}
            focusId={focus?.anchor.id ?? null}
            focusLabel={focus?.label ?? 'Now'}
            common={common}
            actions={actions}
          />
        )}
        {!showNow && (
          <>
            {isToday && <WeekIntentionLine />}
            {isToday && <YesterdayBetterLine />}
            {isToday && <Banners onStart={actions.startTimer} />}
            {tracked.length > 0 && (
              <WeekStrip selected={date} onSelect={(d) => setPicked(d === ctx.today ? null : d)} />
            )}
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
                <Text style={s.tipText}>
                  Add a habit and put it after one of your anchors, or leave it for anytime.
                </Text>
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
          </>
        )}
        {isToday && (
          <LogRow
            onEdit={(h) => actions.openForm(h)}
            onDelete={actions.onDelete}
            onNew={() => actions.openForm(null, 'activity')}
            trailing={
              hasCutBacks ? (
                <Pressable onPress={() => router.push('/tempted')} style={s.tempted} accessibilityRole="button">
                  <Text style={s.temptedText}>Tempted?</Text>
                </Pressable>
              ) : null
            }
          />
        )}
        {!empty && isToday && !showNow && (
          <Text style={s.hint}>Swipe right to skip or get ready · left to delete · hold and drag to reorder</Text>
        )}
      </ScrollView>

      {isToday && <FloatingAdd onPress={actions.openChooser} />}
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
    tipBtn: {
      alignSelf: 'flex-start',
      backgroundColor: t.accent,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 10,
    },
    tipBtnText: { color: t.onAccent, fontWeight: '600', fontSize: 15 },
    tempted: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: t.muted,
    },
    temptedText: { fontSize: 14, fontWeight: '600', color: t.textMuted },
    nowEmpty: { fontSize: 15, color: t.textMuted, marginTop: 24, textAlign: 'center', lineHeight: 21 },
    nowLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 22,
      marginBottom: 8,
      marginLeft: 4,
    },
    nowHint: { textAlign: 'center', color: t.textMuted, fontSize: 12, marginTop: 18 },
    hint: { textAlign: 'center', color: t.textMuted, fontSize: 12, marginTop: 20, lineHeight: 17 },
  });

/**
 * "Now": only the current anchor (or the next one, if none has started) with its open items,
 * then the next item after it. Tap the ring again to see the whole day.
 */
function NowView({
  groups,
  focusId,
  focusLabel,
  common,
  actions,
}: {
  focusLabel: 'Now' | 'Next';
  groups: ReturnType<typeof todayGroups>;
  focusId: number | null;
  common: Omit<React.ComponentProps<typeof SectionBlock>, 'rows' | 'title' | 'head' | 'nested'>;
  actions: ReturnType<typeof useHabitActions>;
}) {
  const s = useThemedStyles(makeStyles);
  const { idx, ctx } = useStore();
  const open = (rows: Row[]) => rows.filter((r) => stateOn(r.habit, idx, ctx.today, ctx) === 'pending');
  const i = groups.anchors.findIndex((g) => g.anchor.id === focusId);
  const current = i >= 0 ? groups.anchors[i] : null;
  const next = i >= 0 ? groups.anchors[i + 1] : null;
  const anytime = open(groups.anytime);

  const anchorHead = (a: (typeof groups.anchors)[number]['anchor'], label: 'Now' | 'Next') => {
    const st = stateOn(a, idx, ctx.today, ctx);
    return (
      <SwipeRow
        name={a.name}
        onDelete={() => actions.onDelete(a)}
        actions={actions.swipeActions(a)}
        gap={8}
        radius={14}
      >
        <AnchorRow anchor={a} state={st} showTime focus={label} onToggle={() => actions.onToggle(a, st)} />
      </SwipeRow>
    );
  };

  if (!current) {
    return (
      <>
        {anytime.length > 0 ? (
          <SectionBlock {...common} title="Anytime" rows={anytime} />
        ) : (
          <Text style={s.nowEmpty}>Nothing left for now. Tap the ring for the whole day.</Text>
        )}
      </>
    );
  }
  const rows = open(current.rows);
  return (
    <>
      <SectionBlock {...common} rows={rows} nested head={anchorHead(current.anchor, focusLabel)} />
      {rows.length === 0 && <Text style={s.nowHint}>Everything here is done.</Text>}
      {next ? (
        <>
          <Text style={s.nowLabel}>Then</Text>
          {anchorHead(next.anchor, 'Next')}
        </>
      ) : (
        anytime.length > 0 && <SectionBlock {...common} title="Then, anytime" rows={anytime.slice(0, 1)} />
      )}
      <Text style={s.nowHint}>Tap the ring for the whole day</Text>
    </>
  );
}
