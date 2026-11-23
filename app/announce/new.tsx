import * as DocumentPicker from 'expo-document-picker';
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
import { addAnnouncementMedia } from '../../lib/content';
import {
  isCommunityAdmin,
  listCommunityMembers,
} from '../../lib/communityContent';
import { createMentions, resolveMentions } from '../../lib/mentions';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';
import { dbMessage, isRlsError, supabase } from '../../lib/supabase';
import {
  MAX_IMAGE_BYTES,
  removeFromBucket,
  uploadToBucket,
  type PickedAsset,
} from '../../lib/uploads';

export default function NewAnnouncement() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [images, setImages] = useState<PickedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const scoped = await resolveSelectedCommunityId();
      setCommunityId(scoped);
      setAdmin(scoped ? await isCommunityAdmin(scoped) : false);
      setReady(true);
    })();
  }, []);

  async function handleAttach() {
    setError(null);
    if (images.length >= 4) {
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
    setImages((prev) => [...prev, ...picked].slice(0, 4));
  }

  async function handlePost() {
    setError(null);
    if (!communityId) {
      setError('Join or create a community first, then come back to post.');
      return;
    }
    if (!admin) {
      setError('Only community admins can post announcements.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Give the announcement a title.');
      return;
    }
    if (body.trim().length < 1 && images.length === 0) {
      setError('Write the announcement or attach a picture.');
      return;
    }
    setLoading(true);
    const uploadedPaths: string[] = [];
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');
      for (const asset of images) {
        const uploaded = await uploadToBucket(
          'post-media',
          communityId,
          asset,
          MAX_IMAGE_BYTES,
        );
        uploadedPaths.push(uploaded.path);
      }
      const base = {
        community_id: communityId,
        author_id: user.id,
        title: title.trim(),
        body: body.trim() || title.trim(),
      };
      const full = await supabase
        .from('announcements')
        .insert({ ...base, admins_only: adminsOnly })
        .select('id')
        .single();
      let announcementId: string | null = null;
      if (full.error) {
        const message = dbMessage(full.error, '');
        if (!/column|schema cache|PGRST/i.test(message)) {
          if (isRlsError(full.error)) {
            throw new Error(
              'Posting is blocked by the database rules. Ask your admin to apply the latest database update.',
            );
          }
          throw full.error;
        }
        if (adminsOnly) {
          throw new Error(
            'Admins-only needs the latest database update. Ask your admin to apply it.',
          );
        }
        const legacy = await supabase
          .from('announcements')
          .insert(base)
          .select('id')
          .single();
        if (legacy.error || !legacy.data) {
          throw legacy.error ?? new Error('Could not post.');
        }
        announcementId = String((legacy.data as { id: string }).id);
      } else {
        if (!full.data) throw new Error('Could not post.');
        announcementId = String((full.data as { id: string }).id);
      }
      if (uploadedPaths.length > 0) {
        try {
          await addAnnouncementMedia(announcementId, uploadedPaths);
        } catch (err) {
          for (const path of uploadedPaths) {
            await removeFromBucket('post-media', path).catch(() => {});
          }
          throw err;
        }
      }
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
          announcementId,
        }).catch(() => {});
      }
      router.replace('/update');
    } catch (err) {
      setError(dbMessage(err, 'Could not post.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW ANNOUNCEMENT" />
      <Screen>
        <Heading>Post announcement</Heading>
        {!ready ? (
          <Subtext>Loading your community…</Subtext>
        ) : !communityId ? (
          <Subtext>
            Join or create a community first, then come back to post.
          </Subtext>
        ) : !admin ? (
          <Subtext>
            Only community admins can post announcements. Ask a community
            admin to post this for you.
          </Subtext>
        ) : (
          <>
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
            <Text style={styles.label}>PICTURES (OPTIONAL, UP TO 4)</Text>
            {images.length > 0 ? (
              <View style={styles.previewWrap}>
                <View style={styles.thumbs}>
                  {images.map((asset) => (
                    <View key={asset.uri} style={styles.thumbWrap}>
                      <Image source={{ uri: asset.uri }} style={styles.thumb} />
                      <Pressable
                        onPress={() =>
                          setImages((prev) =>
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
                {images.length < 4 ? (
                  <Button
                    title="Add more"
                    variant="outline"
                    onPress={handleAttach}
                  />
                ) : null}
              </View>
            ) : (
              <Button
                title="Attach pictures"
                variant="outline"
                onPress={handleAttach}
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
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
