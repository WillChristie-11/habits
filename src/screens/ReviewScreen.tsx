import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { Habit, HabitInput } from '../types';
import { useStore } from '../store';
import { weekReview } from '../lib/journal';
import { feelingLabel } from '../lib/schedule';
import { WEEKDAY_SHORT, addDays, fromKey, weekday, weekStart } from '../lib/dates';
import { Dot } from '../components/Dots';
import { Button, Input, Label, Segmented } from '../components/ui';
import { useThemedStyles, type Theme } from '../theme';

type Decision = 'keep' | 'shrink' | 'drop';

const toInput = (h: Habit): HabitInput => {
  const { id: _id, order: _o, created_at: _c, paused_from: _pf, paused_until: _pu, ...rest } = h;
  return rest;
};

/**
 * Sunday-evening review of the week Mon–Sun: how each habit went, the best-feeling habit, the
 * most-missed habit (keep / shrink / drop), three prompts, and optional notes to future me.
 */
export function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ sunday?: string }>();
  const { habits, idx, ctx, entries, saveEntry, updateEntry, editHabit, removeHabit } = useStore();
  const sunday = params.sunday ?? addDays(weekStart(ctx.today), -1);
  const review = useMemo(() => weekReview(habits, idx, ctx, sunday), [habits, idx, ctx, sunday]);

  const existing = entries.find((e) => e.type === 'weekly' && e.date === sunday);
  const existingNotes = entries.filter((e) => e.type === 'note' && e.date === sunday && e.habit_id != null);
  const [liked, setLiked] = useState(existing?.data.liked ?? '');
  const [didntWork, setDidntWork] = useState(existing?.data.didntWork ?? '');
  const [changes, setChanges] = useState(existing?.data.changes ?? '');
  const [notes, setNotes] = useState<Record<number, string>>(() =>
    Object.fromEntries(existingNotes.map((n) => [n.habit_id!, n.data.text ?? ''])),
  );
  const missed = review.mostMissed?.habit ?? null;
  const [decision, setDecision] = useState<Decision | null>((existing?.data.decision as Decision) ?? null);
  const [shrinkTo, setShrinkTo] = useState(missed?.minimum_version ?? '');
  const [confirmDrop, setConfirmDrop] = useState(false);

  const save = async () => {
    if (missed && decision === 'shrink' && shrinkTo.trim() && shrinkTo.trim() !== missed.minimum_version) {
      await editHabit(missed.id, { ...toInput(missed), minimum_version: shrinkTo.trim() });
    }
    if (missed && decision === 'drop') await removeHabit(missed.id);
    await saveEntry('weekly', sunday, {
      liked: liked.trim(),
      didntWork: didntWork.trim(),
      changes: changes.trim(),
      ...(missed && decision ? { decision, decisionHabit: missed.name } : {}),
    });
    for (const [id, text] of Object.entries(notes)) {
      const prev = existingNotes.find((n) => n.habit_id === Number(id));
      if (prev) await updateEntry(prev.id, { ...prev.data, text: text.trim() });
      else if (text.trim()) await saveEntry('note', sunday, { text: text.trim() }, Number(id));
    }
    router.back();
  };

  const a = fromKey(review.days[0]);
  const b = fromKey(review.days[6]);
  const title = `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={s.barBtn}>Close</Text>
        </Pressable>
        <Text style={s.barTitle}>Weekly review</Text>
        <Pressable onPress={save} hitSlop={10}>
          <Text style={[s.barBtn, { fontWeight: '700' }]}>Save</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.week}>{title}</Text>
        {review.pct != null && <Text style={s.overall}>{Math.round(review.pct * 100)}% of what you planned</Text>}

        <View style={s.card}>
          <View style={s.gridHead}>
            <View style={{ flex: 1 }} />
            {review.days.map((d) => (
              <Text key={d} style={s.dow}>
                {WEEKDAY_SHORT[weekday(d)]}
              </Text>
            ))}
            <View style={{ width: 44 }} />
          </View>
          {review.rows.map((r) => (
            <View key={r.habit.id} style={s.row}>
              <Text style={s.name} numberOfLines={1}>
                {r.habit.name}
              </Text>
              {r.states.map((st, i) => (
                <View key={i} style={s.cell}>
                  <Dot state={st} size={14} />
                </View>
              ))}
              <Text style={s.pct}>
                {r.habit.habit_kind === 'avoid' ? '' : r.target != null ? `${r.done}/${r.target}` : r.pct == null ? '—' : `${Math.round(r.pct * 100)}%`}
              </Text>
            </View>
          ))}
          {review.rows.length === 0 && <Text style={s.muted}>No habits this week.</Text>}
        </View>

        {review.best && (
          <View style={s.card}>
            <Text style={s.kicker}>Felt best after</Text>
            <Text style={s.big}>{review.best.habit.name}</Text>
            <Text style={s.muted}>
              usually {feelingLabel(review.best.feelingAvg!)} ({review.best.feelingCount} ratings this week)
            </Text>
          </View>
        )}

        {missed && review.mostMissed && (
          <View style={s.card}>
            <Text style={s.kicker}>Most missed</Text>
            <Text style={s.big}>{missed.name}</Text>
            <Text style={s.muted}>
              {review.mostMissed.target != null
                ? `${review.mostMissed.done} of ${review.mostMissed.target} this week`
                : `missed ${review.mostMissed.missed} ${review.mostMissed.missed === 1 ? 'day' : 'days'}`}
              . What should happen to it?
            </Text>
            <View style={{ marginTop: 10 }}>
              <Segmented<Decision>
                value={decision}
                onChange={(d) => {
                  setDecision(d);
                  setConfirmDrop(false);
                }}
                options={[
                  { value: 'keep', label: 'Keep' },
                  { value: 'shrink', label: 'Shrink' },
                  { value: 'drop', label: 'Drop' },
                ]}
              />
            </View>
            {decision === 'shrink' && (
              <>
                <Label>Smaller minimum version</Label>
                <Input value={shrinkTo} onChangeText={setShrinkTo} placeholder="Something too small to skip" />
              </>
            )}
            {decision === 'drop' && (
              <Text style={[s.muted, { marginTop: 8 }]}>
                Saving removes this habit and its history.{' '}
                {!confirmDrop && (
                  <Text style={s.link} onPress={() => setConfirmDrop(true)}>
                    I’m sure
                  </Text>
                )}
              </Text>
            )}
          </View>
        )}

        <Label>What did I like this week?</Label>
        <Input value={liked} onChangeText={setLiked} multiline />
        <Label>What didn’t work?</Label>
        <Input value={didntWork} onChangeText={setDidntWork} multiline />
        <Label>What changes next week?</Label>
        <Input value={changes} onChangeText={setChanges} multiline />

        <Label hint="optional">Notes to future me</Label>
        <Text style={s.muted}>
          Each comes back once, on that habit’s motivation sheet and next reminder, the next time it slips.
        </Text>
        {review.rows.map((r) => (
          <View key={r.habit.id} style={{ marginTop: 10 }}>
            <Text style={s.noteLabel}>{r.habit.name}</Text>
            <Input
              value={notes[r.habit.id] ?? ''}
              onChangeText={(v) => setNotes((n) => ({ ...n, [r.habit.id]: v }))}
              placeholder="If this slips, remember…"
            />
          </View>
        ))}

        <View style={{ marginTop: 24 }}>
          <Button title="Save review" onPress={save} disabled={decision === 'drop' && !confirmDrop} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    barTitle: { fontSize: 16, fontWeight: '600', color: t.text },
    barBtn: { fontSize: 16, color: t.accent },
    content: { padding: 16, paddingBottom: 80 },
    week: { fontSize: 28, fontWeight: '700', color: t.text },
    overall: { fontSize: 15, color: t.textMuted, marginTop: 2 },
    card: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginTop: 16 },
    kicker: { fontSize: 12, fontWeight: '700', color: t.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
    big: { fontSize: 20, fontWeight: '700', color: t.text, marginTop: 2 },
    muted: { fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 },
    link: { color: t.accent, fontWeight: '700' },
    gridHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    dow: { width: 20, textAlign: 'center', fontSize: 11, fontWeight: '600', color: t.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
    name: { flex: 1, fontSize: 14, color: t.text },
    cell: { width: 20, alignItems: 'center' },
    pct: { width: 44, textAlign: 'right', fontSize: 12, color: t.textMuted, fontVariant: ['tabular-nums'] },
    noteLabel: { fontSize: 13, fontWeight: '600', color: t.text, marginBottom: 4 },
  });
