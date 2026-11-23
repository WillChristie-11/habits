import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { RunningBar } from '../../components/RunningBar';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useStore } from '../../store';
import { DEFAULT_MINUTES } from '../../lib/timers';
import { useTimerStart } from '../../components/useTimerStart';

export default function TabsLayout() {
  const t = useTheme();
  const { settings } = useStore();
  const startTimer = useTimerStart();
  // Holding the Timers tab icon starts the last-used timer again at its last length.
  const restartLast = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const last = settings.lastTimer ?? { kind: 'focus' as const, minutes: DEFAULT_MINUTES.focus };
    startTimer(last.kind, last.minutes);
  };
  return (
    <Tabs
      // The running Focus / Meditate bar sits just above the tab bar on every tab.
      tabBar={(props) => (
        <>
          <RunningBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <SymbolView name="checkmark.circle" tintColor={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <SymbolView name="calendar" tintColor={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="timers"
        options={{
          title: 'Timers',
          tabBarIcon: ({ color, size }) => <SymbolView name="timer" tintColor={color} size={size} />,
          tabBarAccessibilityLabel: 'Timers: Focus and Meditate. Hold to start the last timer again.',
        }}
        listeners={{ tabLongPress: restartLast }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, size }) => <SymbolView name="book" tintColor={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
