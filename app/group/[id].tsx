import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AdminTag } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText, Field } from '../../components/ui';
import { type ThemeColors } from '../../constants/theme';
import {
  CACHE_TTL,
  invalidateCache,
  resolveWithCache,
} from '../../lib/net';
import { useColors } from '../../lib/theme';
import {
  addGroupMembers,
  getGroupAdminIds,
  getGroupProfile,
  setConversationMuted,
  setGroupProfile,
  type GroupProfile,
} from '../../lib/chat';
import { ensureMediaLibrary } from '../../lib/permissions';
import {
  MAX_IMAGE_BYTES,
  uploadToBucket,
} from '../../lib/uploads';
import {
  isCommunityAdmin,
  listCommunityMembers,
  type MemberEntry,
} from '../../lib/communityContent';

export default function GroupInfo() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [profile, setProfile] = useState<GroupProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canAdd, setCanAdd] = useState(false);
  const [candidates, setCandidates] = useState<MemberEntry[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const info = (
        await resolveWithCache(`group:${id}`, () => getGroupProfile(id), {
          ttlMs: CACHE_TTL.conversations,
        })
      ).value;
      if (!info) {
        setError('You are offline. Open this group once online to save it.');
        return;
      }
      setProfile(info);
      getGroupAdminIds(id)
        .then(setAdminIds)
        .catch(() => {});
      if (info?.communityId) {
        const admin = await isCommunityAdmin(info.communityId).catch(
          () => false,
        );
        setCanAdd(admin);
        if (admin) {
          const page = await listCommunityMembers(info.communityId, {
            limit: 200,
          }).catch(() => ({ members: [], hasMore: false }));
          const inGroup = new Set(info.members.map((m) => m.userId));
          setCandidates(
            page.members.filter(
              (m) => m.status === 'active' && !inGroup.has(m.userId),
            ),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleMuteToggle() {
    if (!id || !profile || busy) return;
    setError(null);
    setBusy(true);
    try {
      await setConversationMuted(id, !profile.muted);
      setProfile({ ...profile, muted: !profile.muted });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePickIcon() {
    if (!id || !profile || iconBusy) return;
    setError(null);
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to change the icon.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setIconBusy(true);
    try {
      const uploaded = await uploadToBucket(
        'group-avatars',
        id,
        {
          uri: asset.uri,
          name: asset.fileName ?? 'icon.jpg',
          mimeType: asset.mimeType ?? undefined,
          size: asset.fileSize ?? undefined,
        },
        MAX_IMAGE_BYTES,
      );
      await setGroupProfile(id, { avatarPath: uploaded.path });
      await invalidateCache(`group:${id}`).catch(() => {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save icon.');
    } finally {
      setIconBusy(false);
    }
  }

  async function handleSaveAbout() {
    if (!id || !profile || savingAbout) return;
    setError(null);
    setSavingAbout(true);
    try {
      await setGroupProfile(id, { about: aboutDraft });
      setProfile({ ...profile, about: aboutDraft.trim() });
      await invalidateCache(`group:${id}`).catch(() => {});
      setEditingAbout(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSavingAbout(false);
    }
  }

  async function handleAdd(userId: string) {
    if (!id || addingId) return;
    setError(null);
    setAddingId(userId);
    try {
      await addGroupMembers(id, [userId]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add.');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <>
      <ScreenHeader
        title="GROUP INFO"
        backTo={id ? `/chat/${id}` : null}
      />
      <OfflineBanner />
      <View style={styles.page}>
        <ErrorText message={error} />
        {!profile ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : (
          <FlatList
            data={profile.members}
            keyExtractor={(m) => m.userId}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                <View style={styles.head}>
                  {profile.iconUrl ? (
                    <Image
                      source={{ uri: profile.iconUrl }}
                      style={styles.iconPhoto}
                    />
                  ) : (
                    <View style={styles.icon}>
                      <Text style={styles.iconLetter}>
                        {profile.title.trim().slice(0, 1).toUpperCase() || '•'}
                      </Text>
                    </View>
                  )}
                  {canAdd ? (
                    <Pressable
                      onPress={handlePickIcon}
                      disabled={iconBusy}
                      hitSlop={8}
                    >
                      <Text style={styles.editLink}>
                        {iconBusy ? 'SAVING…' : 'CHANGE ICON'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.title}>{profile.title}</Text>
                  <Text style={styles.meta}>
                    {profile.members.length} member
                    {profile.members.length === 1 ? '' : 's'}
                  </Text>
                  {editingAbout ? (
                    <View style={styles.aboutEdit}>
                      <Field
                        label="ABOUT THIS GROUP"
                        placeholder="What is this group for?"
                        multiline
                        numberOfLines={3}
                        value={aboutDraft}
                        onChangeText={setAboutDraft}
                      />
                      <View style={styles.aboutBtns}>
                        <Pressable
                          hitSlop={8}
                          onPress={() => setEditingAbout(false)}
                        >
                          <Text style={styles.editLink}>CANCEL</Text>
                        </Pressable>
                        <Button
                          title="Save"
                          loading={savingAbout}
                          onPress={handleSaveAbout}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.aboutRow}>
                      <Text style={styles.about}>
                        {profile.about || 'No description yet.'}
                      </Text>
                      {canAdd ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            setAboutDraft(profile.about);
                            setEditingAbout(true);
                          }}
                        >
                          <Text style={styles.editLink}>
                            {profile.about ? 'EDIT' : 'ADD ABOUT'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
                <Pressable
                  style={styles.muteRow}
                  onPress={handleMuteToggle}
                  disabled={busy}
                >
                  <Ionicons
                    name={
                      profile.muted
                        ? 'notifications-off-outline'
                        : 'notifications-outline'
                    }
                    size={20}
                    color={c.ink}
                  />
                  <Text style={styles.muteLabel}>NOTIFICATIONS</Text>
                  <Text style={styles.muteValue}>
                    {profile.muted ? 'MUTED' : 'ON'}
                  </Text>
                </Pressable>
                {canAdd && candidates.length > 0 && (
                  <>
                    <Text style={styles.section}>
                      ADD MEMBERS ({candidates.length})
                    </Text>
                    {candidates.map((it) => (
                      <View key={it.userId} style={styles.row}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarLetter}>
                            {it.name.trim().slice(0, 1).toUpperCase() || '•'}
                          </Text>
                        </View>
                        <Text style={styles.name}>
                          {it.name.toUpperCase()}
                        </Text>
                        {it.role === 'admin' || it.role === 'owner' ? (
                          <AdminTag />
                        ) : null}
                        <Pressable
                          hitSlop={8}
                          disabled={addingId !== null}
                          onPress={() => handleAdd(it.userId)}
                        >
                          <Text style={styles.add}>
                            {addingId === it.userId ? '…' : 'ADD'}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}
                <Text style={styles.section}>MEMBERS</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                {item.avatarUrl ? (
                  <Image
                    source={{ uri: item.avatarUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>
                      {item.name.trim().slice(0, 1).toUpperCase() || '•'}
                    </Text>
                  </View>
                )}
                <Text style={styles.name}>
                  {item.name.toUpperCase()}
                  {item.mine ? ' (YOU)' : ''}
                </Text>
                {adminIds.has(item.userId) ? <AdminTag /> : null}
              </View>
            )}
          />
        )}
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  loader: { marginTop: 40 },
  list: { padding: 16 },
  head: { alignItems: 'center', paddingVertical: 16 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: { fontSize: 28, fontWeight: '800', color: c.paper },
  iconPhoto: { width: 72, height: 72, borderRadius: 36 },
  editLink: {
    fontSize: 12,
    fontWeight: '800',
    color: c.primary,
    marginTop: 6,
  },
  aboutRow: { alignItems: 'center', marginTop: 6, paddingHorizontal: 24 },
  about: {
    fontSize: 14,
    color: c.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  aboutEdit: { width: '100%', marginTop: 8 },
  aboutBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: c.text,
    marginTop: 10,
    textAlign: 'center',
  },
  meta: { fontSize: 12, color: c.subtext, marginTop: 4 },
  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    marginTop: 8,
  },
  muteLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: c.text,
    letterSpacing: 1,
  },
  muteValue: { fontSize: 12, fontWeight: '800', color: c.primary },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: c.text,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: c.ink },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
  add: { fontSize: 13, fontWeight: '800', color: c.primary },
});
}
