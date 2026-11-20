import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import type { Habit, Occurrence } from '../types';
import { FEELINGS } from '../types';
import { useStore } from '../store';
import { isCutBack } from '../lib/schedule';
import { afterFeelingSummary, recentNotes } from '../lib/insights';
import { cancelFollowUp, scheduleFollowUp } from '../lib/notifications';
import { useEndTime } from '../components/useEndTime';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const WAIT_MIN = 10;

/**
 * Cut-back habits live here, not on Today. Log an occurrence with one tap (no red, no streaks,
 * nothing missed); N minutes later a notification asks how you feel. Each item shows how you
 * usually felt afterwards, a few of your own notes, and a "Wait 10 min" timer.
 */
export function TemptedScreen() {
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { habits, occurrences } = useStore();
  const { occ } = useLocalSearchParams<{ occ?: string }>();
  const items = habits.filter(isCutBack).sort((a, b) => a.order - b.order || a.id - b.id);
  const anyLocked = items.some((h) => h.locked);
  const [unlocked, setUnlocked] = useState(!anyLocked);
  const asked = useRef(false);

  const unlock = useCallback(async () => {
    let ok = false;
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock cut-back habits' });
      // No Face ID or passcode on the device: there's nothing to lock with, so let it through.
      ok = r.success || ['not_enrolled', 'not_available', 'passcode_not_set'].includes(r.error);
    } catch {}
    setUnlocked(ok);
  }, []);

  // Ask once, on open.
  useEffect(() => {
    if (!anyLocked || asked.current) return;
    asked.current = true;
    unlock();
  }, [anyLocked, unlock]);

  const shown = unlocked ? items : items.filter((h) => !h.locked);
  const focusOcc = occ ? Number(occ) : null;

  return (
    <View style={[s.screen, { paddingTop: 12, paddingBottom: insets.bottom }]}>
      <View style={s.bar}>
        <Text style={s.title}>Tempted?</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={s.done}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {items.length === 0 && (
          <Text style={s.empty}>
            Nothing here yet. To add something you want to do less of: ＋ → Habit → Type: Cut back.
          </Text>
        )}
        {shown.map((h) => (
          <CutBackCard
            key={h.id}
            habit={h}
            occurrences={occurrences.filter((o) => o.habit_id === h.id)}
            focusOcc={focusOcc}
          />
        ))}
        {anyLocked && !unlocked && (
          <Pressable onPress={unlock} style={s.unlock} accessibilityRole="button">
            <Text style={s.unlockText}>🔒 Unlock private items</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function CutBackCard({
  habit,
  occurrences,
  focusOcc,
}: {
  habit: Habit;
  occurrences: Occurrence[];
  focusOcc: number | null;
}) {
  const s = useThemedStyles(makeStyles);
  const { logOccurrence, removeOccurrence, now } = useStore();
  const [justLogged, setJustLogged] = useState<number | null>(null);
  // Saved end time + notification, so the wait stays right if you leave the app.
  const wait = useEndTime(`wait-${habit.id}`, {
    title: '10 minutes are up',
    body: 'Check in with yourself: still want it?',
  });
  const waitUntil = wait.endsAt;
  const left = wait.remaining ?? 0;
  useEffect(() => {
    if (waitUntil && left === 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [waitUntil, left]);

  // Ask "how do you feel now?" in the app too: the notification's log, or the latest unanswered
  // one whose check-in time has come (within a day).
  const nowMs = now.getTime();
  const due = [...occurrences]
    .reverse()
    .find(
      (o) =>
        o.id === focusOcc ||
        (o.feeling == null &&
          new Date(o.at).getTime() + habit.check_minutes * 60_000 <= nowMs &&
          nowMs - new Date(o.at).getTime() < 24 * 3600_000),
    );

  const summary = afterFeelingSummary(occurrences);
  const notes = recentNotes(occurrences);

  const log = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const id = await logOccurrence(habit);
    setJustLogged(id);
    const at = new Date(Date.now() + habit.check_minutes * 60_000);
    scheduleFollowUp(
      id,
      at,
      habit.locked ? 'How do you feel now?' : `How do you feel now, after ${habit.name.toLowerCase()}?`,
    );
  };
  const undo = async () => {
    if (justLogged == null) return;
    cancelFollowUp(justLogged);
    await removeOccurrence(justLogged);
    setJustLogged(null);
  };
  const startWait = () => {
    Haptics.selectionAsync().catch(() => {});
    wait.start(WAIT_MIN * 60_000);
  };
  const stopWait = () => wait.clear();

  return (
    <View style={s.card}>
      <Text style={s.name}>{habit.name}</Text>
      {summary && <Text style={s.summary}>{summary}</Text>}
      {notes.map((n, i) => (
        <Text key={i} style={s.note}>
          “{n}”
        </Text>
      ))}
      {!summary && !notes.length && (
        <Text style={s.hint}>After each log you’ll be asked how you feel. Your answers collect here.</Text>
      )}

      {waitUntil ? (
        <View style={s.wait}>
          <Text style={s.waitTime}>
            {left > 0
              ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`
              : 'Time’s up'}
          </Text>
          <Text style={s.waitText}>
            {left > 0 ? 'Just wait. You can still decide after.' : 'Still want it? Either way is okay.'}
          </Text>
          <Pressable onPress={stopWait} hitSlop={8}>
            <Text style={s.link}>{left > 0 ? 'Stop' : 'Close'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.actions}>
          <Pressable onPress={startWait} style={[s.btn, s.btnPrimary]} accessibilityRole="button">
            <Text style={[s.btnText, s.btnPrimaryText]}>Wait {WAIT_MIN} min</Text>
          </Pressable>
          <Pressable onPress={log} style={s.btn} accessibilityRole="button">
            <Text style={s.btnText}>Log it</Text>
          </Pressable>
        </View>
      )}

      {justLogged != null && (
        <View style={s.logged}>
          <Text style={s.loggedText}>Logged. I’ll ask how you feel in {habit.check_minutes} min.</Text>
          <Pressable onPress={undo} hitSlop={8}>
            <Text style={s.link}>Undo</Text>
          </Pressable>
        </View>
      )}

      {due && due.id !== justLogged && <FeelNow key={due.id} occurrence={due} />}
    </View>
  );
}

/** In-app version of the follow-up notification. */
function FeelNow({ occurrence }: { occurrence: Occurrence }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { rateOccurrence } = useStore();
  const [note, setNote] = useState(occurrence.note ?? '');
  const [picked, setPicked] = useState<number | null>(occurrence.feeling);
  const when = new Date(occurrence.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={s.feel}>
      <Text style={s.feelTitle}>How do you feel now? (logged {when})</Text>
      <View style={s.feelings}>
        {FEELINGS.map((label, i) => (
          <Pressable
            key={label}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setPicked(i + 1);
              rateOccurrence(occurrence.id, { feeling: i + 1 });
            }}
            style={[s.opt, picked === i + 1 && s.optOn]}
          >
            <Text style={[s.optNum, picked === i + 1 && s.optTextOn]}>{i + 1}</Text>
            <Text style={[s.optLabel, picked === i + 1 && s.optTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        onEndEditing={() => rateOccurrence(occurrence.id, { note: note.trim() || null })}
        placeholder="A short note (optional)"
        placeholderTextColor={t.textMuted}
        keyboardAppearance={t.dark ? 'dark' : 'light'}
        returnKeyType="done"
        maxLength={140}
        style={s.input}
      />
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
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    title: { fontSize: 28, fontWeight: '700', color: t.text },
    done: { fontSize: 16, fontWeight: '600', color: t.accent },
    content: { padding: 16, paddingBottom: 60, gap: 12 },
    empty: { fontSize: 15, color: t.textMuted, lineHeight: 21, marginTop: 20, textAlign: 'center' },
    card: { backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 6 },
    name: { fontSize: 19, fontWeight: '700', color: t.text },
    summary: { fontSize: 15, color: t.text, fontWeight: '500' },
    note: { fontSize: 14, color: t.textMuted, fontStyle: 'italic', lineHeight: 19 },
    hint: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
    btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: t.muted },
    btnPrimary: { backgroundColor: t.accent },
    btnText: { fontSize: 15, fontWeight: '700', color: t.text },
    btnPrimaryText: { color: t.onAccent },
    wait: {
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: t.accentSoft,
    },
    waitTime: { fontSize: 34, fontWeight: '700', color: t.text, fontVariant: ['tabular-nums'] },
    waitText: { fontSize: 14, color: t.textMuted },
    link: { fontSize: 14, color: t.accent, fontWeight: '600', marginTop: 2 },
    logged: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    loggedText: { fontSize: 13, color: t.textMuted, flex: 1 },
    feel: { marginTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, paddingTop: 10 },
    feelTitle: { fontSize: 14, color: t.text, fontWeight: '600' },
    feelings: { flexDirection: 'row', gap: 6 },
    opt: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, backgroundColor: t.muted },
    optOn: { backgroundColor: t.accent },
    optNum: { fontSize: 15, fontWeight: '600', color: t.text },
    optLabel: { fontSize: 10, color: t.textMuted, marginTop: 1 },
    optTextOn: { color: t.onAccent },
    input: {
      backgroundColor: t.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: t.text,
    },
    unlock: {
      alignSelf: 'center',
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: t.surface,
    },
    unlockText: { fontSize: 15, fontWeight: '600', color: t.text },
  });
