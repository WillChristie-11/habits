import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../theme';
import { Input } from './ui';

/** 'HH:MM' (24h) ⇄ native iOS compact time picker. */
export function TimeField({ value, onChange }: { value: string; onChange(hm: string): void }) {
  const t = useTheme();
  const [h, m] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, h || 0, m || 0);

  if (Platform.OS === 'web') {
    // Used only for browser previews; the app targets iOS.
    return (
      <Input
        defaultValue={value}
        onChangeText={(v) => /^\d{1,2}:\d{2}$/.test(v) && onChange(v.padStart(5, '0'))}
        placeholder="HH:MM"
        style={{ width: 100 }}
      />
    );
  }
  return (
    <DateTimePicker
      value={date}
      mode="time"
      display="compact"
      minuteInterval={5}
      accentColor={t.accent}
      themeVariant={t.dark ? 'dark' : 'light'}
      onChange={(_e, d) => {
        if (!d) return;
        onChange(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      }}
      style={{ alignSelf: 'flex-start' }}
    />
  );
}

/** Locale-formatted clock time, e.g. "7:30 AM". */
export function formatTime(hm: string | null | undefined): string {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
