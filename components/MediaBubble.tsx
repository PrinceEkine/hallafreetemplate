import { Ionicons } from '@expo/vector-icons';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import { saveChatMediaNow } from '../lib/deviceMedia';
import {
  fetchMediaFile,
  formatBytes,
  friendlyMediaError,
  type MediaDescriptor,
} from '../lib/media';

export function MediaBubble({
  id,
  descriptor,
  mine,
}: {
  id: string;
  descriptor: MediaDescriptor;
  mine: boolean;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  async function handleSave() {
    if (!uri || saveState === 'saving') return;
    setSaveMsg(null);
    setSaveState('saving');
    const status = await saveChatMediaNow(
      uri,
      descriptor.kind,
      descriptor.name,
      descriptor.mime,
      id,
    );
    if (status === 'saved') {
      setSaveState('saved');
      setSaveMsg(
        descriptor.kind === 'file'
          ? 'Saved to your Ophixe Media folder.'
          : 'Saved to your Ophixe Media album.',
      );
    } else if (status === 'denied') {
      setSaveState('idle');
      setSaveMsg('Allow photo access in Settings to save.');
    } else if (status === 'unsupported') {
      setSaveState('idle');
      setSaveMsg('Saving is not available on this device.');
    } else {
      setSaveState('idle');
      setSaveMsg('Could not save. Try again.');
    }
  }

  async function handleShare() {
    if (!uri) return;
    setSaveMsg(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setSaveMsg('Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: descriptor.mime,
        dialogTitle: descriptor.name,
      });
    } catch {
      setSaveMsg('Could not share. Try again.');
    }
  }

  function saveLabel(): string {
    if (saveState === 'saved') return 'SAVED';
    if (saveState === 'saving') return 'SAVING…';
    return 'SAVE';
  }

  useEffect(() => {
    let alive = true;
    fetchMediaFile(descriptor, id)
      .then((local) => {
        if (alive) setUri(local);
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(friendlyMediaError(err, 'Could not open file.'));
        }
      });
    return () => {
      alive = false;
    };
  }, [descriptor, id]);

  if (error) {
    return (
      <View style={styles.fileRow}>
        <Ionicons name="alert-circle-outline" size={22} color={c.danger} />
        <Text style={[styles.fileName, mine && styles.textMine]}>{error}</Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={mine ? c.paper : c.primary} />
        <Text style={[styles.loadingText, mine && styles.textMine]}>
          {descriptor.kind === 'file' ? descriptor.name : 'Loading…'}
        </Text>
      </View>
    );
  }

  if (descriptor.kind === 'image') {
    return (
      <>
        <Pressable onPress={() => setOpen(true)}>
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        </Pressable>
        {descriptor.caption ? (
          <Text style={[styles.caption, mine && styles.textMine]}>
            {descriptor.caption}
          </Text>
        ) : null}
        <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
          <View style={styles.viewer}>
            <Pressable
              style={styles.viewerClose}
              onPress={() => setOpen(false)}
              hitSlop={12}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
            <View style={styles.viewerBar}>
              <Pressable
                style={styles.viewerSave}
                onPress={handleSave}
                hitSlop={12}
                disabled={saveState === 'saving'}
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.viewerSaveText}>{saveLabel()}</Text>
              </Pressable>
              {saveMsg ? (
                <Text style={styles.viewerMsg}>{saveMsg}</Text>
              ) : null}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  if (descriptor.kind === 'video') {
    return (
      <>
        <Pressable style={styles.videoTile} onPress={() => setOpen(true)}>
          <VideoPreview uri={uri} name={descriptor.name} />
        </Pressable>
        {descriptor.caption ? (
          <Text style={[styles.caption, mine && styles.textMine]}>
            {descriptor.caption}
          </Text>
        ) : null}
        <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
          <View style={styles.viewer}>
            <Pressable
              style={styles.viewerClose}
              onPress={() => setOpen(false)}
              hitSlop={12}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            {open && <VideoPlayerView uri={uri} />}
            <View style={styles.viewerBar}>
              <Pressable
                style={styles.viewerSave}
                onPress={handleSave}
                hitSlop={12}
                disabled={saveState === 'saving'}
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.viewerSaveText}>{saveLabel()}</Text>
              </Pressable>
              {saveMsg ? (
                <Text style={styles.viewerMsg}>{saveMsg}</Text>
              ) : null}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  function isApk(): boolean {
    return (
      Platform.OS === 'android' &&
      (descriptor.name.toLowerCase().endsWith('.apk') ||
        descriptor.mime === 'application/vnd.android.package-archive')
    );
  }

  async function installApk() {
    if (!uri) return;
    try {
      const contentUri = await getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync(
        'android.intent.action.VIEW',
        {
          data: contentUri,
          type: 'application/vnd.android.package-archive',
          flags: 1,
        },
      );
    } catch {
      setError('Could not open the installer for that file.');
    }
  }

  function openFile() {
    if (!uri) return;
    // Packages install straight from chat — behind a trust prompt,
    // since APKs can carry malware. The OS still scans on install.
    if (isApk()) {
      Alert.alert(
        'Install this app?',
        `${descriptor.name} came through chat. Only install files from people you trust.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Install', onPress: () => void installApk() },
        ],
      );
      return;
    }
    Linking.openURL(uri).catch(() => {
      setError('No app on this device can open that file.');
    });
  }

  return (
    <View>
      <View style={styles.fileRow}>
        <Pressable style={styles.fileOpen} onPress={openFile}>
          <Ionicons
            name={isApk() ? 'logo-android' : 'document-text-outline'}
            size={26}
            color={mine ? c.paper : c.primary}
          />
          <View style={styles.fileMid}>
            <Text
              style={[styles.fileName, mine && styles.textMine]}
              numberOfLines={2}
            >
              {descriptor.name}
            </Text>
            {descriptor.size > 0 && (
              <Text style={[styles.fileSize, mine && styles.textMine]}>
                {formatBytes(descriptor.size)}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={handleSave}
          disabled={saveState === 'saving'}
          accessibilityLabel="Save file to device"
        >
          <Ionicons
            name={
              saveState === 'saved' ? 'checkmark-circle' : 'download-outline'
            }
            size={20}
            color={mine ? c.paper : c.subtext}
          />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={handleShare}
          accessibilityLabel="Share file"
        >
          <Ionicons
            name="share-outline"
            size={20}
            color={mine ? c.paper : c.subtext}
          />
        </Pressable>
      </View>
      {saveMsg ? (
        <Text style={[styles.fileSaveMsg, mine && styles.textMine]}>
          {saveMsg}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Inline video preview: the first frame renders right in the chat (muted,
 * never autoplaying) under a play affordance, instead of a blank tile.
 */
function VideoPreview({ uri, name }: { uri: string; name: string }) {
  const player = useVideoPlayer(uri);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  useEffect(() => {
    player.muted = true;
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <View style={styles.previewFrame}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        // The native view swallows taps (notably on Android), so the
        // tile never opened. Preview only — touches go to the Pressable.
        pointerEvents="none"
      />
      <View style={styles.previewShade} pointerEvents="none">
        <Ionicons name="play-circle" size={48} color={c.paper} />
        <Text style={styles.videoName} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

function VideoPlayerView({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  useEffect(() => {
    player.play();
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={styles.viewerVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    minWidth: 140,
  },
  loadingText: {
    fontSize: 13,
    color: c.ink,
  },
  textMine: {
    color: c.paper,
  },
  caption: {
    fontSize: 14,
    color: c.ink,
    marginTop: 6,
    maxWidth: 220,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: radius.m,
    backgroundColor: c.border,
  },
  videoTile: {
    width: 220,
    height: 140,
    borderRadius: radius.m,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  previewFrame: {
    width: '100%',
    height: '100%',
  },
  previewShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#00000055',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  videoName: {
    fontSize: 12,
    color: c.paper,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
    maxWidth: 240,
    paddingVertical: 4,
  },
  fileOpen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileSaveMsg: {
    fontSize: 11,
    color: c.subtext,
    marginTop: 2,
  },
  fileMid: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: c.ink,
  },
  fileSize: {
    fontSize: 12,
    color: c.subtext,
    marginTop: 2,
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000000EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 1,
  },
  viewerImage: {
    width: '94%',
    height: '80%',
  },
  viewerVideo: {
    width: '94%',
    height: '70%',
  },
  viewerBar: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    gap: 6,
  },
  viewerSave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF22',
    borderWidth: 1,
    borderColor: '#FFFFFF55',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  viewerSaveText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  viewerMsg: { fontSize: 12, color: '#FFFFFFCC', textAlign: 'center' },
  });
}
