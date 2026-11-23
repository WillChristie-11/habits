import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { RunningBar } from '../../components/RunningBar';
import { SymbolView } from 'expo-symbols';
import { useTheme } from '../../theme';

export default function TabsLayout() {
  const t = useTheme();
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
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, size }) => <SymbolView name="book" tintColor={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
