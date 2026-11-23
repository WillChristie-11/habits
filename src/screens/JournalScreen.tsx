import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { recapLines, weekCounts } from '../lib/journal';
import { focusRecapLine } from '../lib/timers';
import { wakeAnchor, wakeWeek, minutesOfDay } from '../lib/insights';
import { WEEKDAY_NAMES, WEEKDAY_SHORT, addDays, fromKey, weekDays, weekStart, weekday } from '../lib/dates';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const SAVE_DEBOUNCE_MS = 400;
const DONE_BAR = 'journal-done';
/** How far a horizontal swipe must travel to change the day or week. */
const SWIPE_PX = 60;

function useKeyboardUp() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return up;
}

/**
 * Horizontal swipe → onSwipe(-1) for right (earlier), onSwipe(1) for left (later). The content
 * follows the finger a little; vertical scrolling is untouched.
 */
function SwipeArea({
  enabled,
  onSwipe,
  style,
  children,
}: {
  enabled: boolean;
  onSwipe(dir: -1 | 1): void;
  style?: React.ComponentProps<typeof Animated.View>['style'];
  children: React.ReactNode;
}) {
  const [tx] = useState(() => new Animated.Value(0));
  const pan = usePanGesture({
    enabled,
    runOnJS: true,
    activeOffsetX: [-18, 18],
    failOffsetY: [-14, 14],
    onUpdate: (e) => tx.setValue(e.translationX * 0.35),
    onDeactivate: (e) => {
      if (e.translationX > SWIPE_PX) onSwipe(-1);
      else if (e.translationX < -SWIPE_PX) onSwipe(1);
    },
    onFinalize: () => Animated.spring(tx, { toValue: 0, useNativeDriver: true, friction: 8 }).start(),
  });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, { transform: [{ translateX: tx }] }]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/**
 * One free-form page per day. Opens on today's page without the keyboard; tap the text to write.
 * Today is editable until midnight, other days are read-only. Nothing here is counted, flagged or
 * reminded about.
 */
export function JournalScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { pages, ctx } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && picked < ctx.today ? picked : ctx.today; // follows midnight
  const isToday = date === ctx.today;
  const editor = useRef<TextInputInstance>(null);
  const keyboardUp = useKeyboardUp();

  /** One day at a time, empty days included; never past today. */
  const moveDay = (dir: -1 | 1) => {
    const next = addDays(date, dir);
    if (next > ctx.today) return;
    Haptics.selectionAsync().catch(() => {});
    setPicked(next === ctx.today ? null : next);
  };

  // Opening the tab: back to today, keyboard down.
  useFocusEffect(
    useCallback(() => {
      setPicked(null);
    }, []),
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.screen, { paddingTop: insets.top }]}
    >
      <WeekStrip
        selected={date}
        today={ctx.today}
        pages={pages}
        onSelect={(d) => setPicked(d === ctx.today ? null : d)}
      />

      {/* Swipe the page for the previous / next day (on today's page only with the keyboard down). */}
      <SwipeArea enabled={!(isToday && keyboardUp)} onSwipe={moveDay} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.date}>
            {fromKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          {weekday(date) === 0 && <SundayRecap sunday={date} />}
          {isToday ? (
            <TodayPage key={date} date={date} inputRef={editor} />
          ) : pages[date] ? (
            <Text style={s.pageText} selectable>
              {pages[date]}
            </Text>
          ) : (
            <Text style={s.nothing}>Nothing written this day.</Text>
          )}
        </ScrollView>
      </SwipeArea>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={DONE_BAR}>
          <View style={s.doneBar}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={10} accessibilityRole="button">
              <Text style={s.doneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
}

/** Today's page: plain text in the system font (light), saved as you type. Grows with the text. */
function TodayPage({ date, inputRef }: { date: string; inputRef: React.RefObject<TextInputInstance | null> }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { pages, savePage } = useStore();
  const [text, setText] = useState(pages[date] ?? '');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const saved = useRef(text);
  // savePage changes identity whenever pages change; keep the latest in a ref so flush is stable.
  const save = useRef(savePage);
  useEffect(() => {
    save.current = savePage;
  }, [savePage]);

  const flush = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    if (latest.current === saved.current) return;
    saved.current = latest.current;
    save.current(date, latest.current);
  }, [date]);

  // Save whatever is left when leaving the page.
  useEffect(() => () => flush(), [flush]);

  return (
    <TextInput
      ref={inputRef}
      style={s.page}
      value={text}
      onChangeText={(v) => {
        setText(v);
        latest.current = v;
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
      }}
      onBlur={flush}
      multiline
      scrollEnabled={false}
      textAlignVertical="top"
      placeholder="Today is for…"
      placeholderTextColor={t.textMuted}
      keyboardAppearance={t.dark ? 'dark' : 'light'}
      inputAccessoryViewID={DONE_BAR}
      autoCorrect
    />
  );
}

