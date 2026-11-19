import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DayState, Habit } from '../types';
import { useThemedStyles, type Theme } from '../theme';
import { DeleteButton } from './HabitRow';
import { formatTime } from './TimeField';

interface Props {
  anchor: Habit;
  state: DayState;
  editMode: boolean;
  focus?: 'Now' | 'Next' | null;
  /** single tap: dismiss / un-dismiss */
  onToggle(): void;
  onOpen(): void;
  onDelete(): void;
}

/** A scheduled routine item (Wake up, Work). Not tracked: no %, no dots, no feeling. */
export function AnchorRow({ anchor, state, editMode, focus, onToggle, onOpen, onDelete }: Props) {
  const s = useThemedStyles(makeStyles);
  const dismissed = state === 'done' || state === 'skipped';
  return (
    <Pressable
      onPress={editMode ? undefined : onToggle}
      onLongPress={editMode ? undefined : onOpen}
      delayLongPress={350}
      style={[s.row, focus && s.focus, dismissed && s.dismissed]}
      accessibilityRole="button"
      accessibilityState={{ checked: dismissed }}
      accessibilityLabel={`${anchor.name}${dismissed ? ', done' : ''}`}
      accessibilityHint="Tap to dismiss. Long-press to edit."
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.name, dismissed && s.nameDone]} numberOfLines={1}>
          {anchor.name}
        </Text>
        {(anchor.end_time || focus) && (
          <View style={s.metaRow}>
            {focus && <Text style={s.focusText}>{focus}</Text>}
            {anchor.end_time && <Text style={s.meta}>until {formatTime(anchor.end_time)}</Text>}
          </View>
        )}
      </View>
      {editMode ? (
        <>
          <Pressable onPress={onOpen} hitSlop={8} style={{ paddingHorizontal: 8 }}>
            <Text style={s.edit}>Edit</Text>
          </Pressable>
          <DeleteButton onDelete={onDelete} />
        </>
      ) : (
        dismissed && <Text style={s.tick}>✓</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 46,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 6,
    },
    focus: { borderColor: t.accent, backgroundColor: t.accentSoft },
    dismissed: { opacity: 0.55 },
    name: { fontSize: 15, fontWeight: '600', color: t.text },
    nameDone: { color: t.textMuted },
    metaRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
    meta: { fontSize: 12, color: t.textMuted },
    focusText: { fontSize: 12, color: t.accent, fontWeight: '600' },
    tick: { fontSize: 15, color: t.textMuted, marginLeft: 8 },
    edit: { fontSize: 14, color: t.accent },
  });
