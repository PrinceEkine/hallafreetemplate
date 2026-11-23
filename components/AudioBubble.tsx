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
  fetchMediaFile,
  formatBytes,
  friendlyMediaError,
  type MediaDescriptor,
} from '../lib/media';
import {
  announceVoicePlay,
  formatVoiceDuration,
  subscribeVoicePlay,
} from '../lib/voice';

/**
 * Audio file bubble (music, recordings): decrypts on first play like voice
 * notes and shares their one-at-a-time playback, plus the file name.
 */
export function AudioBubble({
  id,
  descriptor,
  mine,
}: {
  id: string;
  descriptor: MediaDescriptor;
  mine: boolean;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
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
    setFailed(null);
    try {
      if (!loaded) {
        const uri = await fetchMediaFile(descriptor, id);
        player.replace(uri);
        setLoaded(true);
      }
      announceVoicePlay(id);
      player.play();
    } catch (err) {
      if (alive.current) setFailed(friendlyMediaError(err, 'Could not play.'));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const total = status.duration > 0 ? status.duration : 0;
  const fraction =
    total > 0 ? Math.min(1, Math.max(0, status.currentTime / total)) : 0;
  const ink = mine ? c.paper : c.text;
  const sub = mine ? '#D7D7DC' : c.subtext;
  const track = mine ? 'rgba(255,255,255,0.35)' : c.border;

  return (
    <View style={styles.col}>
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          hitSlop={8}
          style={[styles.button, mine && styles.buttonMine]}
          accessibilityLabel={status.playing ? 'Pause audio' : 'Play audio'}
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
          <Text style={[styles.name, { color: ink }]} numberOfLines={1}>
            {descriptor.name}
          </Text>
          <View style={[styles.track, { backgroundColor: track }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: ink, width: `${Math.round(fraction * 100)}%` },
              ]}
            />
          </View>
          <Text style={[styles.time, { color: sub }]}>
            {failed ??
              (total > 0
                ? `${formatVoiceDuration(status.currentTime)} • ${formatVoiceDuration(total)}`
                : formatBytes(descriptor.size) || 'Audio')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  col: { minWidth: 200, maxWidth: 240 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  name: { fontSize: 13, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  time: { fontSize: 11, fontWeight: '600' },
});
}
