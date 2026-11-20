import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useStore } from '../store';
import { pageDates, recapLines, weekCounts } from '../lib/journal';
import { WEEKDAY_NAMES, fromKey, weekday } from '../lib/dates';
import { useTheme, useThemedStyles, type Theme } from '../theme';

const SAVE_DEBOUNCE_MS = 400;

/**
 * One free-form page per day. Opens on today's page with the keyboard up; today is editable
 * until midnight, past pages are read-only. Nothing here is counted, flagged or reminded about.
 */
export function JournalScreen() {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { pages, ctx } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && picked < ctx.today ? picked : ctx.today; // follows midnight
  const isToday = date === ctx.today;
  const dates = pageDates(pages, ctx.today);
  const editor = useRef<TextInputInstance>(null);

  // Opening the tab: back to today with the keyboard ready.
  useFocusEffect(
    useCallback(() => {
      setPicked(null);
      const id = setTimeout(() => editor.current?.focus(), 250);
      return () => clearTimeout(id);
    }, []),
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.screen, { paddingTop: insets.top }]}
    >
      <DateStrip dates={dates} selected={date} today={ctx.today} onSelect={(d) => setPicked(d === ctx.today ? null : d)} />

      <View style={s.head}>
        <Text style={s.date}>
          {fromKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Settings">
          <SymbolView name="gearshape" size={22} tintColor={t.textMuted} fallback={<Text style={s.gear}>⚙︎</Text>} />
        </Pressable>
      </View>

      {weekday(date) === 0 && <SundayRecap sunday={date} />}

      {isToday ? (
        <TodayPage key={date} date={date} inputRef={editor} />
      ) : (
        <ScrollView contentContainerStyle={s.pastWrap}>
          <Text style={s.pastText} selectable>
            {pages[date]}
          </Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

/** Today's page: plain text, saved as you type. */
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
      textAlignVertical="top"
      placeholder="Today is for…"
      placeholderTextColor={t.textMuted}
      keyboardAppearance={t.dark ? 'dark' : 'light'}
      scrollEnabled
      autoCorrect
    />
  );
}

/** Days that have a page, plus today. Newest on the right; tap to read a past day. */
function DateStrip({
  dates,
  selected,
  today,
  onSelect,
}: {
  dates: string[];
  selected: string;
  today: string;
  onSelect(d: string): void;
}) {
  const s = useThemedStyles(makeStyles);
  const scroller = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.strip}
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
    >
      {dates.map((d, i) => {
        const day = fromKey(d);
        const newMonth = i === 0 || fromKey(dates[i - 1]).getMonth() !== day.getMonth();
        const active = d === selected;
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            style={[s.pill, active && s.pillActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={day.toDateString()}
          >
            <Text style={[s.pillTop, active && s.pillTextActive]}>
              {newMonth ? day.toLocaleDateString(undefined, { month: 'short' }) : WEEKDAY_NAMES[weekday(d)]}
            </Text>
            <Text style={[s.pillNum, active && s.pillTextActive]}>{d === today ? 'Today' : day.getDate()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Sundays: what I did this week (counts only) and the first line of each page Mon–Sat. */
function SundayRecap({ sunday }: { sunday: string }) {
  const s = useThemedStyles(makeStyles);
  const { habits, idx, ctx, pages } = useStore();
  const counts = weekCounts(habits, idx, ctx, sunday);
  const lines = recapLines(pages, sunday);
  if (!counts.length && !lines.length) return null;
  return (
    <View style={s.recap}>
      <Text style={s.recapLabel}>This week</Text>
      {counts.length > 0 && <Text style={s.recapCounts}>{counts.map((c) => c.text).join(' · ')}</Text>}
      {lines.map((l) => (
        <Text key={l.date} style={s.recapLine} numberOfLines={2}>
          <Text style={s.recapDay}>{WEEKDAY_NAMES[weekday(l.date)]} </Text>
          {l.line}
        </Text>
      ))}
      <Pressable onPress={() => router.push('/')} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
        <Text style={s.recapLink}>Adjust habits</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    strip: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
    pill: { alignItems: 'center', minWidth: 48, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12 },
    pillActive: { backgroundColor: t.accent },
    pillTop: { fontSize: 11, fontWeight: '600', color: t.textMuted },
    pillNum: { fontSize: 15, fontWeight: '700', color: t.text, marginTop: 1 },
    pillTextActive: { color: t.onAccent },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4 },
    date: { fontSize: 20, fontWeight: '700', color: t.text },
    gear: { fontSize: 20, color: t.textMuted },
    page: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
      fontSize: 17,
      lineHeight: 25,
      color: t.text,
    },
    pastWrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 60 },
    pastText: { fontSize: 17, lineHeight: 25, color: t.text },
    recap: {
      marginHorizontal: 16,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.surface,
      gap: 3,
    },
    recapLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    recapCounts: { fontSize: 14, color: t.text, fontWeight: '600', lineHeight: 20, marginBottom: 2 },
    recapLine: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
    recapDay: { fontWeight: '700', color: t.text },
    recapLink: { fontSize: 13, color: t.accent, fontWeight: '600' },
  });
