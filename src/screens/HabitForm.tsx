import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Frequency, FrequencyType, Habit, HabitInput, ItemKind, Section } from '../types';
import { useStore } from '../store';
import { Chip, Help, Input, Label, Segmented, Stepper, Toggle } from '../components/ui';
import { TimeField, formatTime } from '../components/TimeField';
import { onTimeline, toMinutes } from '../lib/schedule';
import { WEEKDAY_NAMES } from '../lib/dates';
import { requestPermission } from '../lib/notifications';
import { MessageList } from '../components/MessageList';
import { useThemedStyles, type Theme } from '../theme';

interface Props {
  visible: boolean;
  habit: Habit | null; // null = new
  /** For new items: start as a habit or an anchor. */
  defaultKind?: ItemKind;
  onClose(): void;
}

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const LEADS: [number, string][] = [
  [0, 'At the time'],
  [5, '5 min before'],
  [10, '10 min'],
  [15, '15 min'],
  [30, '30 min'],
  [60, '1 h'],
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type When = 'morning' | 'evening' | 'time';

const sectionForTime = (hm: string): Section => (toMinutes(hm) < 12 * 60 ? 'morning' : 'evening');

export function HabitForm({ visible, habit, defaultKind = 'habit', onClose }: Props) {
  const s = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.screen}>{visible && <FormBody habit={habit} defaultKind={defaultKind} onClose={onClose} />}</View>
    </Modal>
  );
}

