import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DatePicker } from '../../components/DatePicker';
import { TimePicker } from '../../components/TimePicker';
import { ScreenHeader } from '../../components/ScreenHeader';
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
import { listMyCommunities } from '../../lib/communities';
import { createEvent, isCommunityAdmin } from '../../lib/communityContent';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  removeFromBucket,
  uploadToBucket,
  type PickedAsset,
} from '../../lib/uploads';

function bannerKindOf(asset: PickedAsset): 'image' | 'video' {
  if (asset.mimeType?.startsWith('video/')) return 'video';
  if (/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(asset.name)) return 'video';
  return 'image';
}

function todayIso(): string {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export default function NewEvent() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState('10:00 AM');
  const [banner, setBanner] = useState<PickedAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const scoped = await resolveSelectedCommunityId();
      setCommunityId(scoped);
      if (scoped) {
        setAdmin(await isCommunityAdmin(scoped));
        const mine = await listMyCommunities().catch((): never[] => []);
        setCommunityName(mine.find((it) => it.id === scoped)?.name ?? '');
      }
      setReady(true);
    })();
  }, []);

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
  }

  async function handleCreate() {
    setError(null);
    if (!communityId) {
      setError('Join or create a community first, then come back.');
      return;
    }
    if (!admin) {
      setError('Only community admins can schedule events.');
      return;
    }
    setLoading(true);
    let bannerPath: string | null = null;
    const bannerKind = banner ? bannerKindOf(banner) : 'image';
    try {
      if (banner) {
        const uploaded = await uploadToBucket(
          'post-media',
          communityId,
          banner,
          bannerKind === 'video' ? MAX_MEDIA_BYTES : MAX_IMAGE_BYTES,
        );
        bannerPath = uploaded.path;
      }
      const id = await createEvent({
        communityId,
        title,
        date,
        time,
        bannerPath,
        bannerKind,
      });
      router.replace({ pathname: '/event/[id]', params: { id } });
    } catch (err) {
      if (bannerPath && communityId) {
        await removeFromBucket('post-media', bannerPath).catch(() => {});
      }
      setError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW EVENT" />
      <Screen>
        <Heading>Schedule an event</Heading>
        {!ready ? (
          <Subtext>Loading your community…</Subtext>
        ) : !communityId ? (
          <Subtext>
            Join or create a community first, then come back to schedule.
          </Subtext>
        ) : !admin ? (
          <Subtext>
            Only community admins can schedule events. Ask a community admin
            to schedule this for you.
          </Subtext>
        ) : (
          <>
            {communityName ? (
              <Subtext>Hosting in {communityName}</Subtext>
            ) : null}
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
              title="Create event"
              loading={loading}
              onPress={handleCreate}
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
  remove: { fontSize: 12, fontWeight: '800', color: c.danger },
});
}
