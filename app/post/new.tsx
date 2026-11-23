import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MentionInput } from '../../components/MentionInput';
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
import {
  isCommunityAdmin,
  isCommunityMember,
  listCommunityMembers,
} from '../../lib/communityContent';
import { addPostMedia } from '../../lib/content';
import { createMentions, resolveMentions } from '../../lib/mentions';
import { invalidateCache } from '../../lib/net';
import { ensureMediaLibrary } from '../../lib/permissions';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import { dbMessage, isRlsError, supabase } from '../../lib/supabase';
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  removeFromBucket,
  uploadToBucket,
  type PickedAsset,
} from '../../lib/uploads';

export default function NewPost() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [member, setMember] = useState(false);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [asAnnouncement, setAsAnnouncement] = useState(false);
  const [media, setMedia] = useState<
    { asset: PickedAsset; kind: 'image' | 'video' }[]
  >([]);
  const [files, setFiles] = useState<PickedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const scoped = await resolveSelectedCommunityId();
      setCommunityId(scoped);
      setAdmin(scoped ? await isCommunityAdmin(scoped).catch(() => false) : false);
      setMember(
        scoped ? await isCommunityMember(scoped).catch(() => false) : false,
      );
      setReady(true);
    })();
  }, []);

  async function handleAttachMedia() {
    setError(null);
    if (media.length >= 4) {
      setError('Up to 4 photos or videos per post.');
      return;
    }
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to attach photos and videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked = (result.assets ?? []).map((asset) => ({
      asset: {
        uri: asset.uri,
        name:
          asset.fileName ?? (asset.type === 'video' ? 'video.mp4' : 'photo.jpg'),
        mimeType: asset.mimeType ?? undefined,
        size: asset.fileSize ?? undefined,
      } satisfies PickedAsset,
      kind: (asset.type === 'video' ? 'video' : 'image') as
        | 'image'
        | 'video',
    }));
    setMedia((prev) => [...prev, ...picked].slice(0, 4));
  }

  async function handleAttachFile() {
    setError(null);
    if (files.length >= 2) {
      setError('Up to 2 files per post.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const picked = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name ?? 'file',
      mimeType: asset.mimeType ?? undefined,
      size: asset.size ?? undefined,
    }));
    setFiles((prev) => [...prev, ...picked].slice(0, 2));
  }

  async function handlePost() {
    setError(null);
    if (!communityId) {
      setError('Join or create a community first, then come back to post.');
      return;
    }
    if (!member) {
      setError('Join this community first, then come back to post.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Give the post a title.');
      return;
    }
    if (text.trim().length < 1 && media.length === 0 && files.length === 0) {
      setError('Write something or attach a photo, video or file first.');
      return;
    }
    setLoading(true);
    const uploadedPaths: string[] = [];
    const uploadedItems: {
      path: string;
      kind: 'image' | 'video' | 'file';
      fileName?: string;
      fileSize?: number;
    }[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');
      for (const item of media) {
        const uploaded = await uploadToBucket(
          'post-media',
          communityId,
          item.asset,
          item.kind === 'video' ? MAX_MEDIA_BYTES : MAX_IMAGE_BYTES,
        );
        uploadedPaths.push(uploaded.path);
        uploadedItems.push({ path: uploaded.path, kind: item.kind });
      }
      for (const asset of files) {
        const uploaded = await uploadToBucket(
          'post-media',
          communityId,
          asset,
          MAX_FILE_BYTES,
        );
        uploadedPaths.push(uploaded.path);
        uploadedItems.push({
          path: uploaded.path,
          kind: 'file',
          fileName: asset.name,
          fileSize: asset.size,
        });
      }
      const cover = uploadedItems.find((item) => item.kind === 'image');
      const { data: postRow, error: insertError } = await supabase
        .from('posts')
        .insert({
          community_id: communityId,
          author_id: user.id,
          title: title.trim(),
          text: text.trim(),
          ...(cover ? { image_url: cover.path } : {}),
        })
        .select('id')
        .single();
      if (insertError || !postRow) {
        const message = dbMessage(insertError, '');
        for (const path of uploadedPaths) {
          await removeFromBucket('post-media', path).catch(() => {});
        }
        if (/column|schema|PGRST/i.test(message)) {
          throw new Error(
            'Posting needs the latest database update. Ask your admin to apply it.',
          );
        }
        if (isRlsError(insertError)) {
          throw new Error(
            'Posting is blocked by the database rules. Ask your admin to apply the latest database update (member posting).',
          );
        }
        throw insertError ?? new Error('Could not post.');
      }
      if (uploadedItems.length > 0) {
        await addPostMedia((postRow as { id: string }).id, uploadedItems);
      }
      if (asAnnouncement && admin) {
        const { error: announceError } = await supabase
          .from('announcements')
          .insert({
            community_id: communityId,
            author_id: user.id,
            title: title.trim(),
            body: text.trim() || title.trim(),
            post_id: (postRow as { id: string }).id,
          });
        if (announceError) throw announceError;
      }
      const postId = (postRow as { id: string }).id;
      if (text.includes('@')) {
        const page = await listCommunityMembers(communityId, {
          limit: 200,
        }).catch(() => ({ members: [], hasMore: false }));
        const userIds = resolveMentions(
          text,
          page.members.map((m) => ({ userId: m.userId, name: m.name })),
          user.id,
        );
        await createMentions({
          userIds,
          communityId,
          postId,
        }).catch(() => {});
      }
      // Bust the list caches so the new post is on top of Home the
      // moment we land there — no manual refresh needed.
      await invalidateCache(`feed:${communityId}`).catch(() => {});
      if (asAnnouncement && admin) {
        await invalidateCache(`announcements:${communityId}`).catch(() => {});
      }
      router.replace('/feed');
    } catch (err) {
      setError(dbMessage(err, 'Could not post.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW POST" />
      <Screen>
        <Heading>Share an update</Heading>
        {!ready ? (
          <Subtext>Loading your community…</Subtext>
        ) : !communityId ? (
          <Subtext>
            Join or create a community first, then come back to post.
          </Subtext>
        ) : !member ? (
          <Subtext>
            Join this community first, then come back to post.
          </Subtext>
        ) : (
          <>
            <Field
              label="TITLE"
              placeholder="Give the post a title"
              value={title}
              onChangeText={setTitle}
            />
            <MentionInput
              label="POST (TIP: @NAME TO TAG SOMEONE)"
              placeholder="What's happening?"
              numberOfLines={5}
              value={text}
              onChangeText={setText}
              communityId={communityId}
            />
            {admin ? (
              <Pressable
                hitSlop={8}
                onPress={() => setAsAnnouncement((v) => !v)}
                style={styles.toggleRow}
              >
                <View
                  style={[styles.toggle, asAnnouncement && styles.toggleOn]}
                >
                  {asAnnouncement ? (
                    <Text style={styles.toggleTick}>✓</Text>
                  ) : null}
                </View>
                <Text style={styles.toggleLabel}>
                  ALSO POST AS ANNOUNCEMENT
                </Text>
              </Pressable>
            ) : null}
            <Text style={styles.label}>
              PHOTOS & VIDEOS (OPTIONAL, UP TO 4)
            </Text>
            {media.length > 0 ? (
              <View style={styles.previewWrap}>
                <View style={styles.thumbs}>
                  {media.map((item) => (
                    <View key={item.asset.uri} style={styles.thumbWrap}>
                      {item.kind === 'video' ? (
                        <View style={[styles.thumb, styles.videoTile]}>
                          <Ionicons
                            name="play-circle"
                            size={32}
                            color={c.paper}
                          />
                          <Text style={styles.videoName} numberOfLines={1}>
                            {item.asset.name}
                          </Text>
                        </View>
                      ) : (
                        <Image
                          source={{ uri: item.asset.uri }}
                          style={styles.thumb}
                        />
                      )}
                      <Pressable
                        onPress={() =>
                          setMedia((prev) =>
                            prev.filter((m) => m.asset.uri !== item.asset.uri),
                          )
                        }
                        hitSlop={8}
                      >
                        <Text style={styles.remove}>REMOVE</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                {media.length < 4 ? (
                  <Button
                    title="Add more"
                    variant="outline"
                    onPress={handleAttachMedia}
                  />
                ) : null}
              </View>
            ) : (
              <Button
                title="Attach photos or videos"
                variant="outline"
                onPress={handleAttachMedia}
              />
            )}
            <Text style={styles.label}>FILES (OPTIONAL, UP TO 2)</Text>
            {files.length > 0 ? (
              <View style={styles.previewWrap}>
                {files.map((asset) => (
                  <View key={asset.uri} style={styles.fileRow}>
                    <Ionicons
                      name="document-attach-outline"
                      size={22}
                      color={c.primary}
                    />
                    <View style={styles.fileMid}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {asset.name}
                      </Text>
                      {typeof asset.size === 'number' && asset.size > 0 ? (
                        <Text style={styles.fileMeta}>
                          {(asset.size / (1024 * 1024)).toFixed(1)} MB
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() =>
                        setFiles((prev) =>
                          prev.filter((a) => a.uri !== asset.uri),
                        )
                      }
                      hitSlop={8}
                    >
                      <Text style={styles.remove}>REMOVE</Text>
                    </Pressable>
                  </View>
                ))}
                {files.length < 2 ? (
                  <Button
                    title="Add more"
                    variant="outline"
                    onPress={handleAttachFile}
                  />
                ) : null}
              </View>
            ) : (
              <Button
                title="Attach files"
                variant="outline"
                onPress={handleAttachFile}
              />
            )}
            <ErrorText message={error} />
            <Button title="Post" loading={loading} onPress={handlePost} />
          </>
        )}
      </Screen>
    </>
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
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: '48%', gap: 4 },
  thumb: { width: '100%', height: 120, borderRadius: radius.m },
  videoTile: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  videoName: { fontSize: 11, color: c.paper },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    padding: 10,
  },
  fileMid: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '700', color: c.text },
  fileMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  remove: { fontSize: 12, fontWeight: '800', color: c.danger },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  toggle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: c.ink },
  toggleTick: { fontSize: 14, fontWeight: '800', color: c.paper },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: c.text,
    letterSpacing: 1,
  },
});
}
