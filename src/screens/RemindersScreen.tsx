import React, { useEffect, useMemo, useState } from 'react';
import { useShowHints } from '../components/useShowHints';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '../store';
import { Button, Help, Segmented, Stepper, Toggle } from '../components/ui';
import { TimeField } from '../components/TimeField';
import { SwipeRow } from '../components/SwipeRow';
import { getPermission, requestPermission, type PermissionState } from '../lib/notifications';
import { addDays, formatTime } from '../lib/dates';
import { liveSilenced, nudgeStart, upcomingRows, type UpcomingRow } from '../lib/reminders';
import { buildPlan } from '../lib/plan';
import type { Habit } from '../types';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const TIMER_NAMES: Record<string, string> = { focus: 'Focus round ends', meditate: 'Meditate ends' };

/**
 * Reminders: every notification in one place. Manage turns each source on or off and edits times
 * in place; Upcoming lists what today and tomorrow will say (swipe left to silence one).
 * Every change re-plans right away (same 60-notification cap).
 */
export function RemindersScreen() {
  const s = useThemedStyles(makeStyles);
  const store = useStore();
  const { settings, updateReminders, habits, ctx } = store;
  const r = settings.reminders;
  const [tab, setTab] = useState<'manage' | 'upcoming'>('manage');
  const [perm, setPerm] = useState<PermissionState | null>(null);
  useEffect(() => {
    getPermission().then(setPerm);
  }, []);
  const enablePermission = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'denied') Linking.openSettings();
  };
  const pausedToday = r.pausedOn === ctx.today;
  const anchors = habits
    .filter((h) => h.kind === 'anchor')
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''));
  const timed = habits
    .filter((h) => h.kind === 'habit' && h.scheduled_time)
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''));

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Text style={s.barTitle}>Reminders</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Text style={s.barBtn}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Toggle
          label="Pause all reminders today"
          note={
            pausedToday
              ? 'Nothing until midnight. This turns itself off tomorrow.'
              : 'Cancels every reminder until midnight.'
          }
          value={pausedToday}
          onChange={(v) => updateReminders({ pausedOn: v ? ctx.today : null })}
        />
        {perm && perm !== 'granted' && perm !== 'unsupported' && (
          <View style={s.permBox}>
            <Help>
              {perm === 'denied'
                ? 'Notifications are off for this app. Banners still show in the app.'
                : 'Allow notifications to get reminders when the app is closed.'}
            </Help>
            <View style={{ marginTop: 10 }}>
              <Button
                kind="primary"
                title={perm === 'denied' ? 'Open iPhone Settings' : 'Turn on notifications'}
                onPress={enablePermission}
              />
            </View>
          </View>
        )}
        <View style={{ marginTop: 16 }}>
          <Segmented<'manage' | 'upcoming'>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'manage', label: 'Manage' },
              { value: 'upcoming', label: 'Upcoming' },
            ]}
          />
        </View>

        {tab === 'upcoming' ? (
          <Upcoming />
        ) : (
          <>
            <Text style={s.group}>Anchors</Text>
            {anchors.length ? anchors.map((h) => <ItemRow key={h.id} h={h} />) : <Help>No anchors yet.</Help>}

            <Text style={s.group}>Habits</Text>
            {timed.length ? timed.map((h) => <ItemRow key={h.id} h={h} />) : null}
            <Help>Habits at a set time appear here. Avoid habits also get their nudges (see Upcoming).</Help>

            <Text style={s.group}>Morning reminder</Text>
            <View style={{ marginTop: 10, gap: 10 }}>
              <Toggle
                label="Morning reminder"
                note="Banner + notification listing unfinished morning habits."
                value={r.morningEnabled}
                onChange={(v) => updateReminders({ morningEnabled: v })}
              />
              {r.morningEnabled && (
                <View style={s.timeRow}>
                  <Text style={s.timeLabel}>Time</Text>
                  <TimeField value={r.morningTime} onChange={(morningTime) => updateReminders({ morningTime })} />
                </View>
              )}
            </View>

            <Text style={s.group}>Evening nudge</Text>
            <View style={{ marginTop: 10, gap: 10 }}>
              <Toggle
                label="Evening nudge"
                note={`From ${formatTime(nudgeStart(r))}: what’s left and how long until your deadline.`}
                value={r.eveningEnabled}
                onChange={(v) => updateReminders({ eveningEnabled: v })}
              />
              <View style={s.timeRow}>
                <Text style={s.timeLabel}>Deadline</Text>
                <TimeField
                  value={r.eveningDeadline}
                  onChange={(eveningDeadline) => updateReminders({ eveningDeadline })}
                />
              </View>
              <Toggle
                label="Close the day"
                note="One notification at Wind down: three optional lines, then you’re done. Not if the day is already closed."
                value={r.closeDayEnabled}
                onChange={(v) => updateReminders({ closeDayEnabled: v })}
              />
            </View>

            <Text style={s.group}>Random check-ins</Text>
            <View style={{ marginTop: 10, gap: 10 }}>
              <Toggle
                label="Check-ins"
                note="A few nudges at unpredictable times about something still open today."
                value={r.checkins.enabled}
                onChange={(enabled) => updateReminders({ checkins: { ...r.checkins, enabled } })}
              />
              {r.checkins.enabled && (
                <>
                  <View style={s.timeRow}>
                    <Text style={s.timeLabel}>Per day</Text>
                    <Stepper
                      value={r.checkins.count}
                      min={1}
                      max={6}
                      onChange={(count) => updateReminders({ checkins: { ...r.checkins, count } })}
                    />
                  </View>
                  <View style={s.timeRow}>
                    <Text style={s.timeLabel}>From</Text>
                    <TimeField
                      value={r.checkins.start}
                      onChange={(start) => updateReminders({ checkins: { ...r.checkins, start } })}
                    />
                  </View>
                  <View style={s.timeRow}>
                    <Text style={s.timeLabel}>Until</Text>
                    <TimeField
                      value={r.checkins.end}
                      onChange={(end) => updateReminders({ checkins: { ...r.checkins, end } })}
                    />
                  </View>
                  <View style={s.timeRow}>
                    <Text style={s.timeLabel}>At least apart</Text>
                    <Stepper
                      value={r.checkins.spacing}
                      min={30}
                      max={240}
                      step={15}
                      suffix="min"
                      onChange={(spacing) => updateReminders({ checkins: { ...r.checkins, spacing } })}
                    />
                  </View>
                </>
              )}
            </View>

            <Help>Check-ins rotate your motivational messages, as before.</Help>

            <Text style={s.group}>Activities catch-up</Text>
            <View style={{ marginTop: 10, gap: 10 }}>
              <Toggle
                label="Did you do any of these today?"
                note="Lists activities still under their weekly goal, with buttons that log them without opening the app."
                value={r.catchUp.enabled}
                onChange={(enabled) => updateReminders({ catchUp: { ...r.catchUp, enabled } })}
              />
              {r.catchUp.enabled && (
                <View style={s.timeRow}>
                  <Text style={s.timeLabel}>Time</Text>
                  <TimeField
                    value={r.catchUp.time}
                    onChange={(time) => updateReminders({ catchUp: { ...r.catchUp, time } })}
                  />
                </View>
              )}
            </View>

            <Text style={s.group}>Transition/timer alerts</Text>
            <View style={{ marginTop: 10 }}>
              <Toggle
                label="Timer alerts"
                note="A notification when a Focus round, a break or Meditate ends (Meditate only when the app is closed)."
                value={r.timerAlerts}
                onChange={(v) => updateReminders({ timerAlerts: v })}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** An anchor or timed habit: on/off, its time and the lead time, edited in place. */
function ItemRow({ h }: { h: Habit }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { setHabitReminder } = useStore();
  return (
    <View style={s.item}>
      <View style={s.itemTop}>
        <Text style={s.itemName} numberOfLines={1}>
          {h.name}
        </Text>
        <Switch
          value={h.reminder}
          onValueChange={(reminder) => setHabitReminder(h.id, { reminder })}
          trackColor={{ true: t.accent, false: t.muted }}
          accessibilityLabel={`Reminder for ${h.name}`}
        />
      </View>
      <View style={s.timeRow}>
        <TimeField
          value={h.scheduled_time ?? '09:00'}
          onChange={(scheduled_time) => setHabitReminder(h.id, { scheduled_time })}
        />
        {h.reminder && (
          <Stepper
            value={h.remind_before}
            min={0}
            max={60}
            step={5}
            suffix="min before"
            onChange={(remind_before) => setHabitReminder(h.id, { remind_before })}
          />
        )}
      </View>
    </View>
  );
}

/** Today and tomorrow, in time order, with what each will say. Swipe left to silence one. */
function Upcoming() {
  const showHints = useShowHints();
  const s = useThemedStyles(makeStyles);
  const store = useStore();
  const { settings, updateReminders, ctx } = store;
  const r = settings.reminders;
  const [now] = useState(() => new Date());
  const plan = useMemo(
    () => buildPlan({ ...store, reminders: r }, now),
    // the plan's sources
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      store.habits,
      store.idx,
      store.ctx,
      r,
      store.dayCloses,
      store.notToday,
      store.weeks,
      store.months,
      store.nudgeLog,
      now,
    ],
  );
  const rows = upcomingRows(plan, r);
  const timers = settings.reminders.timerAlerts
    ? Object.entries(settings.timers)
        .filter(([, end]) => end > now.getTime())
        .map(([key, end]) => ({ key, at: new Date(end) }))
    : [];
  const silence = (id: string) => updateReminders({ silenced: [...liveSilenced(r.silenced, ctx.today), id] });

  const day = (date: string) => (date === ctx.today ? 'Today' : date === addDays(ctx.today, 1) ? 'Tomorrow' : date);
  const dateOf = (x: UpcomingRow) =>
    x.kind === 'one'
      ? `${x.at.getFullYear()}-${String(x.at.getMonth() + 1).padStart(2, '0')}-${String(x.at.getDate()).padStart(2, '0')}`
      : x.date;

  return (
    <View style={{ marginTop: 8 }}>
      {r.pausedOn === ctx.today && <Help>Paused until midnight: today’s reminders aren’t listed.</Help>}
      {timers.map((x) => (
        <View key={x.key} style={s.up}>
          <Text style={s.upTime}>{formatTime(hm(x.at))}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.upGroup}>Timer alert</Text>
            <Text style={s.upTitle}>{TIMER_NAMES[x.key] ?? 'Timer ends'}</Text>
          </View>
        </View>
      ))}
      {rows.length === 0 && timers.length === 0 && <Help>Nothing scheduled for today or tomorrow.</Help>}
      {rows.map((x, i) => {
        const d = dateOf(x);
        const header = i === 0 || dateOf(rows[i - 1]) !== d ? <Text style={s.group}>{day(d)}</Text> : null;
        if (x.kind === 'checkins')
          return (
            <View key={x.id}>
              {header}
              <View style={s.up}>
                <Text style={s.upTime}> </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.upGroup}>Random check-ins</Text>
                  <Text style={s.upTitle}>
                    {x.count} {x.count === 1 ? 'check-in' : 'check-ins'} between {formatTime(x.start)} and{' '}
                    {formatTime(x.end)}
                  </Text>
                </View>
              </View>
            </View>
          );
        return (
          <View key={x.id}>
            {header}
            <SwipeRow
              name={x.title}
              actions={[]}
              onDelete={() => silence(x.id)}
              confirmTitle="Silence this one?"
              confirmMessage="Only this time. The reminder itself stays on."
            >
              <View style={s.up}>
                <Text style={s.upTime}>{formatTime(hm(x.at))}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.upGroup}>{x.group}</Text>
                  <Text style={s.upTitle}>{x.title}</Text>
                  {x.body ? (
                    <Text style={s.upBody} numberOfLines={3}>
                      {x.body}
                    </Text>
                  ) : null}
                </View>
              </View>
            </SwipeRow>
          </View>
        );
      })}
      {showHints && rows.some((x) => x.kind === 'one') && <Help>Swipe left on one to silence just that time.</Help>}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    barTitle: { fontSize: 20, fontWeight: '700', color: t.text },
    barBtn: { fontSize: 17, fontWeight: '600', color: t.accent },
    content: { paddingHorizontal: 16, paddingBottom: 60 },
    group: { fontSize: 17, fontWeight: '600', color: t.text, marginTop: 28, marginBottom: 6 },
    permBox: { backgroundColor: t.surface, borderRadius: 12, padding: 12, marginTop: 10 },
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    timeLabel: { fontSize: 16, color: t.text },
    item: { backgroundColor: t.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 8 },
    itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    itemName: { flex: 1, fontSize: 16, fontWeight: '600', color: t.text },
    up: { flexDirection: 'row', gap: 12, backgroundColor: t.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
    upTime: { width: 72, fontSize: 15, fontWeight: '600', color: t.text, fontVariant: ['tabular-nums'] },
    upGroup: { fontSize: 12, fontWeight: '600', color: t.textMuted },
    upTitle: { fontSize: 15, color: t.text, marginTop: 2 },
    upBody: { fontSize: 14, color: t.textMuted, marginTop: 2 },
  });
