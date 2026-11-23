import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DisappearPicker } from '../../components/DisappearPicker';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText, Screen, Subtext } from '../../components/ui';
import { fonts, type ThemeColors } from '../../constants/theme';
import { createDm, findDm } from '../../lib/chat';
import { listCallHistoryForUser, type CallLogEntry } from '../../lib/calls';
import { listMyCommunities } from '../../lib/communities';
import {
  adminAddMemberById,
  getCommunityMembership,
  isCommunityAdmin,
  removeMember,
  setMemberRole,
  setMemberSupportTag,
  setMemberTag,
  type ContextMembership,
} from '../../lib/communityContent';
import { timeAgo } from '../../lib/format';
import {
  CACHE_TTL,
  invalidateCache,
  isOnline,
  resolveWithCache,
} from '../../lib/net';
import { getPeerLastSeen, statusText } from '../../lib/presence';
import {
  disappearLabel,
  getDisappearSeconds,
  setDisappearSeconds,
} from '../../lib/safety';
import { useSelectedCommunityId } from '../../lib/selectedCommunity';
import { supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';
import { publicUrl } from '../../lib/uploads';

type SharedCommunity = { id: string; name: string; role: string };

function callDuration(log: CallLogEntry): string {
  if (!log.endedAt) return 'Ongoing';
  const secs = Math.max(
    0,
    Math.round(
      (new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()) /
        1000,
    ),
  );
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function logTitle(log: CallLogEntry): string {
  if (log.meetingName) return log.meetingName;
  if (log.conversationTitle) return log.conversationTitle;
  return log.meetingId ? 'Meeting room' : 'Chat call';
}

export default function MemberProfile() {
  const { id, community } = useLocalSearchParams<{
    id?: string;
    community?: string;
  }>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [myId, setMyId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shared, setShared] = useState<SharedCommunity[]>([]);
  const [contextId, setContextId] = useState<string | null>(null);
  const [contextName, setContextName] = useState('');
  const [membership, setMembership] = useState<ContextMembership | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [calls, setCalls] = useState<CallLogEntry[] | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [dmId, setDmId] = useState<string | null>(null);
  const [disappear, setDisappear] = useState<number | null>(null);
  const [disappearOpen, setDisappearOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const selectedId = useSelectedCommunityId();

  const load = useCallback(async () => {
    if (!id) {
      setError('Missing member.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be signed in.');
      return;
    }
    setMyId(user.id);
    getPeerLastSeen(id)
      .then((v) => setLastSeen(v))
      .catch(() => {});
    const bundle = (
      await resolveWithCache(
        `member:${id}`,
        async () => {
          const [{ data: profile }, mine] = await Promise.all([
            supabase
              .from('profiles')
              .select('full_name,avatar_url')
              .eq('id', id)
              .single(),
            listMyCommunities(),
          ]);
          if (!profile) {
            await invalidateCache(`member:${id}`).catch(() => {});
            throw new Error('Profile unavailable.');
          }
          const name =
            (profile as { full_name: string | null }).full_name ??
            'Staff Member';
          const avatarPath = (
            profile as { avatar_url: string | null } | null
          )?.avatar_url ?? null;
          let phone = '';
          let email = '';
          if (id === user.id) {
            email = user.email ?? '';
            const { data: contact } = await supabase
              .from('profile_contacts')
              .select('phone')
              .eq('user_id', user.id)
              .maybeSingle();
            const row = contact as { phone?: string | null } | null;
            phone = row?.phone || user.phone || 'Not added';
          } else {
            // Fellow members see the stored contacts; the contacts policy
            // only releases them inside shared communities, so strangers
            // get nothing.
            try {
              const { data, error } = await supabase
                .from('profile_contacts')
                .select('phone,email')
                .eq('user_id', id)
                .maybeSingle();
              if (error) throw error;
              const row = data as {
                phone?: string | null;
                email?: string | null;
              } | null;
              phone = row?.phone ?? '';
              email = row?.email ?? '';
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : String(
                      (err as { message?: unknown } | null)?.message ??
                        err ??
                        '',
                    );
              if (/column|schema cache/i.test(message)) {
                // Backend predates the stored email: retry phone-only.
                const { data } = await supabase
                  .from('profile_contacts')
                  .select('phone')
                  .eq('user_id', id)
                  .maybeSingle();
                phone =
                  (data as { phone?: string | null } | null)?.phone ?? '';
                email = '';
              } else {
                email = '';
                phone = '';
              }
            }
          }
          const myIds = new Set(mine.map((m) => m.id));
          const { data: memberships } = await supabase
            .from('community_members')
            .select(
              'role,community_id,community:communities!community_members_community_id_fkey(name)',
            )
            .eq('user_id', id)
            .eq('status', 'active');
          type Row = {
            role: string;
            community_id: string;
            community: { name: string } | null;
          };
          // Privacy: even admins only ever see the communities they share
          // with this person — never the full list they joined.
          const sharedList = (((memberships as unknown as Row[]) ?? [])
            .filter((r) => myIds.has(r.community_id) && r.community)
            .map((r) => ({
              id: String(r.community_id),
              name: String(r.community!.name),
              role: String(r.role),
            })));
          // The community this profile is viewed from: explicit param
          // wins, then the selected community, then the first shared one.
          const context =
            (community && sharedList.some((s) => s.id === community)
              ? community
              : selectedId && sharedList.some((s) => s.id === selectedId)
                ? selectedId
                : (sharedList[0]?.id ?? null));
          const contextName =
            sharedList.find((s) => s.id === context)?.name ?? '';
          if (!context || id === user.id) {
            return {
              name,
              avatarPath,
              phone,
              email,
              sharedList,
              contextId: null as string | null,
              contextName: '',
              memberEntry: null,
              adminFlag: false,
              self: true,
            };
          }
          const [memberEntry, adminFlag] = await Promise.all([
            getCommunityMembership(context, id).catch(() => null),
            isCommunityAdmin(context).catch(() => false),
          ]);
          return {
            name,
            avatarPath,
            phone,
            email,
            sharedList,
            contextId: context,
            contextName,
            memberEntry,
            adminFlag,
            self: false,
          };
        },
        { ttlMs: CACHE_TTL.communities },
      )
    ).value;
    if (!bundle) {
      setError(
        isOnline()
          ? 'Profile unavailable.'
          : 'You are offline. Open this profile once online to save it.',
      );
      return;
    }
    setName(bundle.name);
    setAvatarUrl(bundle.avatarPath ? publicUrl('avatars', bundle.avatarPath) : null);
    setPhone(bundle.phone);
    setEmail(bundle.email);
    setShared(bundle.sharedList);
    setContextId(bundle.contextId);
    setContextName(bundle.contextName);
    if (bundle.self) {
      setMembership(null);
      setViewerIsAdmin(false);
      setCalls(null);
      setDmId(null);
      setDisappear(null);
      return;
    }
    setMembership(bundle.memberEntry);
    setViewerIsAdmin(bundle.adminFlag);
    // Call history is visible to every viewer. Admins resolve the full
    // roster-backed history; members fall back to the starter-scoped logs
    // the call_logs policy releases inside shared communities.
    const history = await listCallHistoryForUser(id, 20).catch(() => ({
      logs: [],
      unsupported: true,
    }));
    setCalls(history.unsupported ? [] : history.logs);
    const dm = await findDm(id).catch(() => null);
    setDmId(dm);
    setDisappear(dm ? await getDisappearSeconds(dm).catch(() => null) : null);
  }, [id, community, selectedId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** DM actions prefer the selected community, then any shared one. */
  function scopedCommunity(): string | null {
    return selectedId && shared.some((s) => s.id === selectedId)
      ? selectedId
      : (shared[0]?.id ?? null);
  }

  async function handleMessage() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const conversationId = await createDm(id, scopedCommunity());
      router.replace({ pathname: '/chat/[id]', params: { id: conversationId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start chat.');
    } finally {
      setBusy(false);
    }
  }

  function openDisappearPicker() {
    if (!id || myId === id) return;
    setDisappearOpen(true);
  }

  async function applyProfileDisappear(seconds: number | null) {
    setDisappearOpen(false);
    if (!id || myId === id || actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      // Setting the timer is the only reason the profile creates the DM;
      // reading it never does.
      let dm = dmId;
      if (!dm) {
        dm = await createDm(id, scopedCommunity());
        setDmId(dm);
      }
      await setDisappearSeconds(dm, seconds);
      setDisappear(seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setActionBusy(false);
    }
  }

  function handleCreateGroup() {
    if (!id || myId === id) return;
    const scoped = scopedCommunity();
    if (!scoped) {
      setError('You share no community with this person.');
      return;
    }
    router.push({
      pathname: '/chat/group-new',
      params: { communityId: scoped, members: id },
    });
  }

  async function handleSupportTag() {
    if (!contextId || !id || actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      await setMemberSupportTag(contextId, id, membership?.isSupport !== true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update tag.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSaveTag() {
    if (!contextId || !id || actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      await setMemberTag(contextId, id, tagDraft);
      setTagOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update tag.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRole(role: 'admin' | 'member') {
    if (!contextId || !id || actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      await setMemberRole(contextId, id, role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role.');
    } finally {
      setActionBusy(false);
    }
  }

  function confirmRemove() {
    if (!contextId || !id) return;
    Alert.alert(
      'Remove from community?',
      `${name ?? 'This member'} will lose access to ${contextName || 'this community'}. You can add them back any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setActionBusy(true);
            try {
              await removeMember(contextId, id);
              await load();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Could not remove.',
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  }

  async function handleAdd() {
    if (!contextId || !id || actionBusy) return;
    setError(null);
    setActionBusy(true);
    try {
      await adminAddMemberById(contextId, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add.');
    } finally {
      setActionBusy(false);
    }
  }

  const isSelf = myId !== null && myId === id;
  const letter = (name ?? '•').trim().slice(0, 1).toUpperCase() || '•';
  const showAdminTools =
    viewerIsAdmin && !isSelf && contextId !== null && membership?.status === 'active';
  const showAddBack =
    viewerIsAdmin && !isSelf && contextId !== null && !membership;
  const roleTag = membership?.role.toUpperCase() ?? null;

  return (
    <>
      <ScreenHeader title="PROFILE" />
      <OfflineBanner />
      <Screen>
        {name === null ? (
          <>
            <ActivityIndicator style={styles.loader} color={c.ink} />
            <ErrorText message={error} />
          </>
        ) : (
          <>
            <View style={styles.headCard}>
              <Pressable onPress={() => setExpanded(true)} hitSlop={4}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>{letter}</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.headMid}>
                <Text style={styles.name} numberOfLines={2}>
                  {name}
                </Text>
                {membership?.tag ? (
                  <View style={styles.tagRow}>
                    <Text style={styles.tag}>
                      {membership.tag.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
                <Subtext>
                  {isSelf
                    ? 'This is you.'
                    : shared.length === 0
                      ? 'No communities in common.'
                      : `Member of ${shared.length} shared communit${shared.length === 1 ? 'y' : 'ies'}.`}
                </Subtext>
                {!isSelf && (
                  <Text
                    style={[
                      styles.presence,
                      statusText(lastSeen).online && styles.presenceOnline,
                    ]}
                  >
                    {statusText(lastSeen).text}
                  </Text>
                )}
              </View>
              {roleTag ? (
                <Text
                  style={[
                    styles.tag,
                    (membership?.role === 'admin' ||
                      membership?.role === 'owner') &&
                      styles.tagHot,
                  ]}
                >
                  {roleTag}
                </Text>
              ) : null}
            </View>
            <Pressable
              style={styles.expandHint}
              onPress={() => setExpanded(true)}
            >
              <Ionicons name="expand-outline" size={13} color={c.subtext} />
              <Text style={styles.expandText}>TAP PHOTO TO VIEW</Text>
            </Pressable>
            {(email || phone) && (isSelf || shared.length > 0) ? (
              <>
                <Text style={styles.section}>CONTACT DETAILS</Text>
                <View style={styles.card}>
                  {email ? (
                    <View style={styles.row}>
                      <Text style={styles.rowName}>{email}</Text>
                      <Text style={styles.rowRole}>EMAIL</Text>
                    </View>
                  ) : null}
                  {phone ? (
                    <View
                      style={[styles.row, email ? styles.rowDivider : null]}
                    >
                      <Text style={styles.rowName}>{phone}</Text>
                      <Text style={styles.rowRole}>PHONE</Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
            {!isSelf && (
              <>
                <Text style={styles.section}>ACTIONS</Text>
                <View style={styles.card}>
                  <Pressable
                    style={styles.row}
                    onPress={openDisappearPicker}
                    hitSlop={4}
                  >
                    <Ionicons name="timer-outline" size={18} color={c.ink} />
                    <Text style={styles.rowName}>Disappearing messages</Text>
                    <Text style={styles.rowRole}>
                      {disappearLabel(disappear).toUpperCase()}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.row, styles.rowDivider]}
                    onPress={handleCreateGroup}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="people-circle-outline"
                      size={18}
                      color={c.ink}
                    />
                    <Text style={styles.rowName}>Create group</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={c.subtext}
                    />
                  </Pressable>
                </View>
              </>
            )}
            {showAdminTools && (
              <>
                <Text style={styles.section}>
                  MANAGE • {contextName.toUpperCase() || 'COMMUNITY'}
                </Text>
                <View style={styles.adminBox}>
                  {membership.role !== 'owner' && (
                    <Pressable
                      style={styles.adminBtn}
                      disabled={actionBusy}
                      onPress={() =>
                        handleRole(
                          membership.role === 'admin' ? 'member' : 'admin',
                        )
                      }
                    >
                      <Ionicons
                        name={
                          membership.role === 'admin'
                            ? 'shield-outline'
                            : 'shield-checkmark-outline'
                        }
                        size={18}
                        color={c.paper}
                      />
                      <Text style={styles.adminBtnText}>
                        {membership.role === 'admin'
                          ? 'REMOVE ADMIN'
                          : 'MAKE ADMIN'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.adminBtn}
                    disabled={actionBusy}
                    onPress={handleSupportTag}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={18}
                      color={c.paper}
                    />
                    <Text style={styles.adminBtnText}>
                      {membership?.isSupport
                        ? 'REMOVE SUPPORT TAG'
                        : 'ADD SUPPORT TAG'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.adminBtn}
                    disabled={actionBusy}
                    onPress={() => {
                      setTagDraft(membership?.tag ?? '');
                      setTagOpen(true);
                    }}
                  >
                    <Ionicons name="pricetag" size={18} color={c.paper} />
                    <Text style={styles.adminBtnText}>
                      {membership?.tag ? 'EDIT MEMBER TAG' : 'ADD MEMBER TAG'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.adminBtn, styles.adminBtnDanger]}
                    disabled={actionBusy}
                    onPress={confirmRemove}
                  >
                    <Ionicons
                      name="person-remove-outline"
                      size={18}
                      color={c.danger}
                    />
                    <Text style={styles.adminBtnDangerText}>REMOVE</Text>
                  </Pressable>
                </View>
              </>
            )}
            {!isSelf && contextId !== null && calls !== null && (
              <>
                <Text style={styles.section}>CALL HISTORY</Text>
                    {calls.length === 0 ? (
                      <Text style={styles.hint}>No calls on record yet.</Text>
                    ) : (
                      <View style={styles.card}>
                        {calls.map((log, index) => (
                          <View
                            key={log.id}
                            style={[
                              styles.row,
                              index > 0 && styles.rowDivider,
                            ]}
                          >
                            <Ionicons
                              name={
                                log.media === 'video'
                                  ? 'videocam-outline'
                                  : 'call-outline'
                              }
                              size={18}
                              color={
                                log.answered === false
                                  ? c.danger
                                  : log.answered === true
                                    ? c.success
                                    : c.ink
                              }
                            />
                            <View style={styles.callMid}>
                              <Text style={styles.rowName} numberOfLines={1}>
                                {logTitle(log)}
                              </Text>
                              <Text
                                style={[
                                  styles.callMeta,
                                  log.answered === false &&
                                    styles.callMetaMissed,
                                  log.answered === true &&
                                    styles.callMetaAnswered,
                                ]}
                              >
                                {timeAgo(log.startedAt)} •{' '}
                                {callDuration(log)}
                              </Text>
                            </View>
                            <Text style={styles.rowRole}>
                              {log.media.toUpperCase()}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
              </>
            )}
            {showAddBack && (
              <>
                <Text style={styles.section}>
                  NOT IN {contextName.toUpperCase() || 'THIS COMMUNITY'}
                </Text>
                <Button
                  title="Add to community"
                  loading={actionBusy}
                  onPress={handleAdd}
                />
              </>
            )}
            {/* Communities stay private: the profile never names them. */}
            <ErrorText message={error} />
            {!isSelf && (
              <Button
                title="Message"
                loading={busy}
                onPress={handleMessage}
              />
            )}
          </>
        )}
      </Screen>
      <DisappearPicker
        visible={disappearOpen}
        value={disappear}
        onPick={applyProfileDisappear}
        onClose={() => setDisappearOpen(false)}
      />
      <Modal
        visible={expanded && name !== null}
        transparent
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.viewer}>
          <Pressable
            style={styles.viewerBackdrop}
            onPress={() => setExpanded(false)}
          />
          <Pressable
            style={styles.viewerClose}
            onPress={() => setExpanded(false)}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.viewerFallback}>
              <Text style={styles.viewerLetter}>{letter}</Text>
            </View>
          )}
          <Text style={styles.viewerName}>{name}</Text>
          {!isSelf && shared.length > 0 && (
            <Text style={styles.viewerMeta}>
              {shared.length} shared communit
              {shared.length === 1 ? 'y' : 'ies'}
            </Text>
          )}
        </View>
      </Modal>
      <Modal
        visible={tagOpen}
        transparent
        onRequestClose={() => setTagOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setTagOpen(false)}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>MEMBER TAG</Text>
            <Text style={styles.sheetHint}>
              A word shown on this member, like Usher or Choir. Empty clears
              it.
            </Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="Enter a tag name"
              placeholderTextColor={c.subtext}
              value={tagDraft}
              onChangeText={(v) => setTagDraft(v.slice(0, 24))}
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.sheetActions}>
              <Pressable
                style={styles.sheetBtn}
                disabled={actionBusy}
                onPress={() => setTagOpen(false)}
              >
                <Text style={styles.sheetBtnText}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                disabled={actionBusy}
                onPress={handleSaveTag}
              >
                <Text style={[styles.sheetBtnText, styles.sheetBtnPrimaryText]}>
                  {actionBusy ? 'SAVING…' : 'SAVE'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: 40 },
    sheetOverlay: {
      flex: 1,
      backgroundColor: '#00000088',
      justifyContent: 'flex-end',
    },
    sheetBackdrop: { ...StyleSheet.absoluteFill },
    sheet: {
      backgroundColor: c.paper,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
    },
    sheetTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    sheetHint: { fontSize: 13, color: c.subtext, marginTop: 6, lineHeight: 19 },
    sheetInput: {
      marginTop: 12,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
    },
    sheetActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 14,
    },
    sheetBtn: {
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
    },
    sheetBtnText: { fontSize: 13, fontWeight: '800', color: c.subtext },
    sheetBtnPrimary: { backgroundColor: c.ink, borderColor: c.ink },
    sheetBtnPrimaryText: { color: c.paper },
    headCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      padding: 16,
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.ink,
      borderWidth: 2,
      borderColor: c.accent,
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 32, fontWeight: '800', color: c.paper },
    headMid: { flex: 1 },
    name: { fontFamily: fonts.heading, fontSize: 24, color: c.text },
    tagRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    presence: { fontSize: 12, color: c.subtext, marginTop: 2 },
    presenceOnline: { color: c.success, fontWeight: '700' },
    tag: {
      fontSize: 11,
      fontWeight: '800',
      color: c.subtext,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    tagHot: { backgroundColor: c.ink, color: c.paper, borderWidth: 0 },
    expandHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      minHeight: 44,
    },
    expandText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.subtext,
      letterSpacing: 1,
    },
    card: {
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      paddingHorizontal: 16,
    },
    section: {
      fontSize: 12,
      fontWeight: '800',
      color: c.subtext,
      letterSpacing: 1.5,
      marginTop: 24,
      marginBottom: 8,
      marginLeft: 4,
    },
    hint: { fontSize: 14, color: c.subtext, lineHeight: 21 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      minHeight: 44,
      gap: 10,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    rowName: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
    rowRole: { fontSize: 12, fontWeight: '800', color: c.subtext },
    callMid: { flex: 1 },
    callMeta: { fontSize: 12, color: c.subtext, marginTop: 2 },
    callMetaMissed: { color: c.danger, fontWeight: '700' },
    callMetaAnswered: { color: c.success, fontWeight: '700' },
    adminBox: { gap: 10 },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    statText: { fontSize: 14, fontWeight: '700', color: c.text },
    adminBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.ink,
      borderRadius: 12,
      paddingVertical: 12,
      minHeight: 48,
    },
    adminBtnText: { fontSize: 14, fontWeight: '800', color: c.paper },
    adminBtnDanger: {
      backgroundColor: c.paper,
      borderWidth: 1.5,
      borderColor: c.danger,
    },
    adminBtnDangerText: { fontSize: 14, fontWeight: '800', color: c.danger },
    viewer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
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
    viewerClose: { position: 'absolute', top: 48, right: 20, zIndex: 1 },
    viewerImage: { width: '100%', height: '70%' },
    viewerFallback: {
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: '#26262A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewerLetter: { fontSize: 84, fontWeight: '800', color: '#FFFFFF' },
    viewerName: {
      fontSize: 20,
      fontWeight: '800',
      color: '#FFFFFF',
      marginTop: 16,
      textAlign: 'center',
    },
    viewerMeta: {
      fontSize: 13,
      color: '#FFFFFF',
      opacity: 0.7,
      marginTop: 4,
    },
  });
}
