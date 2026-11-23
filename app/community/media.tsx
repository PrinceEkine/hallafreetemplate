import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EmptyState, SearchField } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText, Field } from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import {
  deleteMediaItem,
  isCommunityAdmin,
  listCommunityGallery,
  uploadMedia,
  type GalleryItem,
} from '../../lib/communityContent';
import { ensureMediaLibrary } from '../../lib/permissions';
import { useColors } from '../../lib/theme';
import {
  removeFromBucket,
  saveRemoteToGallery,
  signedUrl,
} from '../../lib/uploads';

const COLS = 3;
const GAP = 8;
const CELL =
  (Dimensions.get('window').width - 32 - GAP * (COLS - 1)) / COLS;

type Filter = 'all' | 'image' | 'video';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'image', label: 'PHOTOS' },
  { id: 'video', label: 'VIDEOS' },
];

function VideoPlayerView({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  useEffect(() => {
    player.play();
    return () => {
      player.pause();
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={galleryVideoStyle}
      contentFit="contain"
      nativeControls
    />
  );
}

const galleryVideoStyle = { width: '100%', height: 340 } as const;

export default function Media() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
    kind: 'image' | 'video';
  } | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      // Gallery metadata is cached for offline browsing; signed image
      // URLs always mint live (cached ones expire server-side).
      const bundle = (
        await resolveWithCache(
          `media:${id}`,
          () =>
            Promise.all([
              listCommunityGallery(id),
              isCommunityAdmin(id),
            ]),
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open this gallery once online to save it.');
        return;
      }
      const [page, adminFlag] = bundle;
      setItems(page.items);
      setUnsupported(page.unsupported);
      setAdmin(adminFlag);
      const entries = await Promise.all(
        page.items
          .filter((m) => m.kind === 'image')
          .map(async (m) => {
            try {
              const url = await signedUrl(m.bucket, m.path);
              return [m.id, url] as const;
            } catch {
              return null;
            }
          }),
      );
      const next: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setUrls(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDownload(item: GalleryItem) {
    setError(null);
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to save files.');
      return;
    }
    setBusy(true);
    try {
      const url = urls[item.id] ?? (await signedUrl(item.bucket, item.path));
      const name = item.path.split('/').pop() || 'media';
      await saveRemoteToGallery(url, name);
      Alert.alert('Saved', 'The file is now in your gallery.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(item: GalleryItem) {
    if (item.kind === 'image') {
      setSelected(item);
      return;
    }
    // Videos play inside the app: external browsers often refuse the
    // signed URL, which is why taps seemed to do nothing.
    setError(null);
    setSelected(item);
    setVideoUrl(null);
    try {
      const url = await signedUrl(item.bucket, item.path);
      setVideoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open video.');
      setSelected(null);
    }
  }

  function closeViewer() {
    setSelected(null);
    setVideoUrl(null);
  }

  async function handlePickUpload() {
    if (!id) return;
    setError(null);
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to upload media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      name: asset.fileName ?? 'media',
      mimeType: asset.mimeType ?? undefined,
      size: asset.fileSize ?? undefined,
      kind: asset.type === 'video' ? 'video' : 'image',
    });
    setCaption('');
  }

  async function handleUpload() {
    if (!id || !picked) return;
    setError(null);
    setUploading(true);
    try {
      await uploadMedia(
        id,
        [
          {
            uri: picked.uri,
            name: picked.name,
            mimeType: picked.mimeType,
            size: picked.size,
          },
        ],
        caption,
      );
      setPicked(null);
      setCaption('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload.');
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(item: GalleryItem) {
    if (!item.mediaId) return;
    Alert.alert('Delete this?', item.caption || 'Remove it from the gallery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMediaItem(item.mediaId as string);
            await removeFromBucket(item.bucket, item.path).catch(() => {});
            closeViewer();
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete.');
          }
        },
      },
    ]);
  }

  const canDelete = (item: GalleryItem) =>
    item.mediaId !== null && (item.mine || admin);

  const viewingVideo = selected?.kind === 'video';

  const needle = query.trim().toLowerCase();
  const gridItems = (items ?? []).filter(
    (m) =>
      (filter === 'all' || m.kind === filter) &&
      (!needle ||
        m.caption.toLowerCase().includes(needle) ||
        (m.path.split('/').pop() ?? '').toLowerCase().includes(needle) ||
        m.authorName.toLowerCase().includes(needle)),
  );

  return (
    <>
      <ScreenHeader title="MEDIA" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.chip, filter === f.id && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, filter === f.id && styles.chipTextActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ErrorText message={error} />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search media"
          />
        </View>
        {admin && !unsupported ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Button
              title="Upload photo or video"
              variant="outline"
              onPress={handlePickUpload}
            />
          </View>
        ) : null}
        {items === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : unsupported ? (
          <EmptyState
            icon="images"
            title="Media is not set up yet"
            body="Ask your admin to apply the latest database update, then pull to refresh."
          />
        ) : (
          <FlatList
            data={gridItems}
            keyExtractor={(item) => item.id}
            numColumns={COLS}
            contentContainerStyle={styles.list}
            columnWrapperStyle={styles.columns}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="images"
                title="No media yet"
                body="Photos and videos shared in posts will appear here automatically."
              />
            }
            renderItem={({ item }) => {
              const url = urls[item.id];
              return (
                <Pressable
                  style={styles.cell}
                  onPress={() => handleOpen(item)}
                >
                  {item.kind === 'video' ? (
                    <View style={[styles.thumb, styles.videoThumb]}>
                      <Ionicons
                        name="play-circle"
                        size={32}
                        color={c.paper}
                      />
                      <Text style={styles.videoText}>VIDEO</Text>
                    </View>
                  ) : url ? (
                    <Image source={{ uri: url }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbLoading]}>
                      <ActivityIndicator color={c.subtext} />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>
      <Modal visible={selected !== null} transparent onRequestClose={closeViewer}>
        <View style={styles.viewer}>
          <Pressable style={styles.viewerBackdrop} onPress={closeViewer} />
          {selected && (
            <View style={styles.viewerCard}>
              {viewingVideo ? (
                videoUrl ? (
                  <VideoPlayerView uri={videoUrl} />
                ) : (
                  <ActivityIndicator color={c.paper} />
                )
              ) : urls[selected.id] ? (
                <Image
                  source={{ uri: urls[selected.id] }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                />
              ) : (
                <ActivityIndicator color={c.paper} />
              )}
              <Text style={styles.viewerCaption}>
                {viewingVideo
                  ? selected.caption || 'Shared video'
                  : selected.caption || 'Shared photo'}
              </Text>
              <Text style={styles.viewerMeta}>
                {selected.authorName}
                {selected.postId ? ' • FROM A POST' : ''}
              </Text>
              <View style={styles.viewerBtns}>
                <Pressable
                  style={styles.viewerBtn}
                  onPress={() => handleDownload(selected)}
                  disabled={busy || (viewingVideo && !videoUrl)}
                >
                  <Text style={styles.viewerBtnText}>
                    {busy ? 'SAVING…' : 'DOWNLOAD'}
                  </Text>
                </Pressable>
                {selected.postId ? (
                  <Pressable
                    style={styles.viewerBtn}
                    onPress={() => {
                      const postId = selected.postId as string;
                      closeViewer();
                      router.push({
                        pathname: '/post/[id]',
                        params: { id: postId },
                      });
                    }}
                  >
                    <Text style={styles.viewerBtnText}>VIEW POST</Text>
                  </Pressable>
                ) : null}
                {canDelete(selected) && (
                  <Pressable
                    style={styles.viewerBtn}
                    onPress={() => confirmDelete(selected)}
                  >
                    <Text style={styles.viewerDelete}>DELETE</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.viewerBtn}
                  onPress={closeViewer}
                >
                  <Text style={styles.viewerBtnText}>CLOSE</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
      <Modal
        visible={picked !== null}
        transparent
        onRequestClose={() => setPicked(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setPicked(null)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {picked?.kind === 'video' ? 'NEW VIDEO' : 'NEW PHOTO'}
            </Text>
            {picked?.kind === 'image' ? (
              <Image source={{ uri: picked.uri }} style={styles.sheetImage} />
            ) : (
              <View style={[styles.sheetImage, styles.sheetVideo]}>
                <Ionicons name="play-circle" size={40} color={c.paper} />
                <Text style={styles.sheetName} numberOfLines={1}>
                  {picked?.name ?? 'video'}
                </Text>
              </View>
            )}
            <Field
              label="DESCRIPTION (OPTIONAL)"
              placeholder="What is this about?"
              multiline
              numberOfLines={3}
              value={caption}
              onChangeText={setCaption}
            />
            <ErrorText message={error} />
            <View style={styles.sheetActions}>
              <Pressable hitSlop={8} onPress={() => setPicked(null)}>
                <Text style={styles.sheetCancel}>CANCEL</Text>
              </Pressable>
              <Button
                title="Upload"
                loading={uploading}
                onPress={handleUpload}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: c.paper },
    loader: { marginTop: 40 },
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    sheetBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheet: {
      width: '100%',
      backgroundColor: c.paper,
      borderRadius: 16,
      padding: 20,
      gap: 4,
    },
    sheetTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: c.text,
      letterSpacing: 1,
    },
    sheetImage: { width: '100%', height: 180, borderRadius: radius.m },
    sheetVideo: {
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 16,
    },
    sheetName: { fontSize: 13, color: c.paper },
    sheetActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    sheetCancel: { fontSize: 13, fontWeight: '800', color: c.subtext },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      gap: 10,
    },
    chip: {
      borderWidth: 1,
      borderColor: c.ink,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    chipActive: { backgroundColor: c.ink },
    chipText: { fontSize: 12, fontWeight: '700', color: c.ink },
    chipTextActive: { color: c.paper },
    list: { padding: 16, gap: GAP },
    columns: { gap: GAP },
    cell: { width: CELL },
    thumb: { width: CELL, height: CELL, borderRadius: radius.m },
    thumbLoading: {
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoThumb: {
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoText: {
      fontSize: 10,
      fontWeight: '800',
      color: c.paper,
      marginTop: 4,
    },
    viewer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    viewerBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    viewerCard: { width: '100%', alignItems: 'center' },
    viewerImage: { width: '100%', height: 340 },
    viewerCaption: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
      marginTop: 12,
      textAlign: 'center',
    },
    viewerMeta: {
      fontSize: 11,
      color: '#FFFFFF',
      opacity: 0.7,
      marginTop: 4,
    },
    viewerBtns: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
    },
    viewerBtn: { padding: 8 },
    viewerBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    viewerDelete: { fontSize: 13, fontWeight: '800', color: '#ff8a8a' },
  });
}
