import { Ionicons } from '@expo/vector-icons';
import {
  cacheDirectory,
  downloadAsync,
  getContentUriAsync,
} from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';

export type PostFile = { uri: string; name: string; size: number };

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function VideoTile({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const player = useVideoPlayer(uri);
  useEffect(() => {
    player.muted = true;
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <View style={{ width, height }}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        // The native view swallows taps: preview only, touches go up.
        pointerEvents="none"
      />
      <View style={tileStyles.shade} pointerEvents="none">
        <Ionicons name="play-circle" size={48} color="#FFFFFF" />
      </View>
    </View>
  );
}

const tileStyles = StyleSheet.create({
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#00000055',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function VideoPage({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri);
  useEffect(() => {
    if (!active) return;
    player.play();
    return () => {
      player.pause();
    };
  }, [active, player]);
  return (
    <VideoView
      player={player}
      style={viewerStyles.video}
      contentFit="contain"
      nativeControls
    />
  );
}

const viewerStyles = StyleSheet.create({
  video: { width: '100%', height: '85%' },
});

/** Inline video tiles with a fullscreen swipeable player. */
export function PostVideos({
  uris,
  height = 220,
}: {
  uris: string[];
  height?: number;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [width, setWidth] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (uris.length === 0) return null;
  const gap = 8;
  const itemWidth = Math.max(0, width - 56);
  const single = uris.length === 1;

  return (
    <View style={styles.videoWrap} onLayout={onLayout}>
      {single ? (
        <Pressable onPress={() => setViewerIndex(0)}>
          {width > 0 ? (
            <View style={styles.clip}>
              <VideoTile uri={uris[0]} width={width} height={height} />
            </View>
          ) : (
            <View style={[styles.placeholder, { height }]} />
          )}
        </Pressable>
      ) : (
        <FlatList
          data={uris}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.track}
          renderItem={({ item, index: i }) => (
            <Pressable
              onPress={() => setViewerIndex(i)}
              style={{ marginRight: gap }}
            >
              {itemWidth > 0 ? (
                <View style={styles.clip}>
                  <VideoTile uri={item} width={itemWidth} height={height} />
                </View>
              ) : (
                <View style={[styles.placeholder, { height }]} />
              )}
            </Pressable>
          )}
        />
      )}
      <Modal
        visible={viewerIndex !== null}
        transparent
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.viewer}>
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerIndex(null)}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          {viewerIndex !== null && (
            <FlatList
              data={uris}
              keyExtractor={(uri, i) => `full-${uri}-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={viewerIndex}
              getItemLayout={(_, i) => ({
                length: width || 1,
                offset: (width || 1) * i,
                index: i,
              })}
              onMomentumScrollEnd={(e) => {
                const w = width || 1;
                const next = Math.round(e.nativeEvent.contentOffset.x / w);
                setViewerIndex(Math.max(0, Math.min(uris.length - 1, next)));
              }}
              renderItem={({ item, index: i }) => (
                <View
                  style={[styles.viewerPage, width > 0 ? { width } : null]}
                >
                  <VideoPage uri={item} active={i === viewerIndex} />
                </View>
              )}
            />
          )}
          {uris.length > 1 && viewerIndex !== null && (
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1}/{uris.length}
            </Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

function fileIcon(name: string): ComponentProps<typeof Ionicons>['name'] {
  const lower = name.toLowerCase();
  if (lower.endsWith('.apk')) return 'logo-android';
  if (/\.(xls|xlsx|csv)$/.test(lower)) return 'grid-outline';
  if (/\.pdf$/.test(lower)) return 'document-outline';
  if (/\.(ppt|pptx)$/.test(lower)) return 'easel-outline';
  if (/\.(zip|rar|7z)$/.test(lower)) return 'archive-outline';
  if (/\.(mp3|wav|m4a|ogg)$/.test(lower)) return 'musical-notes-outline';
  if (/\.(doc|docx|txt|rtf)$/.test(lower)) return 'document-text-outline';
  return 'document-attach-outline';
}

/** Downloadable file rows (Word, Excel, PDF…). */
export function PostFiles({ files }: { files: PostFile[] }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [busy, setBusy] = useState<string | null>(null);

  async function openFile(file: PostFile) {
    if (busy) return;
    const apk =
      Platform.OS === 'android' && file.name.toLowerCase().endsWith('.apk');
    if (!apk) {
      Linking.openURL(file.uri).catch(() => {
        Alert.alert('Cannot open', 'No app on this device can open that file.');
      });
      return;
    }
    Alert.alert(
      'Install this app?',
      `${file.name} was posted in your community. Only install files from people you trust.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Install',
          onPress: () => void installApk(file),
        },
      ],
    );
  }

  async function installApk(file: PostFile) {
    setBusy(file.uri);
    try {
      const target = `${cacheDirectory ?? ''}post-${Date.now()}.apk`;
      const downloaded = await downloadAsync(file.uri, target);
      const contentUri = await getContentUriAsync(downloaded.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1,
      });
    } catch {
      Alert.alert('Cannot open', 'Could not open the installer for that file.');
    } finally {
      setBusy(null);
    }
  }

  if (files.length === 0) return null;
  return (
    <View style={styles.fileList}>
      {files.map((file) => (
        <Pressable
          key={file.uri}
          style={styles.fileRow}
          onPress={() => openFile(file)}
          disabled={busy !== null}
        >
          <Ionicons
            name={fileIcon(file.name)}
            size={26}
            color={c.primary}
          />
          <View style={styles.fileMid}>
            <Text style={styles.fileName} numberOfLines={2}>
              {file.name}
            </Text>
            {file.size > 0 ? (
              <Text style={styles.fileSize}>{formatBytes(file.size)}</Text>
            ) : null}
          </View>
          <Text style={styles.fileOpen}>
            {busy === file.uri ? '…' : 'OPEN'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    videoWrap: { marginTop: 10 },
    track: { paddingRight: 48 },
    clip: { borderRadius: radius.m, overflow: 'hidden', backgroundColor: '#000' },
    placeholder: {
      borderRadius: radius.m,
      backgroundColor: c.bg,
      width: '100%',
    },
    viewer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerClose: {
      position: 'absolute',
      top: 48,
      right: 20,
      zIndex: 1,
    },
    viewerPage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    viewerCounter: {
      position: 'absolute',
      bottom: 40,
      alignSelf: 'center',
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    fileList: { marginTop: 10, gap: 8 },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.m,
      padding: 12,
    },
    fileMid: { flex: 1 },
    fileName: { fontSize: 14, fontWeight: '700', color: c.text },
    fileSize: { fontSize: 12, color: c.subtext, marginTop: 2 },
    fileOpen: { fontSize: 12, fontWeight: '800', color: c.primary },
  });
}
