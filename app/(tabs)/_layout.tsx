import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import {
  getTabBadgeCounts,
  markTabSeen,
  type BadgeTab,
  type TabBadgeCounts,
} from '../../lib/tabBadges';
import { useColors } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  color,
  size,
}: {
  name: IconName;
  color: unknown;
  size: number;
}) {
  return (
    <Ionicons
      name={name}
      color={typeof color === 'string' ? color : undefined}
      size={size}
    />
  );
}

function badgeLabel(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : String(count);
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [badges, setBadges] = useState<TabBadgeCounts>({
    chat: 0,
    teams: 0,
    feed: 0,
    update: 0,
    events: 0,
  });

  const refreshBadges = useCallback(() => {
    getTabBadgeCounts().then(setBadges).catch(() => {});
  }, []);

  useEffect(() => {
    refreshBadges();
    const timer = setInterval(refreshBadges, 30000);
    return () => clearInterval(timer);
  }, [refreshBadges]);

  // Tapping an icon marks its tab read: the number clears at once while
  // the other tabs recount underneath.
  async function handleTabPress(tab: BadgeTab) {
    setBadges((prev) => ({ ...prev, [tab]: 0 }));
    await markTabSeen(tab).catch(() => {});
    refreshBadges();
  }

  return (
    <Tabs
      screenOptions={{
        header: ({ options }) => <AppHeader title={options.title ?? ''} />,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.subtext,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.border,
          height: 78,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarButton: (props: any) => (
          <Pressable
            {...props}
            onPress={(e: any) => {
              Haptics.selectionAsync();
              props.onPress?.(e);
            }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="update"
        options={{
          title: 'ANNOUNCEMENT',
          tabBarLabel: 'Update',
          tabBarBadge: badgeLabel(badges.update),
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="megaphone" color={color} size={size} />
          ),
        }}
        listeners={{ tabPress: () => void handleTabPress('update') }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'CHAT',
          tabBarLabel: 'Chat',
          tabBarBadge: badgeLabel(badges.chat),
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="chatbubble-ellipses" color={color} size={size} />
          ),
        }}
        listeners={{ tabPress: () => void handleTabPress('chat') }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'HOME',
          tabBarLabel: 'Home',
          tabBarBadge: badgeLabel(badges.feed),
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="home" color={color} size={size} />
          ),
        }}
        listeners={{ tabPress: () => void handleTabPress('feed') }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'TEAMS',
          tabBarLabel: 'Teams',
          tabBarBadge: badgeLabel(badges.teams),
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="people" color={color} size={size} />
          ),
        }}
        listeners={{ tabPress: () => void handleTabPress('teams') }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'EVENT',
          tabBarLabel: 'Event',
          tabBarBadge: badgeLabel(badges.events),
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="calendar" color={color} size={size} />
          ),
        }}
        listeners={{ tabPress: () => void handleTabPress('events') }}
      />
    </Tabs>
  );
}
