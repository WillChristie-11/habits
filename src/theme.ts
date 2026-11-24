// The only place colours are defined. Components get them through useTheme()/useThemedStyles().
import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export interface Theme {
  id: ThemeId;
  name: string;
  dark: boolean;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  /** done dots, check circle, progress ring */
  accent: string;
  /** missed / not-yet-done dots, empty ring track */
  dotEmpty: string;
  border: string;
  /** text/icons drawn on top of `accent` */
  onAccent: string;
  /** subtle tint (translucent) for highlights drawn over a surface */
  accentSoft: string;
  /** opaque highlighted row fill (rows must be opaque so swipe actions never show through) */
  rowHighlight: string;
  /** Journal page text: softer than `text` */
  journalText: string;
  /** pressed / secondary control fill */
  muted: string;
  shadow: string;
  /** dimmed backdrop behind dialogs */
  scrim: string;
  /** Timers tab: flat colour fields for the Focus and Meditate cards (white text on them) */
  timerFocus: string;
  timerMeditate: string;
}

/** Status colours: identical in every theme, and never reused for anything else. */
export const status = {
  flag: '#D99A1E', // amber – never-miss-twice, behind pace
  deadline: '#D9534F', // red – past the evening deadline, destructive
  paused: '#9EA3A8', // grey – paused days
  skipped: '#8E96A3', // outline only, no fill – rest days
  flagSoft: 'rgba(217,154,30,0.14)',
  deadlineSoft: 'rgba(217,83,79,0.14)',
  /** text on a solid status colour */
  onStatus: '#FFFFFF',
} as const;

/** Activity tile colours (chosen per activity). Shared by both themes; white icons sit on them. */
export const tileColors = [
  '#2F6B4F', // green
  '#3E7CB1', // blue
  '#7A5FB0', // purple
  '#C0576B', // rose
  '#D9822B', // orange
  '#B8952A', // ochre
  '#3A9C9B', // teal
  '#6B7280', // slate
] as const;
export const onTile = '#FFFFFF';

/**
 * Focus / Meditate: text and gradients drawn over the videos. Shared by both themes (the running
 * Focus screen always uses the Midnight colours; see `themes.midnight`).
 */
export const timerColors = {
  onVideo: '#FFFFFF',
  onVideoMuted: 'rgba(255,255,255,0.72)',
  focusShade: '#0B0E13',
  meditateShade: '#0E2A1A',
  tint: '#000000',
  chip: 'rgba(255,255,255,0.18)',
} as const;

export const themes = {
  forest: {
    id: 'forest',
    name: 'Forest',
    dark: false,
    background: '#F6F5F1',
    surface: '#FFFFFF',
    text: '#1F2A24',
    textMuted: '#5C6B62',
    accent: '#2F6B4F',
    dotEmpty: '#B9C4BC',
    border: '#E3E1D9',
    onAccent: '#FFFFFF',
    accentSoft: 'rgba(47,107,79,0.10)',
    rowHighlight: '#EAF0ED',
    journalText: '#3A443E',
    muted: '#ECEBE5',
    shadow: '#000000',
    scrim: 'rgba(0,0,0,0.30)',
    timerFocus: '#2F6B4F',
    timerMeditate: '#4F7D8C',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    background: '#12151B',
    surface: '#1C2029',
    text: '#E8EAED',
    textMuted: '#9AA3B2',
    accent: '#7AA2F7',
    dotEmpty: '#3A4250',
    border: '#2A303B',
    onAccent: '#12151B',
    accentSoft: 'rgba(122,162,247,0.14)',
    rowHighlight: '#293246',
    journalText: '#D3D7DE',
    muted: '#262B36',
    shadow: '#000000',
    scrim: 'rgba(0,0,0,0.55)',
    timerFocus: '#2B3A5C',
    timerMeditate: '#2E4A44',
  },
} satisfies Record<string, Omit<Theme, 'id'> & { id: string }>;

export type ThemeId = keyof typeof themes;

export type AppearanceMode = 'system' | 'light' | 'dark';

/** Forest is the light theme, Midnight the dark one; the only choice is which applies. */
export interface Appearance {
  mode: AppearanceMode;
}

export const DEFAULT_APPEARANCE: Appearance = { mode: 'system' };

export function resolveTheme(a: Appearance, systemScheme: 'light' | 'dark' | null | undefined): Theme {
  const wantDark = a.mode === 'dark' || (a.mode === 'system' && systemScheme === 'dark');
  return (wantDark ? themes.midnight : themes.forest) as Theme;
}

/** Provided by the store, which owns the saved appearance setting. */
export const AppearanceContext = createContext<Appearance>(DEFAULT_APPEARANCE);

export function useTheme(): Theme {
  const appearance = useContext(AppearanceContext);
  const scheme = useColorScheme();
  return resolveTheme(appearance, scheme === 'dark' ? 'dark' : scheme === 'light' ? 'light' : null);
}

/** `const s = useThemedStyles(makeStyles)` where makeStyles = (t: Theme) => StyleSheet.create({...}); memoised per theme. */
export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const t = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(t), [t.id]);
}

export const radius = 12;

/**
 * The Now page's time-of-day palettes (dark whatever the app theme): amber in the morning, blue
 * through the day, violet in the evening. `rings` are the three circles of the "sun", outer first.
 */
export const nowPalettes = {
  morning: {
    background: '#1C1712',
    rings: ['#3A2C1D', '#5C4628', '#B08548'],
    accent: '#F0B25C',
    onAccent: '#2A1C08',
    text: '#FFFFFF',
    muted: '#CBBBA4',
    card: '#2A231B',
    outline: 'rgba(240,178,92,0.45)',
  },
  day: {
    background: '#111821',
    rings: ['#1D2B3B', '#2B4560', '#5B87B5'],
    accent: '#7EB6F0',
    onAccent: '#0C1A2A',
    text: '#FFFFFF',
    muted: '#AFC0D3',
    card: '#1B2431',
    outline: 'rgba(126,182,240,0.45)',
  },
  evening: {
    background: '#16121F',
    rings: ['#2A2140', '#423366', '#7E62B8'],
    accent: '#B79CF2',
    onAccent: '#1C1230',
    text: '#FFFFFF',
    muted: '#C2B6DA',
    card: '#221B30',
    outline: 'rgba(183,156,242,0.45)',
  },
} as const;

export type NowPalette = (typeof nowPalettes)[keyof typeof nowPalettes];
