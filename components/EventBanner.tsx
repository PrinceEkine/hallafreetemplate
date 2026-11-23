import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

/**
 * Event banner with a branded default when the event has no picture.
 * The photo carries no overlay: when a kicker/subtitle is given, the
 * words render below the image instead of on top of it.
 */
export function EventBanner({
  uri,
  title,
  height = 120,
  kicker = null,
  subtitle = null,
  onPress = null,
  kind = 'image',
}: {
  uri: string | null;
  title: string;
  height?: number;
  kicker?: string | null;
  subtitle?: string | null;
  onPress?: (() => void) | null;
  kind?: 'image' | 'video';
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const labeled = kicker || subtitle;
  const body = uri ? (
    <View>
      <View style={[styles.imageWrap, { height }]}>
        {kind === 'video' ? (
          <BannerVideoTile uri={uri} />
        ) : (
          <Image source={{ uri }} style={styles.imageFill} resizeMode="cover" />
        )}
      </View>
      {labeled ? (
        <View style={styles.caption}>
          {title ? (
            <Text style={styles.captionTitle} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {kicker ? <Text style={styles.captionKicker}>{kicker}</Text> : null}
          {subtitle ? (
            <Text style={styles.captionSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : (
    <View style={[styles.fallback, { height }]}>
      <View style={styles.orb} />
      <View style={styles.orbSmall} />
      {title ? (
        <Text style={styles.fallbackTitle} numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      <Text style={styles.fallbackKicker}>OPHIXE EVENT</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title || 'Event banner'}
    >
      {body}
    </Pressable>
  );
}

/**
 * Muted first frame with a play badge. Preview only: the native view
 * swallows taps (notably on Android), so touches pass through to the
 * wrapping Pressable, same as the chat video tiles.
 */
function BannerVideoTile({ uri }: { uri: string }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const player = useVideoPlayer(uri);
  useEffect(() => {
    player.muted = true;
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <View style={styles.videoFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View style={styles.playBadge} pointerEvents="none">
        <Ionicons name="play-circle" size={44} color="#FFFFFF" />
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  imageWrap: {
    width: '100%',
    borderRadius: radius.m,
    backgroundColor: c.card,
    overflow: 'hidden',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  videoFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  playBadge: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  captionTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 20,
    color: c.text,
  },
  captionKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: c.ink,
    letterSpacing: 2,
    marginTop: 4,
  },
  captionSub: {
    fontSize: 13,
    color: c.subtext,
    marginTop: 2,
  },
  // Brand fallback art stays fixed dark in both themes.
  fallback: {
    width: '100%',
    borderRadius: radius.m,
    backgroundColor: '#000000',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  orb: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#000000',
    opacity: 0.55,
  },
  orbSmall: {
    position: 'absolute',
    top: 24,
    right: 96,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3EE6C4',
  },
  fallbackKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3EE6C4',
    letterSpacing: 2,
    marginTop: 4,
  },
  fallbackTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 20,
    color: '#FFFFFF',
  },
});
}
