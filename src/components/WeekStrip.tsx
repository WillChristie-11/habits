import React, { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store';
import { dayCompletion, periodSummary, progress, timeline, visibleOn } from '../lib/schedule';
import { WEEKDAY_SHORT, addDays, fromKey, weekDays, weekStart, weekday } from '../lib/dates';
import { Dot } from './Dots';
import { useTheme, useThemedStyles, type Theme } from '../theme';

interface Props {
  selected: string;
  onSelect(date: string): void;
}

const RING = 34;

/**
 * The week the selected day is in: a ring per day (that day's completion), the week's overall %,
 * swipe or ‹ › for other weeks, tap a day to show it below. "Grid" expands habits × days.
 */
export function WeekStrip({ selected, onSelect }: Props) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const { habits, idx, ctx } = useStore();
  const [grid, setGrid] = useState(false);
  const days = weekDays(selected);
  const isCurrentWeek = weekStart(selected) === weekStart(ctx.today);
  const summary = periodSummary(habits, idx, days, ctx);

  // Move by whole weeks, keeping the weekday; never past today.
  const shiftWeek = (dir: -1 | 1) => {
    if (dir === 1 && isCurrentWeek) return;
    const next = addDays(selected, dir * 7);
    Haptics.selectionAsync().catch(() => {});
    onSelect(next > ctx.today ? ctx.today : next);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx > 40) shiftWeek(-1);
          else if (g.dx < -40) shiftWeek(1);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, isCurrentWeek, ctx.today],
  );

  const label = isCurrentWeek ? 'This week' : rangeLabel(days[0], days[6]);
  const rank = { morning: 0, evening: 1, week: 2 } as const;
  const tracked = habits
    .filter((h) => h.kind === 'habit' && days.some((d) => visibleOn(h, idx, ctx, d)))
    .sort((a, b) => rank[a.section] - rank[b.section] || a.order - b.order);

  return (
    <View style={s.card} {...pan.panHandlers}>
      <View style={s.head}>
        <Pressable onPress={() => shiftWeek(-1)} hitSlop={12} accessibilityLabel="Previous week">
          <Text style={s.chev}>‹</Text>
        </Pressable>
        <Text style={s.label}>
          {label}
          {summary.pct != null && <Text style={s.pct}>{`  ${Math.round(summary.pct * 100)}%`}</Text>}
        </Text>
        <Pressable
          onPress={() => shiftWeek(1)}
          hitSlop={12}
          disabled={isCurrentWeek}
          accessibilityLabel="Next week"
        >
          <Text style={[s.chev, isCurrentWeek && { opacity: 0.25 }]}>›</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setGrid((g) => !g)} hitSlop={10}>
          <Text style={s.gridBtn}>{grid ? 'Hide grid' : 'Grid'}</Text>
        </Pressable>
      </View>

      <View style={s.days}>
        {days.map((d) => {
          const future = d > ctx.today;
          const c = dayCompletion(habits, idx, ctx, d);
          const isSel = d === selected;
          return (
            <Pressable
              key={d}
              disabled={future}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(d);
              }}
              style={[s.day, isSel && s.daySel]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel, disabled: future }}
              accessibilityLabel={`${fromKey(d).toDateString()}${future ? '' : `, ${c.done} of ${c.total} done`}`}
            >
              <Text style={[s.dow, d === ctx.today && s.todayText]}>{WEEKDAY_SHORT[weekday(d)]}</Text>
              <View style={{ width: RING, height: RING, opacity: future ? 0.35 : 1 }}>
                <MiniRing pct={future ? 0 : c.pct} empty={c.total === 0} color={t.accent} track={t.border} />
                <View style={[StyleSheet.absoluteFill, s.center]}>
                  <Text style={[s.num, d === ctx.today && s.todayText]}>{Number(d.slice(8))}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {grid && (
        <View style={s.grid}>
          {tracked.length === 0 && <Text style={s.gridEmpty}>No habits this week.</Text>}
          {tracked.length > 0 && (
            <View style={s.gridRow}>
              <View style={{ width: 92 }} />
              <View style={s.gridCells}>
                {days.map((d) => (
                  <Text key={d} style={[s.gridHead, d === ctx.today && s.todayText]}>
                    {WEEKDAY_SHORT[weekday(d)]}
                  </Text>
                ))}
              </View>
              <Text style={[s.gridPct, s.gridHeadPct]}>{isCurrentWeek ? 'so far' : 'week'}</Text>
            </View>
          )}
          {tracked.map((h) => {
            const tl = timeline(h, idx, days[0], days[6], ctx);
            const p = progress(h, idx, days, ctx);
            const text =
              h.habit_kind === 'avoid' ? '' : p.target != null ? `${p.done}/${p.target}` : p.pct == null ? '—' : `${Math.round(p.pct * 100)}%`;
            return (
              <View key={h.id} style={s.gridRow}>
                <Text style={s.gridName} numberOfLines={1}>
                  {h.name}
                </Text>
                <View style={s.gridCells}>
                  {days.map((d) => (
                    <Pressable key={d} disabled={d > ctx.today} onPress={() => onSelect(d)} style={s.gridCell} hitSlop={2}>
                      <Dot state={tl.states.get(d) ?? 'none'} size={14} />
                    </Pressable>
                  ))}
                </View>
                <Text style={s.gridPct}>{text}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MiniRing({ pct, empty, color, track }: { pct: number; empty: boolean; color: string; track: string }) {
  const stroke = 3;
  const r = (RING - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      {!empty && pct > 0 && (
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - pct)}
        />
      )}
    </Svg>
  );
}

function rangeLabel(a: string, b: string): string {
  const fa = fromKey(a);
  const fb = fromKey(b);
  const m = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return fa.getMonth() === fb.getMonth()
    ? `${m(fa)} ${fa.getDate()} – ${fb.getDate()}`
    : `${m(fa)} ${fa.getDate()} – ${m(fb)} ${fb.getDate()}`;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.surface, borderRadius: 14, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, marginTop: 14 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    chev: { fontSize: 22, color: t.accent, lineHeight: 24, paddingHorizontal: 2 },
    label: { fontSize: 14, fontWeight: '600', color: t.text },
    pct: { fontSize: 14, fontWeight: '500', color: t.textMuted },
    gridBtn: { fontSize: 13, color: t.accent, fontWeight: '600' },
    days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    day: { alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 3, borderRadius: 12, flex: 1 },
    daySel: { backgroundColor: t.accentSoft },
    dow: { fontSize: 11, color: t.textMuted, fontWeight: '600' },
    num: { fontSize: 12, color: t.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
    todayText: { color: t.accent },
    center: { alignItems: 'center', justifyContent: 'center' },
    grid: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, marginTop: 8, paddingTop: 6 },
    gridEmpty: { fontSize: 13, color: t.textMuted, padding: 6 },
    gridRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 4 },
    gridName: { width: 92, fontSize: 13, color: t.text },
    gridCells: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    gridCell: { padding: 2 },
    gridHead: { width: 18, textAlign: 'center', fontSize: 11, fontWeight: '600', color: t.textMuted },
    gridHeadPct: { fontSize: 11 },
    gridPct: { width: 40, textAlign: 'right', fontSize: 12, color: t.textMuted, fontVariant: ['tabular-nums'] },
  });
