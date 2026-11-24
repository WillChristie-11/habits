import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store';
import {
  OUTCOMES,
  facedThisWeek,
  horizonOn,
  isLastSundayOfMonth,
  keptThisWeek,
  monthKey,
  reasonCounts,
  reasonRule,
} from '../lib/direction';
import { addDays, weekDays, weekStart } from '../lib/dates';
import { Button, Chip, Input } from './ui';
import { useThemedStyles, type Theme } from '../theme';

/** Whether a week has anything for the Direction part of its recap. */
export function hasDirection(sunday: string, s: ReturnType<typeof useStore>): boolean {
  const days = weekDays(sunday);
  return (
    facedThisWeek(s.habits, s.idx, days).total > 0 ||
    reasonCounts(s.notToday, days).length > 0 ||
    keptThisWeek(s.habits, s.idx, days).length > 0
  );
}

/**
 * Sunday recap additions: What you faced, What got in the way, In your words, Last week was for
 * (It happened / Partly / Not yet) and, on the last Sunday of the month, the horizon question.
 */
export function DirectionRecap({ sunday, editable }: { sunday: string; editable: boolean }) {
  const s = useThemedStyles(makeStyles);
  const store = useStore();
  const { habits, idx, notToday, weeks, weekOutcomes, saveWeekOutcome } = store;
  const days = weekDays(sunday);
  const faced = facedThisWeek(habits, idx, days);
  const reasons = reasonCounts(notToday, days);
  const rule = reasonRule(reasons);
  const kept = keptThisWeek(habits, idx, days);
  const week = weekStart(sunday);
  const intention = weeks[week];
  const outcome = weekOutcomes[week];
  const max = Math.max(1, ...reasons.map((r) => r.count));

  return (
    <View style={s.wrap}>
      {faced.text && (
        <View style={s.section}>
          <Text style={s.label}>What you faced</Text>
          <Text style={s.line}>{faced.text}</Text>
          {faced.per.map((x) => (
            <Text key={x.habit.id} style={s.small}>
              {x.habit.name} · {x.count}
              {x.expected != null ? ` · expected ${x.expected}, felt ${x.felt}` : ''}
            </Text>
          ))}
        </View>
      )}

      {reasons.length > 0 && (
        <View style={s.section}>
          <Text style={s.label}>What got in the way</Text>
          {reasons.map((r) => (
            <View key={r.key} style={s.barRow}>
              <Text style={s.barLabel} numberOfLines={1}>
                {r.label}
              </Text>
              <View style={s.track}>
                <View style={[s.bar, { width: `${Math.round((r.count / max) * 100)}%` }]} />
              </View>
              <Text style={s.barCount}>{r.count}</Text>
            </View>
          ))}
          {rule && <Text style={s.line}>{rule}</Text>}
        </View>
      )}

      {kept.length > 0 && (
        <View style={s.section}>
          <Text style={s.label}>In your words</Text>
          {kept.map((l) => (
            <Text key={`${l.date}-${l.habit}`} style={s.quote}>
              “{l.text}”
            </Text>
          ))}
        </View>
      )}

      {intention && (
        <View style={s.section}>
          <Text style={s.label}>Last week was for</Text>
          <Text style={s.line}>{intention}</Text>
          {editable ? (
            <View style={s.chips}>
              {OUTCOMES.map((o) => (
                <Chip
                  key={o.key}
                  label={o.label}
                  active={outcome === o.key}
                  onPress={() => saveWeekOutcome(week, o.key)}
                />
              ))}
            </View>
          ) : (
            outcome && <Text style={s.small}>{OUTCOMES.find((o) => o.key === outcome)?.label}</Text>
          )}
        </View>
      )}

      {isLastSundayOfMonth(sunday) && <Horizon sunday={sunday} editable={editable} />}
    </View>
  );
}

/** "Three months from now, what do you want to be true?" with last month's answer. */
function Horizon({ sunday, editable }: { sunday: string; editable: boolean }) {
  const s = useThemedStyles(makeStyles);
  const { months, saveMonth } = useStore();
  const month = monthKey(sunday);
  const current = months[month];
  const before = horizonOn(months, addDays(`${month}-01`, -1));
  const [rewriting, setRewriting] = useState(false);
  const [text, setText] = useState(current ?? '');
  if (!editable && !current) return null;

  return (
    <View style={s.section}>
      <Text style={s.label}>Three months from now</Text>
      <Text style={s.line}>What do you want to be true?</Text>
      {current && !rewriting ? (
        <>
          <Text style={s.quote}>“{current}”</Text>
          {editable && <Button kind="secondary" title="Rewrite it" onPress={() => setRewriting(true)} />}
        </>
      ) : !editable ? null : before && !rewriting ? (
        <>
          <Text style={s.small}>Last time you wrote:</Text>
          <Text style={s.quote}>“{before.line}”</Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Button title="Still true" onPress={() => saveMonth(month, before.line)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" title="Rewrite it" onPress={() => setRewriting(true)} />
            </View>
          </View>
        </>
      ) : (
        <>
          <Input value={text} onChangeText={setText} placeholder="In three months…" multiline maxLength={200} />
          <Button
            title="Save"
            onPress={async () => {
              await saveMonth(month, text);
              setRewriting(false);
            }}
          />
        </>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { gap: 14, marginTop: 10 },
    section: { gap: 6 },
    label: { fontSize: 12, fontWeight: '700', color: t.textMuted },
    line: { fontSize: 15, color: t.text, lineHeight: 21 },
    small: { fontSize: 14, color: t.textMuted },
    quote: { fontSize: 15, fontStyle: 'italic', color: t.text },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    barLabel: { width: 130, fontSize: 14, color: t.text },
    track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.border, overflow: 'hidden' },
    bar: { height: 8, borderRadius: 4, backgroundColor: t.accent },
    barCount: { width: 20, textAlign: 'right', fontSize: 14, color: t.textMuted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    row: { flexDirection: 'row', gap: 10 },
  });
