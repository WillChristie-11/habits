import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '../theme';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segItem, active && styles.segActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
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
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))} hitSlop={6}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>
        {value}
        {suffix ? ` ${suffix}` : ''}
      </Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + 1))} hitSlop={6}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.sub} {...props} style={[styles.input, props.style]} />;
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' && { backgroundColor: colors.accent },
        kind === 'secondary' && { backgroundColor: colors.card },
        kind === 'danger' && { backgroundColor: colors.redSoft },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          kind === 'primary' && { color: '#fff' },
          kind === 'danger' && { color: colors.red },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: '#EBEBE8', borderRadius: 10, padding: 2 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  segText: { fontSize: 13, color: colors.sub, fontWeight: '500' },
  segTextActive: { color: colors.text, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EBEBE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: colors.text, marginTop: -2 },
  stepValue: { fontSize: 16, fontWeight: '600', color: colors.text, minWidth: 70, textAlign: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 20, marginBottom: 8, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.sub, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: colors.sub },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.text,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#EBEBE8' },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: 14, color: colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '600', color: colors.text },
});