function FormBody({ habit, defaultKind, onClose }: { habit: Habit | null; defaultKind: ItemKind; onClose(): void }) {
  const s = useThemedStyles(makeStyles);
  const { habits, addHabit, editHabit } = useStore();

  const [kind, setKind] = useState<ItemKind>(habit?.kind ?? defaultKind);
  const [name, setName] = useState(habit?.name ?? '');
  const [ftype, setFtype] = useState<FrequencyType>(habit?.frequency.type ?? 'daily');
  const [count, setCount] = useState(habit?.frequency.count ?? 2);
  const [days, setDays] = useState<number[]>(
    habit?.frequency.type === 'specific_days'
      ? (habit.frequency.days ?? [])
      : (habit?.kind ?? defaultKind) === 'anchor'
        ? ALL_DAYS
        : [1, 3, 5],
  );
  const [n, setN] = useState(habit?.frequency.n ?? 2);
  const [when, setWhen] = useState<When>(
    habit?.kind === 'habit' && habit.scheduled_time ? 'time' : habit?.section === 'evening' ? 'evening' : 'morning',
  );
  const [time, setTime] = useState(habit?.scheduled_time ?? '08:00');
  const [hasEnd, setHasEnd] = useState(!!habit?.end_time);
  const [endTime, setEndTime] = useState(habit?.end_time ?? '09:00');
  const [why, setWhy] = useState(habit?.why ?? '');
  const [minimum, setMinimum] = useState(habit?.minimum_version ?? '');
  const [messages, setMessages] = useState<string[]>(habit?.messages ?? []);
  const [stackAfter, setStackAfter] = useState<number | null>(habit?.stack_after ?? null);
  const [reminder, setReminder] = useState(habit?.reminder ?? false);
  const [remindBefore, setRemindBefore] = useState(habit?.remind_before ?? 0);
  const [permDenied, setPermDenied] = useState(false);

  async function toggleReminder(on: boolean) {
    setReminder(on);
    if (on) setPermDenied((await requestPermission()) === 'denied');
  }

  const isAnchor = kind === 'anchor';
  const weekly = ftype === 'weekly_count' || ftype === 'every_n_days';
  const section: Section = isAnchor
    ? sectionForTime(time)
    : weekly
      ? 'week'
      : when === 'time'
        ? sectionForTime(time)
        : when;
  const scheduled = isAnchor || (!weekly && when === 'time');

  // Stack candidates: any anchor or timeline item, plus habits in the same section; never a loop.
  const createsLoop = (candidate: Habit) => {
    let cur: Habit | undefined = candidate;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      if (cur.id === habit?.id) return true;
      seen.add(cur.id);
      cur = cur.stack_after != null ? habits.find((x) => x.id === cur!.stack_after) : undefined;
    }
    return false;
  };
  const candidates = isAnchor || scheduled
    ? []
    : habits
        .filter((h) => h.id !== habit?.id && (onTimeline(h) || (h.kind === 'habit' && h.section === section)))
        .filter((h) => !createsLoop(h))
        .sort((a, b) => Number(onTimeline(b)) - Number(onTimeline(a)) || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''));
  const validAnchor = stackAfter != null && candidates.some((a) => a.id === stackAfter) ? stackAfter : null;

  const daysOk = isAnchor || ftype !== 'specific_days' ? true : days.length > 0;
  const anchorDaysOk = !isAnchor || days.length > 0;
  const canSave = name.trim().length > 0 && daysOk && anchorDaysOk;

  async function save() {
    if (!canSave) return;
    let frequency: Frequency;
    if (isAnchor) {
      frequency = days.length === 7 ? { type: 'daily' } : { type: 'specific_days', days: [...days].sort() };
    } else {
      switch (ftype) {
        case 'weekly_count':
          frequency = { type: ftype, count };
          break;
        case 'specific_days':
          frequency = { type: ftype, days: [...days].sort() };
          break;
        case 'every_n_days':
          frequency = { type: ftype, n };
          break;
        default:
          frequency = { type: 'daily' };
      }
    }
    const input: HabitInput = {
      kind,
      name: name.trim(),
      section,
      frequency,
      why: isAnchor ? null : why.trim() || null,
      minimum_version: isAnchor ? null : minimum.trim() || null,
      messages: isAnchor ? [] : messages,
      stack_after: validAnchor,
      scheduled_time: scheduled ? time : null,
      end_time: isAnchor && hasEnd ? endTime : null,
      reminder: scheduled && reminder,
      remind_before: remindBefore,
      meta: habit?.meta ?? null,
    };
    if (habit) await editHabit(habit.id, input);
    else await addHabit(input);
    onClose();
  }

  const reminderFields = (
    <View style={{ marginTop: 12, gap: 10 }}>
      <Toggle
        label="Remind me"
        note="Notification with Done, Later and Skip buttons."
        value={reminder}
        onChange={toggleReminder}
      />
      {reminder && (
        <View style={s.chips}>
          {LEADS.map(([min, label]) => (
            <Chip key={min} label={label} active={remindBefore === min} onPress={() => setRemindBefore(min)} />
          ))}
        </View>
      )}
      {reminder && permDenied && (
        <Help>Notifications are turned off for this app. Turn them on in iPhone Settings → Notifications.</Help>
      )}
    </View>
  );

  const dayChips = (
    <View style={s.chips}>
      {MON_FIRST.map((d) => (
        <Chip
          key={d}
          label={WEEKDAY_NAMES[d]}
          active={days.includes(d)}
          onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
        />
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={s.bar}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={s.barBtn}>Cancel</Text>
        </Pressable>
        <Text style={s.barTitle}>
          {habit ? 'Edit' : 'New'} {isAnchor ? 'anchor' : 'habit'}
        </Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
          <Text style={[s.barBtn, s.barSave, !canSave && { opacity: 0.35 }]}>Save</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!habit && (
          <>
            <Segmented<ItemKind>
              value={kind}
              onChange={(k) => {
                if (k === kind) return;
                setKind(k);
                // Anchors default to every day; habits' "Days" default to Mon/Wed/Fri.
                setDays(k === 'anchor' ? ALL_DAYS : [1, 3, 5]);
              }}
              options={[
                { value: 'habit', label: 'Habit' },
                { value: 'anchor', label: 'Anchor' },
              ]}
            />
            <View style={{ marginTop: 8 }}>
              <Help>
                {isAnchor
                  ? 'A fixed point in your day, like Wake up or Work. Not tracked; tap to dismiss.'
                  : 'Something you want to do regularly. Tracked with dots and weekly %.'}
              </Help>
            </View>
          </>
        )}

        <Label>Name</Label>
        <Input
          value={name}
          onChangeText={setName}
          placeholder={isAnchor ? 'e.g. Breakfast' : 'e.g. Stretch'}
          autoFocus={!habit}
          returnKeyType="done"
        />

        {isAnchor ? (
          <>
            <Label>Time</Label>
            <TimeField value={time} onChange={setTime} />
            <View style={{ marginTop: 12 }}>
              <Toggle label="End time" value={hasEnd} onChange={setHasEnd} />
            </View>
            {hasEnd && (
              <View style={{ marginTop: 10 }}>
                <TimeField value={endTime} onChange={setEndTime} />
              </View>
            )}
            <Label>Days</Label>
            {dayChips}
            <Label>Reminder</Label>
            {reminderFields}
          </>
        ) : (
          <>
            <Label>How often</Label>
            <Segmented<FrequencyType>
              value={ftype}
              onChange={setFtype}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'specific_days', label: 'Days' },
                { value: 'weekly_count', label: 'Per week' },
                { value: 'every_n_days', label: 'Every N' },
              ]}
            />
            <View style={s.detail}>
              {ftype === 'daily' && <Help>Every day.</Help>}
              {ftype === 'specific_days' && (
                <>
                  {dayChips}
                  <Help>Only appears on these days.</Help>
                </>
              )}
              {ftype === 'weekly_count' && (
                <>
                  <Stepper value={count} min={1} max={7} onChange={setCount} suffix="× / week" />
                  <Help>Any days you like. Lives in “This week” and shows x/{count}.</Help>
                </>
              )}
              {ftype === 'every_n_days' && (
                <>
                  <Stepper value={n} min={2} max={30} onChange={setN} suffix="days" />
                  <Help>Lives in “This week”, marked due / overdue from the last time you did it.</Help>
                </>
              )}
            </View>

            {!weekly && (
              <>
                <Label>When</Label>
                <Segmented<When>
                  value={when}
                  onChange={setWhen}
                  options={[
                    { value: 'morning', label: 'Morning' },
                    { value: 'evening', label: 'Evening' },
                    { value: 'time', label: 'At a time' },
                  ]}
                />
                {when === 'time' && (
                  <View style={s.detail}>
                    <TimeField value={time} onChange={setTime} />
                    <Help>Shows on today’s schedule at this time.</Help>
                    {reminderFields}
                  </View>
                )}
              </>
            )}

            {candidates.length > 0 && (
              <>
                <Label hint="optional">Stack after</Label>
                <View style={s.chips}>
                  <Chip label="None" active={validAnchor == null} onPress={() => setStackAfter(null)} />
                  {candidates.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.scheduled_time && onTimeline(a) ? `${a.name} · ${formatTime(a.scheduled_time)}` : a.name}
                      active={validAnchor === a.id}
                      onPress={() => setStackAfter(a.id)}
                    />
                  ))}
                </View>
                {validAnchor != null && (
                  <View style={{ marginTop: 8 }}>
                    <Help>Shows right under it, and is highlighted once it’s done.</Help>
                  </View>
                )}
              </>
            )}

            <Label hint="optional">Why</Label>
            <Input value={why} onChangeText={setWhy} placeholder="What this does for you" multiline />

            <Label hint="optional">Minimum version</Label>
            <Input value={minimum} onChangeText={setMinimum} placeholder="The smallest version that still counts" />

            <Label hint="optional">More motivation</Label>
            <MessageList value={messages} onChange={setMessages} />
            <View style={{ marginTop: 8 }}>
              <Help>Reminders rotate through your why and these, one a day.</Help>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    barTitle: { fontSize: 16, fontWeight: '600', color: t.text },
    barBtn: { fontSize: 16, color: t.accent },
    barSave: { fontWeight: '600' },
    content: { padding: 16, paddingBottom: 80 },
    detail: { marginTop: 12, gap: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
