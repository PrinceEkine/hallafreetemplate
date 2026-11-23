import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import {
  announceVoicePlay,
  fetchVoiceFile,
  formatVoiceDuration,
  subscribeVoicePlay,
  type VoiceDescriptor,
} from '../lib/voice';

export function VoiceBubble({
  id,
  descriptor,
  mine,
}: {
  id: string;
  descriptor: VoiceDescriptor;
  mine: boolean;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const off = subscribeVoicePlay((now) => {
      if (now !== id && player.playing) player.pause();
    });
    return () => {
      alive.current = false;
      off();
    };
  }, [id, player]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      announceVoicePlay(null);
    }
  }, [status.didJustFinish, player]);

  async function toggle() {
    if (busy) return;
    if (status.playing) {
      player.pause();
      announceVoicePlay(null);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      if (!loaded) {
        const uri = await fetchVoiceFile(descriptor, id);
        player.replace(uri);
        setLoaded(true);
      }
      announceVoicePlay(id);
      player.play();
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const total = status.duration > 0 ? status.duration : descriptor.seconds;
  const fraction =
    total > 0 ? Math.min(1, Math.max(0, status.currentTime / total)) : 0;
  const ink = mine ? c.paper : c.text;
  const sub = mine ? '#D7D7DC' : c.subtext;
  const track = mine ? 'rgba(255,255,255,0.35)' : c.border;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={[styles.button, mine && styles.buttonMine]}
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
      >
        {busy ? (
          <ActivityIndicator size="small" color={ink} />
        ) : (
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={18}
            color={mine ? c.ink : c.paper}
          />
        )}
      </Pressable>
      <View style={styles.mid}>
        <View style={[styles.track, { backgroundColor: track }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: ink, width: `${Math.round(fraction * 100)}%` },
            ]}
          />
        </View>
        <Text style={[styles.time, { color: sub }]}>
          {failed
            ? 'Could not play this note.'
            : formatVoiceDuration(status.currentTime)}
          {' • '}
          {formatVoiceDuration(total)}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180 },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMine: { backgroundColor: c.paper },
  mid: { flex: 1, gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  time: { fontSize: 11, fontWeight: '600' },
});
}
