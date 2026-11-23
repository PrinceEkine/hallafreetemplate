import * as DocumentPicker from 'expo-document-picker';
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
  addAnnouncementMedia,
  editAnnouncement,
  listAnnouncementMedia,
  removeAnnouncementMedia,
  type StoredMedia,
} from '../../lib/content';
import {
  isCommunityAdmin,
  listCommunityMembers,
} from '../../lib/communityContent';
import {
  clearOwnMentions,
  createMentions,
  resolveMentions,
} from '../../lib/mentions';
import { dbMessage, supabase } from '../../lib/supabase';
import {
  MAX_IMAGE_BYTES,
  publicUrl,
  removeFromBucket,
  uploadToBucket,
  type PickedAsset,
} from '../../lib/uploads';

export default function EditAnnouncement() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [kept, setKept] = useState<StoredMedia[]>([]);
  const [removed, setRemoved] = useState<StoredMedia[]>([]);
  const [added, setAdded] = useState<PickedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) {
        setError('Missing announcement.');
        setReady(true);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('You must be signed in.');
        let res = await supabase
          .from('announcements')
          .select('title,body,admins_only,community_id')
          .eq('id', id)
          .single();
        if (res.error && /column|schema cache/i.test(String(res.error.message ?? ''))) {
          res = await supabase
            .from('announcements')
            .select('title,body,community_id')
            .eq('id', id)
            .single();
        }
        if (res.error || !res.data) {
          throw new Error('Announcement not found.');
        }
        const row = res.data as unknown as {
          title: string;
          body: string;
          admins_only?: boolean | null;
          community_id: string;
        };
        const community = String(row.community_id);
        const admin = await isCommunityAdmin(community).catch(() => false);
        if (!admin) {
          throw new Error('Only community admins can edit announcements.');
        }
        setTitle(String(row.title ?? ''));
        setBody(String(row.body ?? ''));
        setAdminsOnly(!!row.admins_only);
        setCommunityId(community);
        const media = await listAnnouncementMedia(id).catch(() => ({
          items: [],
          unsupported: true,
        }));
        setKept(media.items);
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
      setError('Up to 4 pictures per announcement.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const picked = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name ?? 'photo.jpg',
      mimeType: asset.mimeType ?? undefined,
      size: asset.size ?? undefined,
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
      setError('Give the announcement a title.');
      return;
    }
    if (body.trim().length < 1 && kept.length + added.length === 0) {
      setError('Write the announcement or keep a picture.');
      return;
    }
    setLoading(true);
    const uploadedPaths: string[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');
      await editAnnouncement(id, { title, body, adminsOnly });
      if (removed.length > 0) {
        await removeAnnouncementMedia(removed.map((m) => m.id)).catch(() => {});
        for (const item of removed) {
          await removeFromBucket('post-media', item.path).catch(() => {});
        }
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
        await addAnnouncementMedia(id, uploadedPaths);
      }
      await clearOwnMentions({ announcementId: id }).catch(() => {});
      if (body.includes('@')) {
        const page = await listCommunityMembers(communityId, {
          limit: 200,
        }).catch(() => ({ members: [], hasMore: false }));
        const userIds = resolveMentions(
          body,
          page.members.map((m) => ({ userId: m.userId, name: m.name })),
          user.id,
        );
        await createMentions({
          userIds,
          communityId,
          announcementId: id,
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
      <ScreenHeader title="EDIT ANNOUNCEMENT" />
      <Screen>
        <Heading>Edit announcement</Heading>
        {!ready ? (
          <Subtext>Loading…</Subtext>
        ) : !allowed ? (
          <ErrorText message={error ?? 'You cannot edit this announcement.'} />
        ) : (
          <>
            <Subtext>Edits are marked as edited for everyone.</Subtext>
            <Field
              label="TITLE"
              placeholder="Q3 All-Hands Meeting"
              value={title}
              onChangeText={setTitle}
            />
            <MentionInput
              label="BODY (TIP: @NAME TO TAG SOMEONE)"
              placeholder="Write the announcement…"
              numberOfLines={5}
              value={body}
              onChangeText={setBody}
              communityId={communityId}
            />
            <Pressable
              hitSlop={8}
              onPress={() => setAdminsOnly((v) => !v)}
              style={styles.toggleRow}
            >
              <View style={[styles.toggle, adminsOnly && styles.toggleOn]}>
                {adminsOnly ? (
                  <Text style={styles.toggleTick}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.toggleLabel}>VISIBLE TO ADMINS ONLY</Text>
            </Pressable>
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
