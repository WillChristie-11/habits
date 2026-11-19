import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store';
import { banners, paceText } from '../lib/reminders';
import { formatDuration, formatTime } from '../lib/dates';
import { status, useThemedStyles, type Theme } from '../theme';

/** Morning reminder, evening nudge (red after the deadline) and behind-pace warnings. */
export function Banners() {
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, now, settings, dismissMorning } = useStore();
  const [expanded, setExpanded] = useState(false);
  const list = banners(habits, idx, ctx, settings.reminders, now);
  if (!list.length) return null;
  const deadline = formatTime(settings.reminders.eveningDeadline);

  return (
    <View style={s.wrap}>
      {list.map((b) => {
        if (b.kind === 'morning') {
          return (
            <View key="morning" style={[s.banner, s.morning]}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Morning · {b.habits.length} to go</Text>
                <Text style={s.body} numberOfLines={2}>
                  {b.habits.map((h) => h.name).join(', ')}
                </Text>
              </View>
              <Pressable onPress={dismissMorning} hitSlop={8} style={s.dismiss}>
                <Text style={s.dismissText}>Dismiss for today</Text>
              </Pressable>
            </View>
          );
        }
        if (b.kind === 'evening') {
          const n = b.items.length;
          return (
            <Pressable
              key="evening"
              onPress={() => setExpanded((e) => !e)}
              style={[s.banner, b.late ? s.late : s.evening, { flexDirection: 'column', alignItems: 'stretch' }]}
              accessibilityRole="button"
              accessibilityHint="Shows what's left and why"
            >
              <Text style={[s.title, b.late && s.lateText]}>
                {b.late
                  ? `Past ${deadline} · ${n} unchecked`
                  : `${n} left · ${formatDuration(b.minutesLeft)} until ${deadline}`}
              </Text>
              {!expanded ? (
                <Text style={[s.body, b.late && s.lateText]} numberOfLines={1}>
                  {b.items.map((x) => (x.flagged ? `⚑ ${x.habit.name}` : x.habit.name)).join(', ')}
                </Text>
              ) : (
                <View style={{ marginTop: 6, gap: 8 }}>
                  {b.items.map(({ habit: h, flagged }) => (
                    <View key={h.id}>
                      <Text style={[s.itemName, flagged && s.flag]}>
                        {flagged ? '⚑ ' : ''}
                        {h.name}
                        {flagged ? ' · missed yesterday' : ''}
                      </Text>
                      {h.minimum_version && <Text style={s.body}>Minimum: {h.minimum_version}</Text>}
                      {h.why && <Text style={s.body}>Why: {h.why}</Text>}
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          );
        }
        return (
          <View key="pace" style={[s.banner, s.pace, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[s.title, s.flag]}>Behind pace</Text>
            {b.warnings.map((w) => (
              <Text key={w.habit.id} style={s.body}>
                {paceText(w)}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { gap: 8, marginTop: 14 },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 10,
    },
    morning: { backgroundColor: t.surface, borderLeftWidth: 3, borderLeftColor: t.accent },
    evening: { backgroundColor: t.accentSoft },
    late: { backgroundColor: status.deadlineSoft },
    pace: { backgroundColor: status.flagSoft },
    title: { fontSize: 14, fontWeight: '600', color: t.text },
    body: { fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 },
    itemName: { fontSize: 14, color: t.text, fontWeight: '500' },
    lateText: { color: status.deadline },
    flag: { color: status.flag },
    dismiss: { paddingVertical: 4 },
    dismissText: { fontSize: 13, color: t.accent, fontWeight: '600' },
  });