/** Mon–Sun; swipe it or use ‹ › for other weeks, like Today. A dot marks days with writing. */
function WeekStrip({
  selected,
  today,
  pages,
  onSelect,
}: {
  selected: string;
  today: string;
  pages: Record<string, string>;
  onSelect(d: string): void;
}) {
  const s = useThemedStyles(makeStyles);
  const days = weekDays(selected);
  const current = weekStart(selected) === weekStart(today);
  const shift = (dir: -1 | 1) => {
    if (dir === 1 && current) return;
    Haptics.selectionAsync().catch(() => {});
    const next = addDays(selected, dir * 7);
    onSelect(next > today ? today : next);
  };
  const fa = fromKey(days[0]);
  const fb = fromKey(days[6]);
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const label = current
    ? 'This week'
    : fa.getMonth() === fb.getMonth()
      ? `${m(fa)} ${fa.getDate()} – ${fb.getDate()}`
      : `${m(fa)} ${fa.getDate()} – ${m(fb)} ${fb.getDate()}`;
  return (
    <SwipeArea enabled onSwipe={shift} style={s.strip}>
      <View style={s.stripHead}>
        <Pressable onPress={() => shift(-1)} hitSlop={12} accessibilityLabel="Previous week">
          <Text style={s.chev}>‹</Text>
        </Pressable>
        <Text style={s.stripLabel}>{label}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={12} disabled={current} accessibilityLabel="Next week">
          <Text style={[s.chev, current && { opacity: 0.25 }]}>›</Text>
        </Pressable>
      </View>
      <View style={s.days}>
        {days.map((d) => {
          const future = d > today;
          const sel = d === selected;
          return (
            <Pressable
              key={d}
              disabled={future}
              onPress={() => onSelect(d)}
              style={[s.day, sel && s.daySel, future && { opacity: 0.35 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel, disabled: future }}
              accessibilityLabel={fromKey(d).toDateString()}
            >
              <Text style={[s.dow, sel && s.dayTextSel]}>{WEEKDAY_SHORT[weekday(d)]}</Text>
              <Text style={[s.num, sel && s.dayTextSel, d === today && !sel && s.todayNum]}>{Number(d.slice(8))}</Text>
              <View style={[s.pageDot, pages[d]?.trim() ? (sel ? s.pageDotSel : s.pageDotOn) : null]} />
            </Pressable>
          );
        })}
      </View>
    </SwipeArea>
  );
}

/**
 * Sundays: what I did this week (counts and totals only, with any "what did you do" lines),
 * wake-up times, the first line of each page Mon–Sat, last week's intention, then one optional
 * line for the coming week.
 */
function SundayRecap({ sunday }: { sunday: string }) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { habits, idx, ctx, pages, weeks, saveWeek, occurrences, focusLog } = useStore();
  const focusLine = focusRecapLine(focusLog, weekDays(sunday));
  const counts = weekCounts(habits, idx, ctx, sunday, occurrences);
  const lines = recapLines(pages, sunday);
  const wake = wakeWeek(wakeAnchor(habits), idx, weekDays(sunday));
  const thisWeek = weeks[weekStart(sunday)];
  const nextWeek = addDays(sunday, 1);
  const editable = sunday === ctx.today;
  const [next, setNext] = useState(weeks[nextWeek] ?? '');
  if (!counts.length && !lines.length && !thisWeek && !editable && !weeks[nextWeek] && !wake.text && !focusLine)
    return null;
  return (
    <View style={s.recap}>
      <Text style={s.recapLabel}>This week</Text>
      {counts.map((c) => (
        <View key={c.habit.id}>
          <Text style={s.recapCount}>{c.text}</Text>
          {c.notes.map((n) => (
            <Text key={n.date} style={s.recapNote} numberOfLines={2}>
              <Text style={s.recapDay}>{WEEKDAY_NAMES[weekday(n.date)]} </Text>
              {n.text}
            </Text>
          ))}
        </View>
      ))}
      {focusLine && <Text style={s.recapCount}>{focusLine}</Text>}
      {wake.text && (
        <View style={s.wakeRow}>
          <Text style={s.recapLine}>
            <Text style={s.recapDay}>Sleep </Text>
            {wake.text}
          </Text>
          <WakeChart times={wake.times.map((x) => x.time)} color={t.accent} track={t.border} />
        </View>
      )}
      {lines.map((l) => (
        <Text key={l.date} style={s.recapLine} numberOfLines={2}>
          <Text style={s.recapDay}>{WEEKDAY_NAMES[weekday(l.date)]} </Text>
          {l.line}
        </Text>
      ))}
      {thisWeek && (
        <Text style={s.recapLine}>
          <Text style={s.recapDay}>Last week was for </Text>
          {thisWeek}
        </Text>
      )}
      {editable ? (
        <TextInput
          value={next}
          onChangeText={setNext}
          onEndEditing={() => saveWeek(nextWeek, next)}
          onBlur={() => saveWeek(nextWeek, next)}
          placeholder="This week is for…"
          placeholderTextColor={t.textMuted}
          keyboardAppearance={t.dark ? 'dark' : 'light'}
          style={s.recapInput}
          returnKeyType="done"
          maxLength={140}
        />
      ) : (
        weeks[nextWeek] && (
          <Text style={s.recapLine}>
            <Text style={s.recapDay}>The week after was for </Text>
            {weeks[nextWeek]}
          </Text>
        )
      )}
      <Pressable onPress={() => router.push('/')} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
        <Text style={s.recapLink}>Adjust habits</Text>
      </Pressable>
    </View>
  );
}

