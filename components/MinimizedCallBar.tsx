import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import { deleteMyPresence, getRoomCall } from '../lib/calls';
import { stopCallKeepalive } from '../lib/callKeepalive';
import { getMeeting } from '../lib/communityContent';
import {
  clearMinimizedRoom,
  getMinimizedRoom,
  subscribeMinimizedRoom,
  teardownLiveEngine,
} from '../lib/minimizedCall';

/**
 * Floating bar for a minimized meeting-room call. Mounted once in the
 * root layout; hidden on the call screen itself.
 */
export function MinimizedCallBar() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const minimized = useSyncExternalStore(
    subscribeMinimizedRoom,
    getMinimizedRoom,
  );
  const pathname = usePathname();
  const [name, setName] = useState('Meeting room');

  useEffect(() => {
    if (!minimized) return;
    getMeeting(minimized.roomId)
      .then((meeting) => {
        if (meeting) setName(meeting.name);
      })
      .catch(() => {});
  }, [minimized]);

  // The meeting ended while minimized: tear down instead of idling.
  useEffect(() => {
    if (!minimized) return;
    const roomId = minimized.roomId;
    const timer = setInterval(async () => {
      const row = await getRoomCall(roomId).catch(() => 'unknown');
      if (row === 'unknown' || row) return;
      teardownLiveEngine();
      stopCallKeepalive();
      await deleteMyPresence('room', roomId).catch(() => {});
      clearMinimizedRoom(roomId);
    }, 5000);
    return () => clearInterval(timer);
  }, [minimized]);

  const room = minimized;
  if (!room || pathname.startsWith('/call')) return null;
  const roomId = room.roomId;
  const roomMedia = room.media;

  function handleReturn() {
    router.push({
      pathname: '/call/[id]',
      params: { id: roomId, scope: 'room', media: roomMedia },
    } as never);
  }

  function handleLeave() {
    teardownLiveEngine();
    stopCallKeepalive();
    void deleteMyPresence('room', roomId).catch(() => {});
    clearMinimizedRoom(roomId);
  }

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.pulse}>
          <Ionicons name="call" size={16} color="#FFFFFF" />
        </View>
        <View style={styles.mid}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.live}>LIVE • TAP TO RETURN</Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={handleReturn}
          accessibilityLabel="Return to meeting"
        >
          <Text style={styles.action}>OPEN</Text>
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={handleLeave}
          accessibilityLabel="Leave meeting"
        >
          <Text style={styles.leave}>LEAVE</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 96,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#000000',
      borderRadius: radius.l,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    pulse: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.success ?? '#16A34A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mid: { flex: 1 },
    name: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
    live: {
      fontSize: 10,
      fontWeight: '800',
      color: '#4ADE80',
      letterSpacing: 1,
      marginTop: 2,
    },
    action: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    leave: { fontSize: 13, fontWeight: '800', color: '#F87171' },
  });
}
