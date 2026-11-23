import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DatePicker } from '../../components/DatePicker';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TimePicker } from '../../components/TimePicker';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  getEvent,
  isCommunityAdmin,
  updateEvent,
} from '../../lib/communityContent';
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  publicUrl,
  removeFromBucket,
  uploadToBucket,
  type PickedAsset,
} from '../../lib/uploads';

function bannerKindOf(asset: PickedAsset): 'image' | 'video' {
  if (asset.mimeType?.startsWith('video/')) return 'video';
  if (/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(asset.name)) return 'video';
  return 'image';
}

function validTime(value: string): boolean {
  return /^\s*\d{1,2}:\d{2}\s*(AM|PM)\s*$/i.test(value);
}

export default function EditEvent() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00 AM');
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [storedKind, setStoredKind] = useState<'image' | 'video'>('image');
  const [banner, setBanner] = useState<PickedAsset | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing event.');
      setReady(true);
      return;
    }
    const found = await getEvent(id);
    if (!found) {
      setError('Event not found.');
      setReady(true);
      return;
    }
    setTitle(found.title);
    setDate(String(found.event_date).slice(0, 10));
    setTime(validTime(found.event_time) ? found.event_time.trim() : '10:00 AM');
    setBannerPath(found.banner_url);
    setStoredKind(found.banner_kind);
    setCommunityId(found.community_id);
    if (found.community_id) {
      setAdmin(await isCommunityAdmin(found.community_id));
    }
    setReady(true);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAttach() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'video/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const video = (asset.mimeType ?? '').startsWith('video/');
    setBanner({
      uri: asset.uri,
      name: asset.name ?? (video ? 'banner.mp4' : 'banner.jpg'),
      mimeType: asset.mimeType ?? undefined,
      size: asset.size ?? undefined,
    });
    setBannerRemoved(false);
  }

  async function handleSave() {
    setError(null);
    if (!id || !communityId) {
      setError('This event is missing its community.');
      return;
    }
    if (!admin) {
      setError('Only community admins can edit events.');
      return;
    }
    setLoading(true);
    let uploadedPath: string | null = null;
    const bannerKind = banner ? bannerKindOf(banner) : storedKind;
    try {
      let nextBanner: string | null | undefined;
      if (banner) {
        const uploaded = await uploadToBucket(
          'post-media',
          communityId,
          banner,
          bannerKind === 'video' ? MAX_MEDIA_BYTES : MAX_IMAGE_BYTES,
        );
        uploadedPath = uploaded.path;
        nextBanner = uploaded.path;
      } else if (bannerRemoved) {
        nextBanner = null;
      }
      await updateEvent(id, {
        title,
        date,
        time,
        bannerPath: nextBanner,
        bannerKind,
      });
      if (bannerPath && (banner || bannerRemoved)) {
        await removeFromBucket('post-media', bannerPath).catch(() => {});
      }
      router.replace({ pathname: '/event/[id]', params: { id } });
    } catch (err) {
      if (uploadedPath) {
        await removeFromBucket('post-media', uploadedPath).catch(() => {});
      }
      setError(err instanceof Error ? err.message : 'Could not save event.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="EDIT EVENT" />
      <Screen>
        <Heading>Edit event</Heading>
        {!ready ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.ink} />
        ) : !admin ? (
          <Subtext>
            {error ?? 'Only community admins can edit events.'}
          </Subtext>
        ) : (
          <>
            <Field
              label="TITLE (OPTIONAL)"
              placeholder="Annual staff conference — skip it when the banner says it"
              value={title}
              onChangeText={setTitle}
            />
            <Text style={styles.label}>DATE</Text>
            <DatePicker value={date} onChange={setDate} />
            <Text style={styles.label}>TIME</Text>
            <TimePicker value={time} onChange={setTime} />
            <Text style={styles.label}>BANNER (OPTIONAL)</Text>
            {banner ? (
              <View style={styles.previewWrap}>
                <BannerPreview asset={banner} />
                <Pressable onPress={() => setBanner(null)} hitSlop={8}>
                  <Text style={styles.remove}>REMOVE</Text>
                </Pressable>
              </View>
            ) : bannerPath && !bannerRemoved ? (
              <View style={styles.previewWrap}>
                {storedKind === 'video' ? (
                  <VideoPreviewTile
                    uri={publicUrl('post-media', bannerPath)}
                  />
                ) : (
                  <Image
                    source={{ uri: publicUrl('post-media', bannerPath) }}
                    style={styles.preview}
                  />
                )}
                <View style={styles.previewRow}>
                  <Pressable onPress={handleAttach} hitSlop={8}>
                    <Text style={styles.swap}>REPLACE</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setBannerRemoved(true)}
                    hitSlop={8}
                  >
                    <Text style={styles.remove}>REMOVE</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Button
                  title="Attach a photo or video"
                  variant="outline"
                  onPress={handleAttach}
                />
                <Subtext>
                  Photos up to 8MB, videos up to 25MB. Without a banner,
                  the event shows the default Ophixe banner.
                </Subtext>
              </>
            )}
            <ErrorText message={error} />
            <Button
              title="Save changes"
              loading={loading}
              onPress={handleSave}
            />
          </>
        )}
      </Screen>
    </>
  );
}

function BannerPreview({ asset }: { asset: PickedAsset }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  if (bannerKindOf(asset) !== 'video') {
    return <Image source={{ uri: asset.uri }} style={styles.preview} />;
  }
  return <VideoPreviewTile uri={asset.uri} />;
}

function VideoPreviewTile({ uri }: { uri: string }) {
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
    <View style={styles.previewVideo}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  previewWrap: { gap: 8 },
  preview: { width: '100%', height: 200, borderRadius: radius.m },
  previewVideo: {
    width: '100%',
    height: 200,
    borderRadius: radius.m,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  previewRow: { flexDirection: 'row', gap: 16 },
  swap: { fontSize: 12, fontWeight: '800', color: c.primary },
  remove: { fontSize: 12, fontWeight: '800', color: c.danger },
});
}
