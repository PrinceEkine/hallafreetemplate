import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText, Screen } from '../../components/ui';
import { fonts, radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import { CACHE_TTL, isOnline, resolveWithCache } from '../../lib/net';
import {
  bustCommunityCache,
  getCommunityModules,
  saveCommunityModules,
} from '../../lib/communities';
import {
  collectCommunityFilePaths,
  deleteCommunity,
  EMPTY_PREF,
  exitCommunity,
  getCommunityPrefs,
  removeCommunityFiles,
  requestToJoin,
  setCommunityPref,
  transferCommunityOwnership,
  type CommunityPref,
} from '../../lib/communityContent';
import { inviteLink } from '../../lib/invites';
import {
  getSelectedCommunityId,
  setSelectedCommunityId,
} from '../../lib/selectedCommunity';
import { publicUrl } from '../../lib/uploads';
import {
  COMMUNITY_MODULES,
  DEFAULT_MODULE_SETTINGS,
  type CommunityModuleId,
  type ModuleSettings,
} from '../../lib/communityModules';
import {
  joinGroup,
  listCommunityGroups,
  resolvePreviews,
  type CommunityGroup,
} from '../../lib/chat';
import { timeAgo } from '../../lib/format';
import { supabase } from '../../lib/supabase';

type Community = {
  id: string;
  name: string;
  description: string;
  privacy: string;
  website: string;
  rules: string;
  invite_code: string;
  owner_id: string;
  logo_url: string | null;
  owner: { full_name: string | null } | null;
};

type Member = {
  user_id: string;
  role: string;
  status: string;
  profile: { full_name: string | null } | null;
};

export default function CommunityProfile() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [modules, setModules] = useState<ModuleSettings>({
    ...DEFAULT_MODULE_SETTINGS,
  });
  const [myId, setMyId] = useState<string | null>(null);
  const [pref, setPref] = useState<CommunityPref>({ ...EMPTY_PREF });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinState, setJoinState] = useState<'active' | 'pending' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing community.');
      return;
    }
    const bundle = (
      await resolveWithCache(
        `community:${id}`,
        () =>
          Promise.all([
            supabase.auth.getUser(),
            supabase
              .from('communities')
              .select(
                'id,name,description,privacy,website,rules,invite_code,owner_id,logo_url,owner:profiles!communities_owner_id_fkey(full_name)',
              )
              .eq('id', id)
              .single(),
            supabase
              .from('community_members')
              .select(
                'user_id,role,status,profile:profiles!community_members_user_id_fkey(full_name)',
              )
              .eq('community_id', id),
            listCommunityGroups(id).catch((): CommunityGroup[] => []),
            getCommunityModules(id).catch(() => ({ ...DEFAULT_MODULE_SETTINGS })),
            getCommunityPrefs()
              .then((all) => all[id] ?? { ...EMPTY_PREF })
              .catch(() => ({ ...EMPTY_PREF })),
          ]),
        { ttlMs: CACHE_TTL.communities },
      )
    ).value;
    if (!bundle) {
      setError(
        isOnline()
          ? 'Community not found.'
          : 'You are offline. Open this community once online to save it.',
      );
      return;
    }
    const [auth, communityRes, memberRes, groupList, moduleSettings, prefs] =
      bundle;
    setMyId(auth.data.user?.id ?? null);
    if (communityRes.error || !communityRes.data) {
      setError('Community not found.');
      return;
    }
    setCommunity(communityRes.data as unknown as Community);
    setMembers((memberRes.data as unknown as Member[]) ?? []);
    const plain = await resolvePreviews(
      groupList.map((g) => ({
        id: g.id,
        title: g.title,
        avatarUrl: null,
        preview: g.preview,
        at: g.at,
        unread: false,
        is_group: true,
        community_id: id ?? null,
      })),
    ).catch(() => ({} as Record<string, string>));
    setGroups(
      groupList.map((g) => ({
        ...g,
        preview: plain[g.id] ?? g.preview,
      })),
    );
    setModules(moduleSettings);
    setPref(prefs);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const myMembership = members.find((m) => m.user_id === myId);
  const isMember = myMembership?.status === 'active';
  const isAdmin =
    myMembership?.status === 'active' &&
    (myMembership.role === 'owner' || myMembership.role === 'admin');
  const isOwner = community?.owner_id === myId;
  const managers = members.filter((m) => m.role === 'owner' || m.role === 'admin');
  async function handleToggle(moduleId: CommunityModuleId, value: boolean) {
    if (!id) return;
    const prev = modules;
    const next = { ...modules, [moduleId]: value };
    setModules(next);
    try {
      await saveCommunityModules(id, next);
    } catch (err) {
      // Revert: a toggle that only sticks locally lies, and every other
      // surface keeps showing the module.
      setModules(prev);
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  async function handleJoinGroup(group: CommunityGroup) {
    setError(null);
    try {
      await joinGroup(group.id);
      await load();
      router.push({
        pathname: '/chat/[id]',
        params: { id: group.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join group.');
    }
  }

  async function handleJoin() {
    if (!id || joining || joinState) return;
    setError(null);
    setJoining(true);
    try {
      const status = await requestToJoin(id);
      setJoinState(status);
      if (status === 'active') {
        setSelectedCommunityId(id);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join.');
    } finally {
      setJoining(false);
    }
  }

  async function handleApprove(userId: string) {
    setError(null);
    setBusy(true);
    try {
      const { error: updateError } = await supabase
        .from('community_members')
        .update({ status: 'active' })
        .eq('community_id', id)
        .eq('user_id', userId);
      if (updateError) throw updateError;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePrefToggle(key: keyof CommunityPref) {
    if (!id) return;
    setError(null);
    const next = { ...pref, [key]: !pref[key] };
    try {
      await setCommunityPref(id, { [key]: next[key] });
      setPref(next);
      if (key === 'archived' && next.archived) {
        setSelectedCommunityId(null);
        router.replace('/profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  function handleExport() {
    if (!community) return;
    const lines = [
      `${community.name}`,
      community.description,
      `Privacy: ${community.privacy} • Website: ${community.website || '-'}`,
      `Invite code: ${community.invite_code}`,
      `Owner: ${community.owner?.full_name ?? 'Staff'}`,
      '',
      `MEMBERS (${members.length})`,
      ...members.map(
        (m) =>
          `- ${m.profile?.full_name ?? 'Staff Member'} (${m.role}, ${m.status})`,
      ),
      '',
      `GROUPS (${groups.length})`,
      ...groups.map((g) => `- ${g.title} (${g.memberCount} members)`),
      '',
      `Exported ${new Date().toLocaleString()}`,
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  }

  function afterExit(action: 'left' | 'deleted' | 'transferred' | 'scheduled') {
    if (id && getSelectedCommunityId() === id) {
      setSelectedCommunityId(null);
    }
    if (action === 'scheduled') {
      Alert.alert(
        'Left community',
        `You left ${community?.name ?? 'the community'}. You were the last member, so it will be permanently deleted in 24 hours unless someone rejoins.`,
        [{ text: 'OK', onPress: () => router.replace('/teams') }],
      );
    } else if (action === 'deleted') {
      Alert.alert(
        'Community deleted',
        `${community?.name ?? 'The community'} and everything in it is gone.`,
        [{ text: 'OK', onPress: () => router.replace('/teams') }],
      );
    } else if (action === 'transferred') {
      Alert.alert(
        'Ownership transferred',
        `Ownership of ${community?.name ?? 'the community'} moved to another admin.`,
        [{ text: 'OK', onPress: () => router.replace('/teams') }],
      );
    } else {
      router.replace('/teams');
    }
  }

  function handleLeave() {
    if (!id || !community) return;
    const activeCount = members.filter((m) => m.status === 'active').length;
    const lastOut = activeCount <= 1;
    Alert.alert(
      `Leave ${community.name}?`,
      lastOut
        ? 'You are the last member. Leaving schedules the community for permanent deletion in 24 hours (a rejoin cancels it). Export its info first if you need a copy.'
        : 'You can rejoin later with an invite.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(lastOut
          ? [{ text: 'Export info first', onPress: handleExport }]
          : []),
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setBusy(true);
            try {
              afterExit(await exitCommunity(id));
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not leave.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function handleTransfer() {
    if (!id) return;
    const candidates = members.filter(
      (m) => m.status === 'active' && m.user_id !== myId && m.role === 'admin',
    );
    if (candidates.length === 0) {
      setError('Make someone an admin first (in Directory), then transfer.');
      return;
    }
    Alert.alert(
      'Transfer ownership',
      'The new owner takes full control. You stay on as an admin.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...candidates.slice(0, 8).map((m) => ({
          text: m.profile?.full_name ?? 'Staff Member',
          onPress: async () => {
            setError(null);
            setBusy(true);
            try {
              await transferCommunityOwnership(id, m.user_id);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not transfer.');
            } finally {
              setBusy(false);
            }
          },
        })),
      ],
    );
  }

  function handleDelete() {
    if (!id || !community) return;
    Alert.alert(
      `Delete ${community.name}?`,
      'Everything in this community — groups, posts, tasks, dues and files — is permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setBusy(true);
            try {
              const files = await collectCommunityFilePaths(id).catch(() => []);
              await deleteCommunity(id);
              await removeCommunityFiles(files);
              afterExit('deleted');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not delete.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function handleWebsite() {
    if (!community?.website) return;
    const url = community.website.startsWith('http')
      ? community.website
      : 'https://' + community.website;
    try {
      await Linking.openURL(url);
    } catch {
      setError('Could not open the website.');
    }
  }

  return (
    <>
      <ScreenHeader
        title="COMMUNITY PROFILE"
        communityId={id ?? null}
        showMenu
        backTo="/feed"
      />
      <OfflineBanner />
      <Screen>
        {!community ? (
          <>
            <ActivityIndicator style={styles.loader} color={c.ink} />
            <ErrorText message={error} />
          </>
        ) : (
          <>
            <View style={styles.logoRow}>
              {community.logo_url ? (
                <Image
                  source={{
                    uri: publicUrl('avatars', community.logo_url),
                  }}
                  style={styles.logo}
                />
              ) : (
                <View style={[styles.logo, styles.logoFallback]}>
                  <Text style={styles.logoLetter}>
                    {community.name.trim().slice(0, 1).toUpperCase() || '•'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{community.name}</Text>
              {isMember && (
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/community/edit',
                      params: { id: id ?? '' },
                    })
                  }
                >
                  <Text style={styles.edit}>EDIT</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.meta}>
              {community.privacy.toUpperCase()} • Owner:{' '}
              {community.owner?.full_name ?? 'Staff'}
            </Text>
            {community.website ? (
              <Pressable onPress={handleWebsite} hitSlop={8}>
                <Text
                  style={[
                    styles.meta,
                    { color: c.primary, textDecorationLine: 'underline' },
                  ]}
                >
                  {community.website}
                </Text>
              </Pressable>
            ) : null}
            {community.description ? (
              <Text style={styles.about}>{community.description}</Text>
            ) : null}
            {community.rules ? (
              <>
                <Text style={styles.section}>COMMUNITY RULES</Text>
                <Text style={styles.about}>{community.rules}</Text>
              </>
            ) : null}
            {myMembership?.status === 'active' && (
              <Pressable
                style={styles.codeBox}
                onPress={async () => {
                  try {
                    await Clipboard.setStringAsync(community.invite_code);
                    setCopied(true);
                  } catch {
                    setError('Could not copy the code.');
                  }
                }}
              >
                <Text style={styles.codeLabel}>INVITE CODE — TAP TO COPY</Text>
                <Text style={styles.code}>{community.invite_code}</Text>
                {copied ? <Text style={styles.copied}>Copied!</Text> : null}
              </Pressable>
            )}
            {isAdmin && (
              <>
                <Pressable
                  style={styles.shareRow}
                  hitSlop={8}
                  onPress={() =>
                    Share.share({
                      message:
                        `Join ${community.name} on Ophixe: ` +
                        inviteLink(community.invite_code),
                    }).catch(() => {})
                  }
                >
                  <Ionicons
                    name="share-social-outline"
                    size={18}
                    color={c.primary}
                  />
                  <Text style={styles.shareText}>SHARE INVITE LINK</Text>
                </Pressable>
                <Pressable
                  style={styles.shareRow}
                  hitSlop={8}
                  onPress={() => setShowQr(true)}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={18}
                    color={c.primary}
                  />
                  <Text style={styles.shareText}>SHOW INVITE QR</Text>
                </Pressable>
              </>
            )}
            {!isMember && (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>NOT A MEMBER YET</Text>
                <Text style={styles.hint}>
                  Join to see groups and management.
                </Text>
                <Button
                  title={
                    joinState === 'pending'
                      ? 'Request sent'
                      : joining
                        ? 'Joining…'
                        : 'Join community'
                  }
                  loading={joining}
                  onPress={handleJoin}
                />
              </View>
            )}
            {isMember && (
            <>
            <View style={styles.prefRow}>
              <Pressable
                style={[
                  styles.prefBtn,
                  pref.pinned && styles.prefBtnActive,
                ]}
                onPress={() => handlePrefToggle('pinned')}
              >
                <Text
                  style={[
                    styles.prefText,
                    pref.pinned && styles.prefTextActive,
                  ]}
                >
                  {pref.pinned ? 'UNPIN' : 'PIN'}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.prefBtn,
                  pref.low_priority && styles.prefBtnActive,
                ]}
                onPress={() => handlePrefToggle('low_priority')}
              >
                <Text
                  style={[
                    styles.prefText,
                    pref.low_priority && styles.prefTextActive,
                  ]}
                >
                  LOW PRIORITY
                </Text>
              </Pressable>
              <Pressable
                style={styles.prefBtn}
                onPress={() => handlePrefToggle('archived')}
              >
                <Text style={styles.prefText}>ARCHIVE</Text>
              </Pressable>
            </View>

            <View style={styles.sectionHead}>
              <Text style={[styles.section, styles.sectionFlat]}>
                GROUPS ({groups.length})
              </Text>
              {isAdmin && (
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/chat/group-new',
                      params: { communityId: id ?? '' },
                    })
                  }
                >
                  <Text style={styles.newLink}>+ NEW</Text>
                </Pressable>
              )}
            </View>
            {groups.length === 0 ? (
              <Text style={styles.hint}>
                No groups yet{isAdmin ? '. Create the first one.' : '.'}
              </Text>
            ) : (
              groups.map((g) => (
                <Pressable
                  key={g.id}
                  style={styles.memberRow}
                  onPress={() =>
                    g.joined
                      ? router.push({
                          pathname: '/chat/[id]',
                          params: { id: g.id },
                        })
                      : handleJoinGroup(g)
                  }
                >
                  <View style={styles.memberMid}>
                    <Text style={styles.memberName}>{g.title}</Text>
                    <Text style={styles.memberMeta} numberOfLines={1}>
                      {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                      {g.preview ? ` • ${g.preview}` : ''}
                      {g.at ? ` • ${timeAgo(g.at)}` : ''}
                    </Text>
                  </View>
                  {!g.joined && <Text style={styles.joinTag}>JOIN</Text>}
                </Pressable>
              ))
            )}

            {isAdmin && (
              <>
                <Text style={styles.section}>PAYMENTS</Text>
                <Text style={styles.hint}>
                  Turn the wallet and dues section on or off for members.
                </Text>
                {COMMUNITY_MODULES.filter((mod) => mod.id === 'pay').map((mod) => (
                  <View key={mod.id} style={styles.toggleRow}>
                    <Ionicons
                      name={mod.icon}
                      size={20}
                      color={c.ink}
                    />
                    <View style={styles.toggleMid}>
                      <Text style={styles.toggleLabel}>{mod.label}</Text>
                      <Text style={styles.toggleBlurb}>{mod.blurb}</Text>
                    </View>
                    <Switch
                      value={modules[mod.id]}
                      onValueChange={(value) => handleToggle(mod.id, value)}
                      trackColor={{ false: c.border, true: c.ink }}
                      thumbColor={c.paper}
                    />
                  </View>
                ))}
              </>
            )}

            <Text style={styles.section}>MANAGEMENT ({managers.length})</Text>
            {managers.map((m) => (
              <View key={m.user_id} style={styles.memberRow}>
                <View style={styles.memberMid}>
                  <Text style={styles.memberName}>
                    {m.profile?.full_name ?? 'Staff Member'}
                    {m.user_id === myId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.memberMeta}>
                    {m.role.toUpperCase()} • {m.status.toUpperCase()}
                  </Text>
                </View>
                {isAdmin && m.status === 'pending' && (
                  <Text style={styles.approve} onPress={() => handleApprove(m.user_id)}>
                    {busy ? '...' : 'APPROVE'}
                  </Text>
                )}
              </View>
            ))}
            <Text
              style={[styles.newLink, { marginTop: 6 }]}
              onPress={() =>
                router.push({
                  pathname: '/community/directory',
                  params: { id: id ?? '' },
                })
              }
            >
              VIEW FULL DIRECTORY
            </Text>
            </>
            )}

            <ErrorText message={error} />
            {isMember && (
              <Button
                title="Export info"
                variant="outline"
                onPress={handleExport}
              />
            )}
            {myMembership && !isOwner && (
              <Button title="Leave community" variant="outline" onPress={handleLeave} />
            )}
            {isOwner && (
              <>
                <Text style={styles.section}>OWNER</Text>
                <Button
                  title="Transfer ownership"
                  variant="outline"
                  onPress={handleTransfer}
                />
                <Button
                  title="Delete community"
                  variant="outline"
                  onPress={handleDelete}
                />
              </>
            )}
          </>
        )}
      </Screen>
      <Modal
        visible={showQr}
        transparent
        onRequestClose={() => setShowQr(false)}
      >
        <View style={styles.qrOverlay}>
          <Pressable
            style={styles.qrBackdrop}
            onPress={() => setShowQr(false)}
          />
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>
              {community?.name ?? 'Community'}
            </Text>
            <Text style={styles.qrHint}>
              Scan to join automatically
            </Text>
            {community ? (
              <View style={styles.qrBox}>
                <QRCode value={inviteLink(community.invite_code)} size={220} />
              </View>
            ) : null}
            <Pressable hitSlop={8} onPress={() => setShowQr(false)}>
              <Text style={styles.qrClose}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  loader: { marginTop: 40 },
  logoRow: { alignItems: 'center', marginBottom: 12 },
  logo: { width: 84, height: 84, borderRadius: 42 },
  logoFallback: {
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { fontSize: 32, fontWeight: '800', color: c.paper },
  prefRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  prefBtn: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  prefBtnActive: { backgroundColor: c.ink },
  prefText: { fontSize: 12, fontWeight: '800', color: c.ink },
  prefTextActive: { color: c.paper },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: { flex: 1, fontFamily: fonts.heading, fontSize: 28, color: c.text },
  edit: { fontSize: 13, fontWeight: '800', color: c.primary },
  meta: { fontSize: 13, color: c.subtext, marginTop: 4 },
  about: { fontSize: 14, color: c.text, marginTop: 12, lineHeight: 21 },
  codeBox: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    padding: 14,
    marginTop: 16,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: c.subtext,
    letterSpacing: 1,
  },
  code: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: c.ink,
    letterSpacing: 2,
    marginTop: 4,
  },
  copied: {
    fontSize: 12,
    fontWeight: '800',
    color: c.primary,
    marginTop: 4,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
  },
  shareText: {
    fontSize: 13,
    fontWeight: '800',
    color: c.primary,
    letterSpacing: 1,
  },
  qrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  qrBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  qrCard: {
    backgroundColor: c.paper,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: c.text,
    textAlign: 'center',
  },
  qrHint: { fontSize: 12, color: c.subtext, marginTop: 4 },
  qrBox: { backgroundColor: '#fff', padding: 12, marginTop: 16 },
  qrClose: {
    fontSize: 13,
    fontWeight: '800',
    color: c.primary,
    marginTop: 16,
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
  },
  sectionFlat: { marginTop: 0, marginBottom: 0 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },
  newLink: { fontSize: 13, fontWeight: '800', color: c.primary },
  hint: { fontSize: 13, color: c.subtext, marginBottom: 4, lineHeight: 19 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 10,
  },
  toggleMid: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: c.text },
  toggleBlurb: { fontSize: 12, color: c.subtext, marginTop: 2 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  memberMid: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: c.text },
  memberMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
  joinTag: { fontSize: 13, fontWeight: '800', color: c.primary },
  approve: { fontSize: 13, fontWeight: '800', color: c.primary },
});
}
