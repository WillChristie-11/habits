import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { status, useTheme, useThemedStyles, type Theme } from '../theme';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange(v: T): void;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[s.segItem, active && s.segActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.segText, active && s.segTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  min = 1,
  max = 30,
  onChange,
  suffix,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange(v: number): void;
  suffix?: string;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.stepper}>
      <Pressable style={s.stepBtn} onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6}>
        <Text style={s.stepBtnText}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>
        {value}
        {suffix ? ` ${suffix}` : ''}
      </Text>
      <Pressable style={s.stepBtn} onPress={() => onChange(Math.min(max, value + 1))} hitSlop={6}>
        <Text style={s.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{children}</Text>
      {hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  const s = useThemedStyles(makeStyles);
  return <Text style={s.help}>{children}</Text>;
}

export function Input(props: TextInputProps) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  return (
    <TextInput
      placeholderTextColor={t.textMuted}
      keyboardAppearance={t.dark ? 'dark' : 'light'}
      {...props}
      style={[s.input, props.style]}
    />
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]} accessibilityState={{ selected: active }}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, note }: { label: string; value: boolean; onChange(v: boolean): void; note?: string }) {
  const t = useTheme();
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {note && <Text style={s.help}>{note}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.muted }} />
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
}: {
  title: string;
  onPress(): void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, s[`btn_${kind}`], (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[s.btnText, s[`btnText_${kind}`]]}>{title}</Text>
    </Pressable>
  );
}

/** Rounded surface card. */
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const s = useThemedStyles(makeStyles);
  return <View style={[s.card, style]}>{children}</View>;
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    seg: { flexDirection: 'row', backgroundColor: t.muted, borderRadius: 10, padding: 2 },
    segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    segActive: {
      backgroundColor: t.surface,
      shadowColor: t.shadow,
      shadowOpacity: t.dark ? 0 : 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    segText: { fontSize: 13, color: t.textMuted, fontWeight: '500' },
    segTextActive: { color: t.text, fontWeight: '600' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: t.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { fontSize: 20, color: t.text, marginTop: -2 },
    stepValue: { fontSize: 16, fontWeight: '600', color: t.text, minWidth: 70, textAlign: 'center' },
    labelRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 22, marginBottom: 8, gap: 8 },
    label: { fontSize: 13, fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    hint: { fontSize: 12, color: t.textMuted },
    help: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
    input: {
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      color: t.text,
    },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: t.muted },
    chipActive: { backgroundColor: t.accent },
    chipText: { fontSize: 14, color: t.text },
    chipTextActive: { color: t.onAccent, fontWeight: '600' },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 12,
    },
    toggleLabel: { fontSize: 16, color: t.text },
    btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
    btn_primary: { backgroundColor: t.accent },
    btn_secondary: { backgroundColor: t.surface },
    btn_danger: { backgroundColor: status.deadlineSoft },
    btnText: { fontSize: 16, fontWeight: '600', color: t.text },
    btnText_primary: { color: t.onAccent },
    btnText_secondary: { color: t.text },
    btnText_danger: { color: status.deadline },
    card: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginTop: 16 },
  });
