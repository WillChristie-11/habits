import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DayState, Habit } from '../types';
import { SECTION_LABELS } from '../types';
import { useStore } from '../store';
import { feelingLabel, feelingStats, frequencyText, progress, timeline } from '../lib/schedule';
import { WEEKDAY_SHORT, last7, weekDays, weekday } from '../lib/dates';
import { Dot } from '../components/Dots';
import { Button } from '../components/ui';
import { colors } from '../theme';

interface Props {
  habit: Habit | null;
  onClose(): void;
  onEdit(h: Habit): void;
}

const LEGEND: { state: DayState; label: string }[] = [
  { state: 'done', label: 'Done' },
  { state: 'missed', label: 'Missed' },
  { state: 'skipped', label: 'Skipped' },
  { state: 'paused', label: 'Paused' },
  { state: 'none', label: 'Not due' },
];

export function HabitDetail({ habit, onClose, onEdit }: Props) {
  return (
    <Modal visible={!!habit} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {habit && <Body habit={habit} onClose={onClose} onEdit={onEdit} />}
    </Modal>
  );
}

function Body({ habit: h0, onClose, onEdit }: { habit: Habit; onClose(): void; onEdit(h: Habit): void }) {
  const { habits, idx, ctx, mark, unmark } = useStore();
  const h = habits.find((x) => x.id === h0.id) ?? h0;
  const days = last7(ctx.today);
  const tl = timeline(h, idx, days[0], ctx.today, ctx);
  const todayState = tl.states.get(ctx.today);
  const week = progress(h, idx, weekDays(ctx.today), ctx);
  const feel = feelingStats(h, idx);
  const anchor = h.stack_after != null ? habits.find((x) => x.id === h.stack_after) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.bar}>
        <Pressable onPress={() => onEdit(h)} hitSlop={10}>
          <Text style={styles.barBtn}>Edit</Text>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={[styles.barBtn, { fontWeight: '600' }]}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.name}>{h.name}</Text>
        <Text style={styles.sub}>
          {SECTION_LABELS[h.section]} · {frequencyText(h)}
          {anchor ? ` · after ${anchor.name}` : ''}
        </Text>

        {(h.why || h.minimum_version) && (
          <View style={styles.card}>
            {h.why && (
              <>
                <Text style={styles.cardLabel}>Why</Text>
                <Text style={styles.cardText}>{h.why}</Text>
              </>
            )}
            {h.minimum_version && (
              <>
                <Text style={[styles.cardLabel, h.why ? { marginTop: 12 } : null]}>Minimum version</Text>
                <Text style={styles.cardText}>{h.minimum_version}</Text>
              </>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Last 7 days</Text>
          <View style={styles.week}>
            {days.map((d) => (
              <View key={d} style={styles.day}>
                <Text style={[styles.dayLabel, d === ctx.today && { color: colors.text, fontWeight: '700' }]}>
                  {WEEKDAY_SHORT[weekday(d)]}
                </Text>
                <Dot state={tl.states.get(d) ?? 'none'} size={20} />
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            {LEGEND.map((l) => (
              <View key={l.state} style={styles.legendItem}>
                <Dot state={l.state} size={12} />
                <Text style={styles.legendText}>{l.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.card, styles.stats]}>
          <Stat
            label="This week"
            value={
              week.target != null
                ? `${week.done}/${week.target}`
                : week.pct == null
                  ? '—'
                  : `${Math.round(week.pct * 100)}%`
            }
          />
          <Stat
            label="Usually feel"
            value={feel.avg != null ? feelingLabel(feel.avg) : '—'}
            note={feel.count ? `${feel.count} ratings` : 'no ratings yet'}
          />
        </View>

        <View style={{ gap: 10, marginTop: 8 }}>
          {todayState === 'skipped' ? (
            <Button kind="secondary" title="Undo skip" onPress={() => unmark(h.id)} />
          ) : todayState !== 'done' && todayState !== 'paused' ? (
            <Button kind="secondary" title="Skip today (rest day)" onPress={() => mark(h.id, 'skipped')} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {note && <Text style={styles.legendText}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  barBtn: { fontSize: 16, color: colors.accent },
  content: { padding: 16, paddingBottom: 60 },
  name: { fontSize: 26, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.sub, marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginTop: 16 },
  cardLabel: { fontSize: 12, fontWeight: '600', color: colors.sub, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 16, color: colors.text, marginTop: 4, lineHeight: 22 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  day: { alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 12, color: colors.sub },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 12, color: colors.sub },
  stats: { flexDirection: 'row' },
  statValue: { fontSize: 22, fontWeight: '600', color: colors.text, marginTop: 4 },
});
