import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
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
  addPostMedia,
  editPost,
  listPostMedia,
  removePostMedia,
  setPostCover,
  type StoredMedia,
} from '../../lib/content';
import { isCommunityAdmin, listCommunityMembers } from '../../lib/communityContent';
import {
  clearOwnMentions,
  createMentions,
  resolveMentions,
} from '../../lib/mentions';
import { ensureMediaLibrary } from '../../lib/permissions';
import { dbMessage, supabase } from '../../lib/supabase';
import {
  MAX_IMAGE_BYTES,
  publicUrl,
  removeFromBucket,
  uploadToBucket,
  type PickedAsset,
} from '../../lib/uploads';

export default function EditPost() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [kept, setKept] = useState<StoredMedia[]>([]);
  const [locked, setLocked] = useState<StoredMedia[]>([]);
  const [removed, setRemoved] = useState<StoredMedia[]>([]);
  const [added, setAdded] = useState<PickedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) {
        setError('Missing post.');
        setReady(true);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('You must be signed in.');
        const { data, error: queryError } = await supabase
          .from('posts')
          .select('title,text,author_id,community_id,image_url')
          .eq('id', id)
          .single();
        if (queryError || !data) throw new Error('Post not found.');
        const row = data as unknown as {
          title: string | null;
          text: string;
          author_id: string;
          community_id: string;
          image_url: string | null;
        };
        const community = String(row.community_id);
        const mine = String(row.author_id) === user.id;
        const admin = mine
          ? false
          : await isCommunityAdmin(community).catch(() => false);
        if (!mine && !admin) {
          throw new Error('Only the author or an admin can edit this post.');
        }
        setTitle(String(row.title ?? ''));
        setText(String(row.text ?? ''));
        setCommunityId(community);
        const media = await listPostMedia(id).catch((): StoredMedia[] => []);
        if (media.length > 0) {
          // Pictures stay editable; videos and files ride along untouched.
          setKept(media.filter((m) => m.kind === 'image'));
          setLocked(media.filter((m) => m.kind !== 'image'));
        } else if (row.image_url) {
          // Legacy single-picture post: wrap the cover so it can be kept
          // or removed like the rest.
          setKept([
            {
              id: `legacy:${row.image_url}`,
              path: String(row.image_url),
              position: 0,
              kind: 'image',
              fileName: null,
              fileSize: null,
            },
          ]);
        }
        setAllowed(true);
      } catch (err) {
        setError(dbMessage(err, 'Could not load.'));
      } finally {
        setReady(true);
      }
    })();
  }, [id]);

  async function handleAttach() {
    setError(null);
    if (kept.length + added.length >= 4) {
      setError('Up to 4 pictures per post.');
      return;
    }
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to attach photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked = (result.assets ?? [])
      .filter((asset) => asset.type !== 'video')
      .map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        mimeType: asset.mimeType ?? undefined,
        size: asset.fileSize ?? undefined,
      }));
    setAdded((prev) =>
      [...prev, ...picked].slice(0, Math.max(0, 4 - kept.length)),
    );
  }

  function handleRemoveKept(item: StoredMedia) {
    setKept((prev) => prev.filter((m) => m.id !== item.id));
    setRemoved((prev) => [...prev, item]);
  }

  async function handleSave() {
    if (!id || !communityId) return;
    setError(null);
    if (title.trim().length < 3) {
      setError('Give the post a title.');
      return;
    }
    if (text.trim().length < 1 && kept.length + added.length + locked.length === 0) {
      setError('Write something or keep a picture first.');
      return;
    }
    setLoading(true);
    const uploadedPaths: string[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');
      await editPost(id, { title, text });
      for (const item of removed) {
        if (!item.id.startsWith('legacy:')) {
          await removePostMedia([item.id]).catch(() => {});
        }
        await removeFromBucket('post-media', item.path).catch(() => {});
      }
      for (const asset of added) {
        const uploaded = await uploadToBucket(
          'post-media',
          communityId,
          asset,
          MAX_IMAGE_BYTES,
        );
        uploadedPaths.push(uploaded.path);
      }
      if (uploadedPaths.length > 0) {
        await addPostMedia(id, uploadedPaths);
      }
      await setPostCover(id, kept[0]?.path ?? uploadedPaths[0] ?? null);
      await clearOwnMentions({ postId: id }).catch(() => {});
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
          postId: id,
        }).catch(() => {});
      }
      router.back();
    } catch (err) {
      for (const path of uploadedPaths) {
        await removeFromBucket('post-media', path).catch(() => {});
      }
      setError(dbMessage(err, 'Could not save.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="EDIT POST" />
      <Screen>
        <Heading>Edit post</Heading>
        {!ready ? (
          <Subtext>Loading…</Subtext>
        ) : !allowed ? (
          <ErrorText message={error ?? 'You cannot edit this post.'} />
        ) : (
          <>
            <Subtext>Edits are marked as edited for everyone.</Subtext>
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
            <Text style={styles.label}>PICTURES (UP TO 4)</Text>
            {kept.length > 0 ? (
              <View style={styles.thumbs}>
                {kept.map((item) => (
                  <View key={item.id} style={styles.thumbWrap}>
                    <Image
                      source={{
                        uri: publicUrl('post-media', item.path),
                      }}
                      style={styles.thumb}
                    />
                    <Pressable
                      onPress={() => handleRemoveKept(item)}
                      hitSlop={8}
                    >
                      <Text style={styles.remove}>REMOVE</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {added.length > 0 ? (
              <View style={styles.thumbs}>
                {added.map((asset) => (
                  <View key={asset.uri} style={styles.thumbWrap}>
                    <Image source={{ uri: asset.uri }} style={styles.thumb} />
                    <Pressable
                      onPress={() =>
                        setAdded((prev) =>
                          prev.filter((a) => a.uri !== asset.uri),
                        )
                      }
                      hitSlop={8}
                    >
                      <Text style={styles.remove}>REMOVE</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {kept.length + added.length < 4 ? (
              <Button
                title="Add pictures"
                variant="outline"
                onPress={handleAttach}
              />
            ) : null}
            {locked.length > 0 ? (
              <Subtext>
                {locked.filter((m) => m.kind === 'video').length > 0
                  ? `${locked.filter((m) => m.kind === 'video').length} video${locked.filter((m) => m.kind === 'video').length === 1 ? '' : 's'} stay attached. `
                  : ''}
                {locked.filter((m) => m.kind === 'file').length > 0
                  ? `${locked.filter((m) => m.kind === 'file').length} file${locked.filter((m) => m.kind === 'file').length === 1 ? '' : 's'} stay attached.`
                  : ''}
              </Subtext>
            ) : null}
            <ErrorText message={error} />
            <Button title="Save" loading={loading} onPress={handleSave} />
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
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  thumbWrap: { width: '48%', gap: 4 },
  thumb: { width: '100%', height: 120, borderRadius: radius.m },
  remove: { fontSize: 12, fontWeight: '800', color: c.danger },
});
}