/** Mon–Sun wake times as dots: higher = earlier. Days without a time get a faint tick. */
function WakeChart({ times, color, track }: { times: (string | null)[]; color: string; track: string }) {
  const W = 112;
  const H = 30;
  const known = times.filter((x): x is string => !!x).map(minutesOfDay);
  const lo = Math.min(...known) - 15;
  const hi = Math.max(...known) + 15;
  const step = W / 7;
  return (
    <Svg width={W} height={H} accessibilityLabel="Wake times this week">
      <Line x1={0} y1={H - 1} x2={W} y2={H - 1} stroke={track} strokeWidth={1} />
      {times.map((tm, i) => {
        const cx = step * i + step / 2;
        if (!tm) return <Circle key={i} cx={cx} cy={H - 4} r={1.5} fill={track} />;
        const cy = 4 + ((minutesOfDay(tm) - lo) / Math.max(1, hi - lo)) * (H - 10);
        return <Circle key={i} cx={cx} cy={cy} r={3.5} fill={color} />;
      })}
    </Svg>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    strip: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
    stripHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6 },
    chev: { fontSize: 22, color: t.accent, lineHeight: 24, paddingHorizontal: 2 },
    stripLabel: { fontSize: 14, fontWeight: '600', color: t.text },
    days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    day: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12, gap: 2 },
    daySel: { backgroundColor: t.accent },
    dow: { fontSize: 11, fontWeight: '600', color: t.textMuted },
    num: { fontSize: 15, fontWeight: '700', color: t.text, fontVariant: ['tabular-nums'] },
    todayNum: { color: t.accent },
    dayTextSel: { color: t.onAccent },
    pageDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
    pageDotOn: { backgroundColor: t.accent },
    pageDotSel: { backgroundColor: t.onAccent },
    scroll: { flexGrow: 1, paddingBottom: 80 },
    date: { fontSize: 22, fontWeight: '700', color: t.text, paddingHorizontal: 20, paddingTop: 10 },
    page: {
      minHeight: 360,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
      fontSize: 19,
      lineHeight: 29,
      fontWeight: '300',
      color: t.journalText,
    },
    pageText: {
      paddingHorizontal: 20,
      paddingTop: 12,
      fontSize: 19,
      lineHeight: 29,
      fontWeight: '300',
      color: t.journalText,
    },
    nothing: { paddingHorizontal: 20, paddingTop: 16, fontSize: 15, color: t.textMuted },
    doneBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    doneText: { fontSize: 16, fontWeight: '700', color: t.accent },
    recap: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.surface,
      gap: 4,
    },
    recapLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    recapCount: { fontSize: 14, color: t.text, fontWeight: '600', lineHeight: 20 },
    recapNote: { fontSize: 13, color: t.textMuted, lineHeight: 18, marginLeft: 10 },
    recapLine: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
    recapDay: { fontWeight: '700', color: t.text },
    wakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 2 },
    recapInput: {
      marginTop: 6,
      backgroundColor: t.background,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      color: t.text,
    },
    recapLink: { fontSize: 13, color: t.accent, fontWeight: '600' },
  });
