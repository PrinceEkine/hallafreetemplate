import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import {
  probeConnectivity,
  useOnline,
  usePendingCount,
} from '../lib/net';
import { useColors } from '../lib/theme';

/**
 * Thin status strip for list screens: offline notice with the outbox size,
 * or a sending indicator while queued writes flush. Renders nothing when
 * everything is online and settled.
 */
export function OfflineBanner() {
  const online = useOnline();
  const pending = usePendingCount();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <View style={styles.bar} accessibilityRole="alert">
        <Ionicons
          name="cloud-offline-outline"
          size={16}
          color={c.paper}
        />
        <Text style={styles.text} numberOfLines={2}>
          You are offline — showing saved content
          {pending > 0
            ? ` • ${pending} waiting to send`
            : ''}
        </Text>
        <Pressable
          onPress={() => probeConnectivity().catch(() => {})}
          hitSlop={8}
          accessibilityLabel="Retry connection"
        >
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.bar, styles.barSending]}>
      <ActivityIndicator size="small" color={c.paper} />
      <Text style={styles.text}>
        Back online — sending {pending}…
      </Text>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.ink,
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.m,
    },
    barSending: {
      backgroundColor: c.inkSoft,
    },
    text: { flex: 1, fontSize: 13, color: c.paper, lineHeight: 18 },
    retry: {
      fontSize: 13,
      fontWeight: '800',
      color: c.paper,
      textDecorationLine: 'underline',
    },
  });
}
