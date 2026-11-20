import React, { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import { status, useTheme, useThemedStyles, type Theme } from '../theme';

export interface SwipeAction {
  label: string;
  onPress(): void;
  tone?: 'accent' | 'muted';
}

interface Props {
  name: string;
  /** Swipe left → red Delete → confirm. */
  onDelete(): void;
  /** Swipe right → these buttons (Skip, Get ready, …). */
  actions: SwipeAction[];
  children: React.ReactNode;
  /** Bottom gap of the row inside, so the action buttons line up with it. */
  gap?: number;
  radius?: number;
}

/** A row with swipe actions: left reveals Delete, right reveals the given actions. */
export function SwipeRow({ name, onDelete, actions, children, gap = 6, radius = 12 }: Props) {
  const s = useThemedStyles(makeStyles);
  const t = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const close = () => ref.current?.close();

  const confirmDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(`Delete ${name}?`, 'Its history will be removed.', [
      { text: 'Cancel', style: 'cancel', onPress: close },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  const box = { marginBottom: gap, borderRadius: radius };
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={36}
      rightThreshold={36}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => Haptics.selectionAsync().catch(() => {})}
      renderLeftActions={() =>
        actions.length ? (
          <View style={[s.actions, box]}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  close();
                  a.onPress();
                }}
                style={[s.action, box, { backgroundColor: a.tone === 'accent' ? t.accent : t.muted }]}
                accessibilityRole="button"
              >
                <Text style={[s.actionText, { color: a.tone === 'accent' ? t.onAccent : t.text }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null
      }
      renderRightActions={() => (
        <View style={[s.actions, box]}>
          <Pressable onPress={confirmDelete} style={[s.action, s.delete, box]} accessibilityRole="button">
            <Text style={[s.actionText, { color: status.onStatus }]}>Delete</Text>
          </Pressable>
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const makeStyles = (_t: Theme) =>
  StyleSheet.create({
    actions: { flexDirection: 'row', gap: 6, paddingHorizontal: 6 },
    action: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, minWidth: 76 },
    actionText: { fontSize: 14, fontWeight: '700' },
    delete: { backgroundColor: status.deadline },
  });
