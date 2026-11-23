import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ActivityUnit, Frequency, FrequencyType, Habit, HabitInput, HabitKind, ItemKind } from '../types';
import { useStore } from '../store';
import { Chip, Help, Input, Label, Segmented, Stepper, Toggle } from '../components/ui';
import { TimeField, formatTime } from '../components/TimeField';
import { counts, isWeekly } from '../lib/schedule';
import { linkedTimer, type TimerKind } from '../lib/timers';
import { WEEKDAY_NAMES } from '../lib/dates';
import { requestPermission } from '../lib/notifications';
import { suggestPlanWhen } from '../lib/reminders';
import { MessageList } from '../components/MessageList';
import { StepList } from '../components/StepList';
import { tileColors, useTheme, useThemedStyles, type Theme } from '../theme';
import { ACTIVITY_ICONS, ActivityIcon, activityLook, type ActivityIconName } from '../components/ActivityIcon';

interface Props {
  visible: boolean;
  habit: Habit | null; // null = new
  /** For new items: start as a habit, anchor or activity. */
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

/** after = under an anchor (or another habit); anytime = no anchor; time = its own time. */
type When = 'after' | 'anytime' | 'time';

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
  const theme = useTheme();

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
    habit?.kind === 'habit' && habit.scheduled_time ? 'time' : habit?.stack_after != null ? 'after' : 'anytime',
  );
  const [time, setTime] = useState(habit?.scheduled_time ?? '08:00');
  const [hasEnd, setHasEnd] = useState(!!habit?.end_time);
  const [endTime, setEndTime] = useState(habit?.end_time ?? '09:00');
  const [why, setWhy] = useState(habit?.why ?? '');
  const [minimum, setMinimum] = useState(habit?.minimum_version ?? '');
  const [messages, setMessages] = useState<string[]>(habit?.messages ?? []);
  const [habitKind, setHabitKind] = useState<HabitKind>(habit?.habit_kind ?? 'want');
  // The session timer was replaced by Focus; the stored length is kept as it is.
  const sessionMin = habit?.session_minutes ?? 15;
  // Get ready was removed; the stored length is kept as it is.
  const readyMin = habit?.ready_minutes ?? 3;
  const [ladder, setLadder] = useState<string[]>(habit?.ladder ?? []);
  const [ladderIndex, setLadderIndex] = useState(habit?.ladder_index ?? 0);
  const [pairWith, setPairWith] = useState(habit?.pair_with ?? '');
  // null = no plan; a string (even empty) = the plan fields are open.
  const [planWhen, setPlanWhen] = useState<string | null>(habit?.plan_when ?? null);
  const [planAction, setPlanAction] = useState(habit?.plan_action ?? '');
  const [obstacle, setObstacle] = useState<string | null>(habit?.obstacle ?? null);
  const [stackAfter, setStackAfter] = useState<number | null>(habit?.stack_after ?? null);
  const [reminder, setReminder] = useState(habit?.reminder ?? false);
  const [remindBefore, setRemindBefore] = useState(habit?.remind_before ?? 0);
  const [permDenied, setPermDenied] = useState(false);
  const [unit, setUnit] = useState<ActivityUnit | 'none'>(habit?.unit ?? (habit ? 'none' : 'mi'));
  const [hasGoal, setHasGoal] = useState(habit?.target_min != null || habit?.target_max != null);
  const [goal, setGoal] = useState(habit?.target_max ?? habit?.target_min ?? 3);
  const [askNote, setAskNote] = useState(habit?.ask_note ?? false);
  const [checkMin, setCheckMin] = useState(habit?.check_minutes ?? 45);
  const [locked, setLocked] = useState(habit?.locked ?? false);
  const [more, setMore] = useState(false);
  const [timerLink, setTimerLink] = useState<TimerKind | null>(linkedTimer(habit?.meta));
  const look = habit
    ? activityLook(habit)
    : { color: tileColors[0] as string, icon: ACTIVITY_ICONS[0] as ActivityIconName };
  const [tileColor, setTileColor] = useState<string>(look.color);
  const [tileIcon, setTileIcon] = useState<ActivityIconName>(look.icon);

  async function toggleReminder(on: boolean) {
    setReminder(on);
    if (on) setPermDenied((await requestPermission()) === 'denied');
  }

  const isAnchor = kind === 'anchor';
  const isActivity = kind === 'activity';
  const isHabit = kind === 'habit';
  const avoid = isHabit && habitKind === 'avoid';
  const cutBack = isHabit && habitKind === 'cut_back';
  /** A scheduled habit (want or avoid); cut-backs are only logged. */
  const plain = isHabit && !cutBack;
  const weekly = ftype === 'weekly_count' || ftype === 'every_n_days';
  const scheduled = isAnchor || (plain && !weekly && when === 'time');

  // Never stack on something that (eventually) stacks on this habit.
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
  const anchors = habits
    .filter((h) => h.kind === 'anchor')
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.id - b.id);
  // "Stack after another habit" (More options): untimed, non-weekly habits.
  const habitTargets =
    isHabit && !weekly && when !== 'time'
      ? habits.filter((h) => counts(h) && h.id !== habit?.id && !isWeekly(h) && !createsLoop(h))
      : [];
  const validAnchor =
    isHabit &&
    !weekly &&
    when === 'after' &&
    stackAfter != null &&
    (anchors.some((a) => a.id === stackAfter) || habitTargets.some((h) => h.id === stackAfter))
      ? stackAfter
      : null;
  const afterHabit = validAnchor != null && !anchors.some((a) => a.id === validAnchor);
  const anchorName = validAnchor != null ? (habits.find((x) => x.id === validAnchor)?.name ?? null) : null;
  const openPlan = () => {
    setPlanWhen(suggestPlanWhen(anchorName, scheduled ? time : null));
    if (!planAction.trim()) setPlanAction(name.trim().toLowerCase());
  };

  const daysOk = !isHabit || ftype !== 'specific_days' ? true : days.length > 0;
  const anchorDaysOk = !isAnchor || days.length > 0;
  const canSave = name.trim().length > 0 && daysOk && anchorDaysOk;

  async function save() {
    if (!canSave) return;
    let frequency: Frequency;
    if (isActivity || cutBack) {
      frequency = { type: 'daily' }; // unused: activities and cut-backs have no expected days
    } else if (isAnchor) {
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
      frequency,
      why: plain ? why.trim() || null : null,
      minimum_version: plain ? minimum.trim() || null : null,
      messages: plain ? messages : [],
      habit_kind: isHabit ? habitKind : 'want',
      session_minutes: sessionMin,
      ready_minutes: readyMin,
      // Avoid-only fields are kept only for avoid habits.
      ladder: avoid ? ladder : [],
      ladder_index: avoid ? Math.min(ladderIndex, ladder.length) : 0,
      pair_with: avoid ? pairWith.trim() || null : null,
      plan_when: plain ? planWhen?.trim() || null : null,
      plan_action: plain && planWhen?.trim() ? planAction.trim() || null : null,
      obstacle: plain ? obstacle?.trim() || null : null,
      unit: isActivity && unit !== 'none' ? unit : null,
      target_min: null,
      target_max: isActivity && hasGoal ? goal : null,
      ask_note: (plain || isAnchor) && askNote,
      check_minutes: checkMin,
      locked: cutBack && locked,
      stack_after: plain ? validAnchor : null,
      scheduled_time: scheduled ? time : null,
      end_time: isAnchor && hasEnd ? endTime : null,
      reminder: scheduled && reminder,
      remind_before: remindBefore,
      meta: isActivity
        ? { ...(habit?.meta ?? {}), color: tileColor, icon: tileIcon }
        : plain
          ? { ...(habit?.meta ?? {}), timer: timerLink ?? undefined }
          : (habit?.meta ?? null),
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

  // How many of the "More options" are already in use (shown on the collapsed row).
  const moreSet = [
    scheduled && reminder,
    (plain || isAnchor) && askNote,
    plain && timerLink === 'meditate',
    isHabit && afterHabit,
    isHabit && planWhen != null,
    isHabit && obstacle != null,
    isHabit && !!why.trim(),
    isHabit && !!minimum.trim(),
    isHabit && messages.length > 0,
  ].filter(Boolean).length;

  const title = `${habit ? 'Edit' : 'New'} ${isAnchor ? 'anchor' : isActivity ? 'activity' : 'habit'}`;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={s.bar}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={s.barBtn}>Cancel</Text>
        </Pressable>
        <Text style={s.barTitle}>{title}</Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
          <Text style={[s.barBtn, s.barSave, !canSave && { opacity: 0.35 }]}>Save</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Label>Name</Label>
        <Input
          value={name}
          onChangeText={setName}
          placeholder={isAnchor ? 'e.g. Breakfast' : isActivity ? 'e.g. Run' : 'e.g. Stretch'}
          autoFocus={!habit}
          returnKeyType="done"
        />

        {!habit && (
          <>
            <Label>Kind</Label>
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
                { value: 'activity', label: 'Activity' },
              ]}
            />
            <View style={{ marginTop: 8 }}>
              <Help>
                {isAnchor
                  ? 'A fixed point in your day, like Wake up or Work. Tap to mark it done.'
                  : isActivity
                    ? 'Something you just log when it happens, like a run. Never scheduled or missed.'
                    : 'Something you do regularly, with a schedule.'}
              </Help>
            </View>
          </>
        )}

        {isActivity && (
          <>
            <Label>Colour and icon</Label>
            <View style={s.swatches}>
              {tileColors.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setTileColor(c)}
                  style={[s.swatch, { backgroundColor: c }, tileColor === c && s.swatchOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tileColor === c }}
                  accessibilityLabel={`Colour ${c}`}
                />
              ))}
            </View>
            <View style={s.icons}>
              {ACTIVITY_ICONS.map((ic) => (
                <Pressable
                  key={ic}
                  onPress={() => setTileIcon(ic)}
                  style={[s.iconPick, tileIcon === ic && s.iconPickOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tileIcon === ic }}
                  accessibilityLabel={ic}
                >
                  <ActivityIcon
                    color={tileIcon === ic ? tileColor : theme.dotEmpty}
                    icon={ic}
                    size={40}
                    label={name || '•'}
                  />
                </Pressable>
              ))}
            </View>

            <Label>Unit</Label>
            <Segmented<ActivityUnit | 'none'>
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'mi', label: 'Miles' },
                { value: 'min', label: 'Minutes' },
                { value: 'none', label: 'None' },
              ]}
            />
            <View style={{ marginTop: 12 }}>
              <Toggle
                label="Weekly goal"
                note="Only shown in the Sunday recap, as 2/4. Never a goal you can miss."
                value={hasGoal}
                onChange={setHasGoal}
              />
            </View>
            {hasGoal && (
              <View style={s.targetRow}>
                <Stepper value={goal} min={1} max={14} onChange={setGoal} suffix="× a week" />
              </View>
            )}
          </>
        )}

        {isAnchor && (
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
          </>
        )}

        {isHabit && (
          <>
            <Label>Type</Label>
            <Segmented<HabitKind>
              value={habitKind}
              onChange={setHabitKind}
              options={[
                { value: 'want', label: 'Want to do' },
                { value: 'avoid', label: 'Tend to avoid' },
                { value: 'cut_back', label: 'Cut back' },
              ]}
            />
            <View style={{ marginTop: 8 }}>
              <Help>
                {avoid
                  ? 'For things you put off. It counts as done as soon as you start a short timed session.'
                  : cutBack
                    ? 'Something to do less of. Not on your list: log it from “Tempted?” when it happens. No streaks, nothing missed.'
                    : 'Counts as done when you check it off.'}
              </Help>
            </View>

            {cutBack && (
              <>
                <Label>Ask how I feel</Label>
                <Stepper value={checkMin} min={15} max={180} step={15} onChange={setCheckMin} suffix="min later" />
                <View style={{ marginTop: 8 }}>
                  <Help>A notification with a 1–5 scale and room for a short note.</Help>
                </View>
                <View style={{ marginTop: 14 }}>
                  <Toggle
                    label="Lock with Face ID"
                    note="Tempted? asks for Face ID, and the name is hidden in the recap and notifications."
                    value={locked}
                    onChange={setLocked}
                  />
                </View>
              </>
            )}

            {!cutBack && (
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
                  {ftype === 'specific_days' && dayChips}
                  {ftype === 'weekly_count' && (
                    <Stepper value={count} min={1} max={7} onChange={setCount} suffix="× / week" />
                  )}
                  {ftype === 'every_n_days' && <Stepper value={n} min={2} max={30} onChange={setN} suffix="days" />}
                  {weekly && <Help>Lives in “This week”.</Help>}
                </View>

                {!weekly && (
                  <>
                    <Label>When</Label>
                    <View style={s.chips}>
                      {anchors.map((a) => (
                        <Chip
                          key={a.id}
                          label={a.scheduled_time ? `${a.name} · ${formatTime(a.scheduled_time)}` : a.name}
                          active={validAnchor === a.id}
                          onPress={() => {
                            setWhen('after');
                            setStackAfter(a.id);
                          }}
                        />
                      ))}
                      {afterHabit && (
                        <Chip
                          label={`After ${habits.find((x) => x.id === validAnchor)?.name ?? ''}`}
                          active
                          onPress={() => {}}
                        />
                      )}
                      <Chip
                        label="Anytime"
                        active={when === 'anytime' || (when === 'after' && validAnchor == null)}
                        onPress={() => setWhen('anytime')}
                      />
                      <Chip label="At a time" active={when === 'time'} onPress={() => setWhen('time')} />
                    </View>
                    <View style={{ marginTop: 8 }}>
                      <Help>
                        {when === 'time'
                          ? 'Listed under Anytime on Today, at its time on Schedule.'
                          : validAnchor != null
                            ? 'Listed under it on Today, and highlighted once it’s done.'
                            : 'Listed under Anytime on Today.'}
                      </Help>
                    </View>
                    {when === 'time' && (
                      <View style={s.detail}>
                        <TimeField value={time} onChange={setTime} />
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {avoid && (
              <>
                <Label hint="optional">Ladder</Label>
                <StepList
                  steps={ladder}
                  current={ladderIndex}
                  onChange={(steps, cur) => {
                    setLadder(steps);
                    setLadderIndex(cur);
                  }}
                />
                <View style={{ marginTop: 8 }}>
                  <Help>Small concrete steps in order. The row shows only the next one.</Help>
                </View>

                <Label hint="optional">Pair with</Label>
                <Input value={pairWith} onChangeText={setPairWith} placeholder="e.g. good coffee" />
              </>
            )}
          </>
        )}

        {!isActivity && !cutBack && (
          <>
            <Pressable
              onPress={() => setMore((m) => !m)}
              style={s.moreRow}
              accessibilityRole="button"
              accessibilityState={{ expanded: more }}
            >
              <Text style={s.moreText}>More options</Text>
              <Text style={s.moreMeta}>
                {moreSet ? `${moreSet} set  ` : ''}
                {more ? '▴' : '▾'}
              </Text>
            </Pressable>

            {more && (
              <View>
                {scheduled && (
                  <>
                    <Label>Reminder</Label>
                    {reminderFields}
                  </>
                )}

                {plain && (
                  <>
                    <Label>Timer</Label>
                    <Segmented<TimerKind>
                      value={timerLink ?? 'focus'}
                      onChange={setTimerLink}
                      options={[
                        { value: 'focus', label: 'Focus' },
                        { value: 'meditate', label: 'Meditate' },
                      ]}
                    />
                    <View style={{ marginTop: 8 }}>
                      <Help>
                        {timerLink === 'meditate'
                          ? 'Its main button is Meditate · 10; finishing it checks it off.'
                          : avoid
                            ? 'Focus · 25 counts the moment the round starts. Clear head · 5 is Meditate first.'
                            : 'The first finished Focus round checks it off. Clear head · 5 is Meditate first.'}
                      </Help>
                    </View>
                  </>
                )}

                <View style={{ marginTop: 18 }}>
                  <Toggle
                    label="Ask what I did"
                    note="After checking it off, an optional one-line prompt. Lines show in the Sunday recap."
                    value={askNote}
                    onChange={setAskNote}
                  />
                </View>

                {habitTargets.length > 0 && (
                  <>
                    <Label hint="optional">Stack after another habit</Label>
                    <View style={s.chips}>
                      {habitTargets.map((h) => (
                        <Chip
                          key={h.id}
                          label={h.name}
                          active={validAnchor === h.id}
                          onPress={() => {
                            if (validAnchor === h.id) return setWhen('anytime');
                            setWhen('after');
                            setStackAfter(h.id);
                          }}
                        />
                      ))}
                    </View>
                  </>
                )}

                {plain && (
                  <>
                    <Label hint="optional">If-then plan</Label>
                    {planWhen == null ? (
                      <Pressable onPress={openPlan} style={s.addPlan} accessibilityRole="button">
                        <Text style={s.addPlanText}>＋ Add an if-then plan</Text>
                      </Pressable>
                    ) : (
                      <View style={s.planBox}>
                        <View style={s.planRow}>
                          <Text style={s.planWord}>When</Text>
                          <Input
                            value={planWhen}
                            onChangeText={setPlanWhen}
                            placeholder="I’ve poured my coffee"
                            style={{ flex: 1 }}
                          />
                        </View>
                        <View style={s.planRow}>
                          <Text style={s.planWord}>I will</Text>
                          <Input
                            value={planAction}
                            onChangeText={setPlanAction}
                            placeholder={name.trim().toLowerCase() || 'do it'}
                            style={{ flex: 1 }}
                          />
                        </View>
                        <Pressable onPress={() => setPlanWhen(null)} hitSlop={8}>
                          <Text style={s.removePlan}>Remove plan</Text>
                        </Pressable>
                      </View>
                    )}

                    <Label hint="optional">Obstacle plan</Label>
                    {obstacle == null ? (
                      <Pressable onPress={() => setObstacle('')} style={s.addPlan} accessibilityRole="button">
                        <Text style={s.addPlanText}>＋ Add an obstacle plan</Text>
                      </Pressable>
                    ) : (
                      <View style={s.planBox}>
                        <View style={s.planRow}>
                          <Text style={s.planWord}>If</Text>
                          <Input
                            value={obstacle}
                            onChangeText={setObstacle}
                            placeholder="I’m wiped out after work"
                            style={{ flex: 1 }}
                            autoFocus
                          />
                        </View>
                        <Text style={s.planTail}>
                          then I’ll do the minimum version{minimum.trim() ? `: ${minimum.trim()}` : '.'}
                        </Text>
                        <Pressable onPress={() => setObstacle(null)} hitSlop={8}>
                          <Text style={s.removePlan}>Remove</Text>
                        </Pressable>
                      </View>
                    )}

                    <Label hint="optional">Why</Label>
                    <Input value={why} onChangeText={setWhy} placeholder="What this does for you" multiline />

                    <Label hint="optional">Minimum version</Label>
                    <Input
                      value={minimum}
                      onChangeText={setMinimum}
                      placeholder="The smallest version that still counts"
                    />

                    <Label hint="optional">More motivation</Label>
                    <MessageList value={messages} onChange={setMessages} />
                  </>
                )}
              </View>
            )}
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
    addPlan: { borderRadius: 10, borderWidth: 1, borderColor: t.border, paddingVertical: 11, paddingHorizontal: 12 },
    addPlanText: { color: t.accent, fontWeight: '600', fontSize: 15 },
    planBox: { gap: 8 },
    planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    planWord: { width: 46, fontSize: 15, fontWeight: '600', color: t.text },
    planTail: { fontSize: 15, color: t.text, marginLeft: 56 },
    removePlan: { fontSize: 13, color: t.textMuted, marginLeft: 56, marginTop: 2 },
    moreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 28,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: t.surface,
    },
    moreText: { fontSize: 16, fontWeight: '600', color: t.text },
    moreMeta: { fontSize: 14, color: t.textMuted },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: t.background },
    swatchOn: { borderColor: t.text },
    icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    iconPick: { padding: 3, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
    iconPickOn: { borderColor: t.text },
    targetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
    targetTo: { fontSize: 15, color: t.textMuted },
  });
