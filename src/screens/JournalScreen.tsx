import React, { useMemo, useState } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { EntryType, Habit, JournalEntry } from '../types';
import { useStore } from '../store';
import { ScreenHeader } from '../components/ScreenHeader';
import { Button, Chip, Input } from '../components/ui';
import { EntryEditor, ENTRY_LABELS } from '../components/journal/EntryEditor';
import { useHabitActions } from '../components/useHabitActions';
import { agoText, entryText, reflectionOpen, resurfaceFor, reviewDue, searchEntries } from '../lib/journal';
import { dayCompletion, periodSummary } from '../lib/schedule';
import { fromKey, prettyDate, weekDays, weekStart } from '../lib/dates';
import { useThemedStyles, type Theme } from '../theme';

type Filter = 'all' | EntryType;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'intention', label: 'Intentions' },
  { value: 'reflection', label: 'Reflections' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'note', label: 'Notes' },
];

/**
 * Everything written, newest first: intentions, reflections, weekly reviews, notes to future me.
 * Private and optional: nothing here touches %, rings or flags.
 */
export function JournalScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { habits, entries, idx, ctx, now, settings, updateSettings } = useStore();
  const actions = useHabitActions();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ entry: JournalEntry | null; type: EntryType; date: string } | null>(null);
  const [obstacleFrom, setObstacleFrom] = useState<string | null>(null);

  const list = useMemo(() => {
    const byType = filter === 'all' ? entries : entries.filter((e) => e.type === filter);
    return searchEntries(byType, query, habits);
  }, [entries, filter, query, habits]);

  // Group by day, newest first.
  const groups: { date: string; items: JournalEntry[] }[] = [];
  for (const e of list) {
    const g = groups.at(-1);
    if (g && g.date === e.date) g.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  const due = reviewDue(entries, ctx, now);
  const reflectedToday = entries.some((e) => e.type === 'reflection' && e.date === ctx.today);
  const showReflection = reflectionOpen(settings.reminders, now) && !reflectedToday;
  const thisWeek = weekStart(ctx.today);
  const resurfaced = settings.resurfaceDismissedWeek === thisWeek ? null : resurfaceFor(entries, ctx.today);
  const tracked = habits.filter((h) => h.kind === 'habit');

  const open = (e: JournalEntry) => {
    if (e.type === 'weekly') router.push({ pathname: '/review', params: { sunday: e.date } });
    else setEditing({ entry: e, type: e.type, date: e.date });
  };

  const addEntry = () => {
    const choose = (i: number) => {
      if (i === 0) setEditing({ entry: null, type: 'note', date: ctx.today });
      if (i === 1) {
        const existing = entries.find((e) => e.type === 'reflection' && e.date === ctx.today) ?? null;
        setEditing({ entry: existing, type: 'reflection', date: ctx.today });
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Note to future me', 'Reflection for today', 'Cancel'], cancelButtonIndex: 2 },
        choose,
      );
    } else choose(0);
  };

  // "Make this an obstacle plan": pick the habit, then open its form with the obstacle prefilled.
  const makeObstacle = (text: string) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Make this an obstacle plan for…', options: [...tracked.map((h) => h.name), 'Cancel'], cancelButtonIndex: tracked.length },
        (i) => i < tracked.length && actions.openForm(tracked[i], 'habit', text),
      );
    } else setObstacleFrom(text);
  };

  const stat = (e: JournalEntry) => {
    if (e.type === 'weekly') {
      const p = periodSummary(habits, idx, weekDays(e.date), ctx).pct;
      return p == null ? null : `${Math.round(p * 100)}% week`;
    }
    if (e.type === 'note') return e.habit_id != null ? (habits.find((h) => h.id === e.habit_id)?.name ?? null) : null;
    const c = dayCompletion(habits, idx, ctx, e.date);
    return c.total ? `${c.done}/${c.total} done` : null;
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        dateLine={now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        title="Journal"
        onAdd={addEntry}
        addLabel="Entry"
      />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {resurfaced && (
          <View style={s.resurface}>
            <View style={s.cardHead}>
              <Text style={s.kicker}>{agoText(resurfaced.date, ctx.today)} you wrote</Text>
              <Pressable onPress={() => updateSettings({ resurfaceDismissedWeek: thisWeek })} hitSlop={10}>
                <Text style={s.x}>✕</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => open(resurfaced)}>
              <Text style={s.resurfaceText}>“{entryText(resurfaced)}”</Text>
            </Pressable>
          </View>
        )}

        {due && (
          <Pressable style={s.reviewCard} onPress={() => router.push({ pathname: '/review', params: { sunday: due } })}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>Weekly review</Text>
              <Text style={s.cardTitle}>Look back at {weekRange(due)}</Text>
              <Text style={s.cardSub}>Three questions and a note for next week. A few minutes.</Text>
            </View>
            <Text style={s.chev}>›</Text>
          </Pressable>
        )}

        {showReflection && <ReflectionCard key={ctx.today} />}

        <View style={s.filters}>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </View>
        <Input value={query} onChangeText={setQuery} placeholder="Search" returnKeyType="search" clearButtonMode="while-editing" />

        {groups.length === 0 && (
          <Text style={s.empty}>
            {entries.length
              ? 'Nothing matches.'
              : 'Nothing here yet. Your morning intentions, evening reflections and weekly reviews collect here.'}
          </Text>
        )}

        {groups.map((g) => (
          <View key={g.date} style={{ marginTop: 18 }}>
            <Text style={s.day}>{dayLabel(g.date, ctx.today)}</Text>
            {g.items.map((e) => {
              const st = stat(e);
              return (
                <Pressable key={e.id} style={s.entry} onPress={() => open(e)}>
                  <View style={s.entryHead}>
                    <Text style={s.type}>{ENTRY_LABELS[e.type]}</Text>
                    {st && <Text style={s.stat}>{st}</Text>}
                  </View>
                  {e.type === 'reflection' ? (
                    <>
                      {!!e.data.wentWell && <Text style={s.body}>✓ {e.data.wentWell}</Text>}
                      {!!e.data.inTheWay && <Text style={s.body}>↯ {e.data.inTheWay}</Text>}
                      {!!e.data.inTheWay && tracked.length > 0 && (
                        <Pressable onPress={() => makeObstacle(e.data.inTheWay)} hitSlop={6}>
                          <Text style={s.link}>Make this an obstacle plan</Text>
                        </Pressable>
                      )}
                    </>
                  ) : e.type === 'weekly' ? (
                    <>
                      {!!e.data.liked && <Text style={s.body}>Liked: {e.data.liked}</Text>}
                      {!!e.data.didntWork && <Text style={s.body}>Didn’t work: {e.data.didntWork}</Text>}
                      {!!e.data.changes && <Text style={s.body}>Next week: {e.data.changes}</Text>}
                    </>
                  ) : (
                    <Text style={s.body}>{e.data.text}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {editing && (
        <EntryEditor entry={editing.entry} type={editing.type} date={editing.date} onClose={() => setEditing(null)} />
      )}
      {obstacleFrom != null && (
        <HabitPicker
          habits={tracked}
          onPick={(h) => {
            const text = obstacleFrom;
            setObstacleFrom(null);
            setTimeout(() => actions.openForm(h, 'habit', text), 300);
          }}
          onClose={() => setObstacleFrom(null)}
        />
      )}
      {actions.overlays}
    </View>
  );
}

/** Today's two-line reflection, offered once the evening nudge starts. Never counted. */
function ReflectionCard() {
  const s = useThemedStyles(makeStyles);
  const { ctx, saveEntry } = useStore();
  const [wentWell, setWentWell] = useState('');
  const [inTheWay, setInTheWay] = useState('');
  const can = !!(wentWell.trim() || inTheWay.trim());
  return (
    <View style={s.reflect}>
      <Text style={s.kicker}>Tonight</Text>
      <Text style={s.cardTitle}>How did today go?</Text>
      <Input value={wentWell} onChangeText={setWentWell} placeholder="What went well?" style={s.reflectInput} />
      <Input value={inTheWay} onChangeText={setInTheWay} placeholder="What got in the way?" style={s.reflectInput} />
      <View style={{ marginTop: 4 }}>
        <Button
          title="Save reflection"
          disabled={!can}
          onPress={() => saveEntry('reflection', ctx.today, { wentWell: wentWell.trim(), inTheWay: inTheWay.trim() })}
        />
      </View>
    </View>
  );
}

function HabitPicker({ habits, onPick, onClose }: { habits: Habit[]; onPick(h: Habit): void; onClose(): void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={s.picker}>
        <Text style={s.cardTitle}>Make this an obstacle plan for…</Text>
        {habits.map((h) => (
          <Pressable key={h.id} style={s.pickRow} onPress={() => onPick(h)}>
            <Text style={s.body}>{h.name}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function weekRange(sunday: string): string {
  const days = weekDays(sunday);
  const a = fromKey(days[0]);
  const b = fromKey(days[6]);
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  return prettyDate(date);
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 },
    kicker: { fontSize: 12, fontWeight: '700', color: t.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 18, fontWeight: '700', color: t.text, marginTop: 2 },
    cardSub: { fontSize: 13, color: t.textMuted, marginTop: 2 },
    x: { fontSize: 14, color: t.textMuted },
    chev: { fontSize: 28, color: t.accent, marginLeft: 8 },
    resurface: { backgroundColor: t.accentSoft, borderRadius: 14, padding: 14, marginBottom: 12 },
    resurfaceText: { fontSize: 16, color: t.text, marginTop: 6, lineHeight: 22, fontStyle: 'italic' },
    reviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1.5,
      borderColor: t.accent,
    },
    reflect: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
    reflectInput: { backgroundColor: t.background },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 10 },
    empty: { fontSize: 15, color: t.textMuted, textAlign: 'center', marginTop: 32, lineHeight: 21, paddingHorizontal: 12 },
    day: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginBottom: 8, marginLeft: 4 },
    entry: { backgroundColor: t.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 4 },
    entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    type: { fontSize: 12, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
    stat: { fontSize: 12, color: t.textMuted, fontVariant: ['tabular-nums'] },
    body: { fontSize: 15, color: t.text, lineHeight: 21 },
    link: { fontSize: 13, color: t.accent, fontWeight: '600', marginTop: 4 },
    scrim: { flex: 1, backgroundColor: t.scrim },
    picker: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: '25%',
      backgroundColor: t.background,
      borderRadius: 16,
      padding: 16,
      gap: 4,
    },
    pickRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  });
