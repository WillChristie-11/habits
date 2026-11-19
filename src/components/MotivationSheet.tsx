import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Habit } from '../types';
import { Button } from './ui';
import { useThemedStyles, type Theme } from '../theme';

interface Props {
  habit: Habit | null;
  onDone(h: Habit): void;
  onSkip(h: Habit): void;
  onDetails(h: Habit): void;
  onClose(): void;
}

/** Shown when tapping an unchecked habit after its part of the day has passed. */
export function MotivationSheet({ habit, onDone, onSkip, onDetails, onClose }: Props) {
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!habit} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
      {habit && (
        <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <Text style={s.name}>{habit.name}</Text>
          <Text style={s.lead}>Still time to do a little.</Text>
          {habit.why && (
            <View style={s.block}>
              <Text style={s.label}>Why</Text>
              <Text style={s.text}>{habit.why}</Text>
            </View>
          )}
          {habit.minimum_version && (
            <View style={s.block}>
              <Text style={s.label}>Minimum version</Text>
              <Text style={s.text}>{habit.minimum_version}</Text>
            </View>
          )}
          <View style={{ gap: 8, marginTop: 18 }}>
            <Button title={habit.minimum_version ? 'Did the minimum ✓' : 'Done ✓'} onPress={() => onDone(habit)} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button kind="secondary" title="Skip today" onPress={() => onSkip(habit)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button kind="secondary" title="Details" onPress={() => onDetails(habit)} />
              </View>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: t.shadow, opacity: 0.35 },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    name: { fontSize: 22, fontWeight: '700', color: t.text },
    lead: { fontSize: 14, color: t.textMuted, marginTop: 2 },
    block: { backgroundColor: t.surface, borderRadius: 12, padding: 12, marginTop: 12 },
    label: { fontSize: 12, fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    text: { fontSize: 16, color: t.text, marginTop: 4, lineHeight: 22 },
  });
