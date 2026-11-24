import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { weekDays, weekday } from '../lib/dates';
import { SundayRecap } from './JournalScreen';
import { useThemedStyles, type Theme } from '../theme';

/**
 * The week's recap, any day (from the Journal's "Week so far" card). Midweek it's the week so
 * far; on Sunday it's the full recap, with This week is for and the monthly question.
 */
export function RecapScreen() {
  const s = useThemedStyles(makeStyles);
  const { ctx } = useStore();
  const sunday = weekDays(ctx.today)[6];
  const isSunday = weekday(ctx.today) === 0;
  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.title}>{isSunday ? 'This week' : 'Week so far'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Text style={s.done}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <SundayRecap sunday={sunday} />
        {!isSunday && <Text style={s.note}>The full recap, with next week’s line, comes on Sunday.</Text>}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    title: { fontSize: 20, fontWeight: '700', color: t.text },
    done: { fontSize: 17, fontWeight: '600', color: t.accent },
    content: { paddingHorizontal: 16, paddingBottom: 48 },
    note: { fontSize: 13, color: t.textMuted, marginTop: 16 },
  });
