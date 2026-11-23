import React, { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { glanceLine, isEmptyClose, tidyClose } from '../lib/dayClose';
import { openPriorities, MAX_OPEN } from '../lib/priorities';
import { Button, Input, Label, Toggle } from '../components/ui';
import { useThemedStyles, type Theme } from '../theme';

/**
 * Close the day: today at a glance, then three optional lines (how did today go, one action item
 * for tomorrow, one thing to do better). Done saves whatever is filled; Not tonight saves nothing.
 */
export function CloseDayScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ date?: string }>();
  const { ctx, habits, records, focusLog, priorities, dayCloses, closeDay } = useStore();
  const date = params.date ?? ctx.today;
  const earlier = dayCloses.find((c) => c.date === date);
  const [reflection, setReflection] = useState(earlier?.reflection ?? '');
  const [action, setAction] = useState(earlier?.action ?? '');
  const [better, setBetter] = useState(earlier?.better ?? '');
  const [addAction, setAddAction] = useState(!earlier?.action);
  const [saving, setSaving] = useState(false);

  // What got done today: habits (with Focus minutes when there were any) and checked priorities.
  const glance = useMemo(() => {
    const done = records.filter((r) => r.date === date && r.status === 'done');
    const items = habits
      .filter((h) => h.kind === 'habit' && done.some((r) => r.habit_id === h.id))
      .map((h) => {
        const minutes = focusLog
          .filter((f) => f.date === date && f.habit_id === h.id)
          .reduce((n, f) => n + f.minutes, 0);
        return { name: h.name, minutes };
      });
    return glanceLine(items, priorities.filter((p) => p.done_on === date).length);
  }, [records, habits, focusLog, priorities, date]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const save = async (replaceId: number | null) => {
    setSaving(true);
    await closeDay(tidyClose(date, { reflection, action, better }), {
      addAction: addAction && replaceId !== -1,
      replaceId: replaceId === -1 ? null : replaceId,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    close();
  };

  const done = () => {
    const c = tidyClose(date, { reflection, action, better });
    if (isEmptyClose(c)) return close(); // an empty sheet saves nothing
    const open = openPriorities(priorities);
    if (!addAction || !c.action || open.length < MAX_OPEN) return save(null);
    // Three priorities already open: replace one, or keep the action in the journal only.
    const labels = [...open.map((p) => `Replace “${p.text}”`), 'Keep it in the journal only'];
    const pick = (i: number) => save(i < open.length ? open[i].id : -1);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `You already have ${MAX_OPEN} priorities`,
          options: [...labels, 'Cancel'],
          cancelButtonIndex: labels.length,
        },
        (i) => i < labels.length && pick(i),
      );
    } else {
      Alert.alert(`You already have ${MAX_OPEN} priorities`, undefined, [
        ...labels.map((text, i) => ({ text, onPress: () => pick(i) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <View style={s.bar}>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
          <Text style={s.barLink}>Not tonight</Text>
        </Pressable>
        <Text style={s.title}>Close the day</Text>
        <Pressable onPress={done} disabled={saving} hitSlop={12} accessibilityRole="button">
          <Text style={[s.barLink, s.barDone]}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {glance && <Text style={s.glance}>{glance}</Text>}

        <Label hint="optional">How did today go?</Label>
        <Input value={reflection} onChangeText={setReflection} multiline style={s.multi} placeholder="A few lines" />

        <Label hint="optional">One action item</Label>
        <Input
          value={action}
          onChangeText={setAction}
          placeholder="A concrete task for tomorrow"
          returnKeyType="next"
        />
        {action.trim() ? (
          <View style={{ marginTop: 8 }}>
            <Toggle label="Add to tomorrow’s priorities" value={addAction} onChange={setAddAction} />
          </View>
        ) : null}

        <Label hint="optional">Tomorrow I’ll do better at…</Label>
        <Input value={better} onChangeText={setBetter} placeholder="How, not what" returnKeyType="done" />

        <View style={{ marginTop: 24 }}>
          <Button title="Done" onPress={done} disabled={saving} />
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    title: { fontSize: 17, fontWeight: '700', color: t.text },
    barLink: { fontSize: 16, color: t.textMuted },
    barDone: { color: t.accent, fontWeight: '600' },
    body: { padding: 16, paddingBottom: 40 },
    glance: { fontSize: 15, color: t.textMuted, lineHeight: 21 },
    multi: { minHeight: 88, textAlignVertical: 'top' },
  });
