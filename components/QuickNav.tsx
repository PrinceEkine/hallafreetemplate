import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, usePathname, useSegments } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

const INACTIVE = '#9CA3AF';

/**
 * Labeled bottom jump bar for inner screens (Tasks, forms…), where the tab
 * bar is not visible. Big icon + text buttons, one tap to the five main
 * sections — no menus to discover. Hidden inside chat flows (threads, new
 * chat, wallpaper), where the header back button returns to the Chat tab;
 * where it would double up (tabs); where it would interrupt (calls,
 * sign-in, welcome); or where it would bypass setup (phone).
 */
const ITEMS = [
  { label: 'Update', icon: 'megaphone', path: '/update' },
  { label: 'Chat', icon: 'chatbubble-ellipses', path: '/chat' },
  { label: 'Home', icon: 'home', path: '/feed' },
  { label: 'Teams', icon: 'people', path: '/teams' },
  { label: 'Events', icon: 'calendar', path: '/events' },
] as const;

const HIDDEN_FIRST = new Set(['(tabs)', '(auth)', 'call', 'chat']);

export function QuickNav() {
  const segments = useSegments();
  const pathname = usePathname();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const first = segments[0] ?? '';
  if (HIDDEN_FIRST.has(first)) return null;
  if (pathname === '/') return null;
  if (pathname === '/profile/phone') return null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View style={styles.bar} accessibilityLabel="Quick navigation">
        {ITEMS.map((item) => {
          const active =
            pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <Pressable
              key={item.path}
              style={styles.item}
              onPress={() => {
                Haptics.selectionAsync();
                if (!active) router.replace(item.path);
              }}
              accessibilityLabel={item.label}
              accessibilityRole="button"
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={active ? c.ink : INACTIVE}
              />
              <Text
                style={[
                  styles.label,
                  { color: active ? c.ink : INACTIVE },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { backgroundColor: c.paper },
    bar: {
      flexDirection: 'row',
      backgroundColor: c.paper,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 8,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      gap: 2,
    },
    label: { fontSize: 11, fontWeight: '600' },
  });
}
