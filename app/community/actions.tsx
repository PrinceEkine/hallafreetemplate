import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EmptyState, SearchField } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, ErrorText, Field } from '../../components/ui';
import { radius, type ThemeColors } from '../../constants/theme';
import { CACHE_TTL, isOnline, resolveWithCache } from '../../lib/net';
import { useColors } from '../../lib/theme';
import {
  endRoomSignal,
  getRoomCalls,
  startRoomSignal,
  subscribeToAllCallSignals,
  type CallSignal,
} from '../../lib/calls';
import {
  createMeeting,
  deleteMeeting,
  getCommunityBasics,
  isCommunityAdmin,
  listMeetings,
  listMeetingMembers,
  setMeetingMembers,
  type CommunityBasics,
  type Meeting,
  type MemberEntry,
} from '../../lib/communityContent';
import { listCommunityMembers } from '../../lib/communityContent';
import {
  joinGroup,
  listCommunityGroups,
  type CommunityGroup,
} from '../../lib/chat';
import { ensureCallPermissions } from '../../lib/permissions';
import { supabase } from '../../lib/supabase';

type Kind = 'room' | 'podcast' | 'management';

const KINDS: { id: Kind; label: string; icon: 'videocam' | 'mic' | 'lock-closed' }[] = [
  { id: 'room', label: 'ROOM', icon: 'videocam' },
  { id: 'podcast', label: 'PODCAST', icon: 'mic' },
  { id: 'management', label: 'MANAGEMENT', icon: 'lock-closed' },
];

const DEFAULT_ROOMS: { name: string; kind: Kind }[] = [
  { name: 'Meeting Room 1', kind: 'room' },
  { name: 'Meeting Room 2', kind: 'room' },
  { name: 'Management Meeting Room', kind: 'management' },
  { name: 'Podcast Radio', kind: 'podcast' },
];

/**
 * Searchable, scrollable full-name checklist of community members.
 * Used both when an admin creates a room and when they edit its invites.
 */
function MemberPicker({
  communityId,
  selected,
  onToggle,
}: {
  communityId: string;
  selected: Set<string>;
  onToggle: (userId: string) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [people, setPeople] = useState<MemberEntry[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const page = await listCommunityMembers(communityId, { limit: 200 });
        if (!alive) return;
        setPeople(
          page.members.filter(
            (m) => m.status === 'active' && m.userId !== user?.id,
          ),
        );
      } catch {
        if (alive) setPeople([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [communityId]);

  const needle = query.trim().toLowerCase();
  const visible = (people ?? []).filter(
    (p) => !needle || p.name.toLowerCase().includes(needle),
  );

  return (
    <View>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search members"
      />
      {people === null ? (
        <ActivityIndicator style={styles.pickerLoader} color={c.ink} />
      ) : visible.length === 0 ? (
        <Text style={styles.pickerEmpty}>
          {needle ? 'No members match that name.' : 'No members to invite yet.'}
        </Text>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.userId}
          style={styles.pickerList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p }) => (
            <Pressable style={styles.row} onPress={() => onToggle(p.userId)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(p.name.trim().slice(0, 1) || '•').toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowMid}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.role}>
                  {p.role === 'owner' || p.role === 'admin'
                    ? 'ADMIN'
                    : 'STAFF'}
                </Text>
              </View>
              <Ionicons
                name={
                  selected.has(p.userId)
                    ? 'checkmark-circle'
                    : 'ellipse-outline'
                }
                size={24}
                color={
                  selected.has(p.userId) ? c.primary : c.subtext
                }
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Meetings() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [basics, setBasics] = useState<CommunityBasics | null>(null);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [roomQuery, setRoomQuery] = useState('');
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [admin, setAdmin] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, CallSignal>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [inRoom, setInRoom] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('room');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [managing, setManaging] = useState<Meeting | null>(null);
  const [manageIds, setManageIds] = useState<Set<string>>(new Set());
  const [manageBusy, setManageBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<{
    mic: boolean;
    camera: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const bundle = (
        await resolveWithCache(
          `meetings:${id}`,
          () =>
            Promise.all([
              getCommunityBasics(id),
              isCommunityAdmin(id),
              listMeetings(id),
              listCommunityGroups(id),
              supabase.auth.getUser(),
            ]),
          { ttlMs: CACHE_TTL.communities },
        )
      ).value;
      if (!bundle) {
        setError('You are offline. Open meetings once online to save them.');
        return;
      }
      const [basicsData, adminFlag, page, groupList, session] = bundle;
      setBasics(basicsData);
      setAdmin(adminFlag);
      setGroups(groupList);
      const me = session.data.user?.id ?? null;
      setMyId(me);
      let rooms = page.meetings;
      if (
        page.meetings.length === 0 &&
        adminFlag &&
        !page.unsupported &&
        isOnline()
      ) {
        try {
          for (const seed of DEFAULT_ROOMS) {
            await createMeeting(id, {
              name: seed.name,
              kind: seed.kind,
              conversationId: null,
            });
          }
          rooms = (await listMeetings(id)).meetings;
        } catch {
          // Seeding is best-effort; fall through to the empty list.
        }
      }
      setMeetings(rooms);
      const signals = await getRoomCalls(rooms.map((r) => r.id));
      const map: Record<string, CallSignal> = {};
      for (const s of signals) map[s.refId] = s;
      setLive(map);
      const entries = await Promise.all(
        rooms.map(async (r) => {
          const members = await listMeetingMembers(r.id).catch(() => []);
          return [
            r.id,
            members.length,
            me !== null && members.some((m) => m.userId === me),
          ] as const;
        }),
      );
      const next: Record<string, number> = {};
      const mine: Record<string, boolean> = {};
      for (const [roomId, count, joined] of entries) {
        next[roomId] = count;
        mine[roomId] = joined;
      }
      setCounts(next);
      setInRoom(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id]);

  async function refreshMeetingPerms() {
    // Calls die natively when the engine touches hardware without a
    // grant, so the rooms list asks up front instead of mid-call.
    const p = await ensureCallPermissions(true).catch(() => ({
      mic: false,
      camera: false,
    }));
    setPerm(p);
  }

  useFocusEffect(
    useCallback(() => {
      load();
      refreshMeetingPerms();
    }, [load]),
  );

  // LIVE badges follow the room rows in realtime.
  useEffect(() => {
    if (!meetings) return;
    const ids = new Set(meetings.map((m) => m.id));
    return subscribeToAllCallSignals(
      (signal) => {
        if (signal.scope !== 'room' || !ids.has(signal.refId)) return;
        setLive((prev) => ({ ...prev, [signal.refId]: signal }));
      },
      (_signalId, refId) => {
        if (!ids.has(refId)) return;
        setLive((prev) => {
          if (!prev[refId]) return prev;
          const next = { ...prev };
          delete next[refId];
          return next;
        });
      },
    );
  }, [meetings]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  /** Empty invite list = general room: the whole community can join. */
  function canJoinRoom(room: Meeting): boolean {
    if (admin) return true;
    if ((counts[room.id] ?? 0) === 0) return true;
    return inRoom[room.id] === true;
  }

  async function handleOpenRoom(room: Meeting) {
    if (!id || openingId) return;
    if (!canJoinRoom(room)) {
      setError('This room is for invited members. Ask an admin to add you.');
      return;
    }
    setError(null);
    setOpeningId(room.id);
    try {
      const signal = await startRoomSignal(
        room.id,
        id,
        // Rooms always open audio-first; members enable camera in-call.
        'voice',
      );
      setLive((prev) => ({ ...prev, [room.id]: signal }));
      router.push({
        pathname: '/call/[id]',
        params: { id: room.id, scope: 'room', media: signal.media },
      } as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open room.');
    } finally {
      setOpeningId(null);
    }
  }

  async function handleOpenChat(room: Meeting) {
    if (!room.conversation_id) return;
    setError(null);
    try {
      await joinGroup(room.conversation_id).catch(() => {});
      router.push({
        pathname: '/chat/[id]',
        params: { id: room.conversation_id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat.');
    }
  }

  function confirmEnd(room: Meeting) {
    Alert.alert('End meeting?', `${room.name} closes for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          try {
            await endRoomSignal(room.id);
            setLive((prev) => {
              const next = { ...prev };
              delete next[room.id];
              return next;
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not end.');
          }
        },
      },
    ]);
  }

  async function handleCreate() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const roomId = await createMeeting(id, {
        name,
        kind,
        conversationId: groupId,
      });
      if (invites.size > 0) {
        try {
          await setMeetingMembers(roomId, [...invites]);
        } catch {
          setError('Room created, but some invites failed to save.');
        }
      }
      setName('');
      setKind('room');
      setGroupId(null);
      setInvites(new Set());
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room.');
    } finally {
      setBusy(false);
    }
  }

  function toggleInvite(userId: string) {
    setInvites((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function openManage(room: Meeting) {
    setManaging(room);
    setSheetError(null);
    setManageBusy(true);
    try {
      const members = await listMeetingMembers(room.id);
      setManageIds(new Set(members.map((m) => m.userId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invites.');
      setManaging(null);
    } finally {
      setManageBusy(false);
    }
  }

  function toggleManage(userId: string) {
    setManageIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSaveManage() {
    if (!managing) return;
    setSheetError(null);
    setManageBusy(true);
    try {
      await setMeetingMembers(managing.id, [...manageIds]);
      setCounts((prev) => ({ ...prev, [managing.id]: manageIds.size }));
      setManaging(null);
    } catch (err) {
      // The sheet covers the page error, so failures surface inside it.
      const raw = err instanceof Error ? err.message : '';
      const message = /row-level|policy|permission|RLS/i.test(raw)
        ? 'Only community admins can change invites.'
        : (err instanceof Error ? err.message : 'Could not save invites.');
      setSheetError(message);
      setError(message);
    } finally {
      setManageBusy(false);
    }
  }

  function confirmDelete(room: Meeting) {
    Alert.alert('Delete room?', room.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMeeting(room.id);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete.');
          }
        },
      },
    ]);
  }

  function kindIcon(room: Meeting) {
    return KINDS.find((k) => k.id === room.kind)?.icon ?? 'videocam';
  }

  return (
    <>
      <ScreenHeader title="MEETING" communityId={id ?? null} showMenu backTo="/feed" />
      <OfflineBanner />
      <View style={styles.page}>
        <View style={styles.head}>
          <Text style={styles.community}>{basics?.name ?? ''}</Text>
          {admin && (
            <Pressable hitSlop={8} onPress={() => setAdding((v) => !v)}>
              <Text style={styles.newLink}>{adding ? 'CANCEL' : '+ ROOM'}</Text>
            </Pressable>
          )}
        </View>
        {adding && (
          <View style={styles.form}>
            <Field
              label="ROOM NAME"
              placeholder="Meeting Room 3"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.label}>TYPE</Text>
            <View style={styles.chips}>
              {KINDS.map((k) => (
                <Pressable
                  key={k.id}
                  style={[styles.chip, kind === k.id && styles.chipActive]}
                  onPress={() => setKind(k.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      kind === k.id && styles.chipTextActive,
                    ]}
                  >
                    {k.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>LINKED GROUP (OPTIONAL)</Text>
            <View style={styles.chips}>
              <Pressable
                style={[styles.chip, groupId === null && styles.chipActive]}
                onPress={() => setGroupId(null)}
              >
                <Text
                  style={[
                    styles.chipText,
                    groupId === null && styles.chipTextActive,
                  ]}
                >
                  None yet
                </Text>
              </Pressable>
              {groups
                .filter((g) => g.joined)
                .map((g) => (
                  <Pressable
                    key={g.id}
                    style={[styles.chip, groupId === g.id && styles.chipActive]}
                    onPress={() => setGroupId(g.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        groupId === g.id && styles.chipTextActive,
                      ]}
                    >
                      {g.title}
                    </Text>
                  </Pressable>
                ))}
            </View>
            <Text style={styles.label}>
              INVITE MEMBERS{invites.size > 0 ? ` (${invites.size})` : ''}
            </Text>
            <Text style={styles.hint}>
              Invited members get an incoming-call popup when the meeting
              starts. Leave the list empty for a general room the whole
              community can join.
            </Text>
            {id ? (
              <MemberPicker
                communityId={id}
                selected={invites}
                onToggle={toggleInvite}
              />
            ) : null}
            <ErrorText message={error} />
            <Button title="Create room" loading={busy} onPress={handleCreate} />
          </View>
        )}
        <ErrorText message={adding ? null : error} />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <SearchField
            value={roomQuery}
            onChange={setRoomQuery}
            placeholder="Search meetings"
          />
        </View>
        {perm && (!perm.mic || !perm.camera) ? (
          <View style={styles.permBar}>
            <Ionicons name="mic-off-outline" size={18} color={c.paper} />
            <Text style={styles.permText}>
              Calls need{' '}
              {!perm.mic && !perm.camera
                ? 'microphone and camera'
                : !perm.mic
                  ? 'microphone'
                  : 'camera'}{' '}
              access (or allow in system settings).
            </Text>
            <Pressable hitSlop={8} onPress={refreshMeetingPerms}>
              <Text style={styles.permGrant}>GRANT ACCESS</Text>
            </Pressable>
          </View>
        ) : null}
        {meetings === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : (
          <FlatList
            data={(meetings ?? []).filter((m) => {
              const needle = roomQuery.trim().toLowerCase();
              return !needle || m.name.toLowerCase().includes(needle);
            })}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="videocam"
                title="No meeting rooms"
                body={
                  admin
                    ? 'Create the first room for this community.'
                    : 'Your admin has not created any rooms yet.'
                }
              />
            }
            renderItem={({ item }) => {
              const signal = live[item.id] ?? null;
              const canEnd =
                !!signal && (admin || (myId && signal.startedBy === myId));
              const canJoin = canJoinRoom(item);
              return (
                <View style={styles.card}>
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={kindIcon(item)}
                      size={22}
                      color={c.paper}
                    />
                  </View>
                  <View style={styles.mid}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {signal && (
                        <View style={styles.liveBadge}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>LIVE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.meta}>
                      {item.kind.toUpperCase()}
                      {(counts[item.id] ?? 0) > 0
                        ? ` • ${counts[item.id]} INVITED`
                        : ' • GENERAL'}
                      {item.conversation_id ? ' • LINKED CHAT' : ''}
                    </Text>
                    <View style={styles.cardActions}>
                      {canJoin ? (
                        <Pressable
                          hitSlop={8}
                          disabled={openingId === item.id}
                          onPress={() => handleOpenRoom(item)}
                        >
                          {openingId === item.id ? (
                            <ActivityIndicator
                              size="small"
                              color={c.primary}
                            />
                          ) : (
                            <Text style={styles.open}>
                              {signal ? 'JOIN' : 'OPEN'}
                            </Text>
                          )}
                        </Pressable>
                      ) : (
                        <View style={styles.privateRow}>
                          <Ionicons
                            name="lock-closed"
                            size={12}
                            color={c.subtext}
                          />
                          <Text style={styles.private}>PRIVATE</Text>
                        </View>
                      )}
                      {item.conversation_id && (
                        <Pressable
                          hitSlop={8}
                          onPress={() => handleOpenChat(item)}
                        >
                          <Text style={styles.link}>CHAT</Text>
                        </Pressable>
                      )}
                      {admin && (
                        <Pressable
                          hitSlop={8}
                          onPress={() => openManage(item)}
                        >
                          <Text style={styles.link}>MEMBERS</Text>
                        </Pressable>
                      )}
                      {canEnd && (
                        <Pressable
                          hitSlop={8}
                          onPress={() => confirmEnd(item)}
                        >
                          <Text style={styles.end}>END</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                  {admin && (
                    <Pressable hitSlop={8} onPress={() => confirmDelete(item)}>
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={c.danger}
                      />
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
      <Modal
        visible={managing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setManaging(null)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              Invite to {managing?.name ?? 'room'}
            </Text>
            <Text style={styles.hint}>
              Invited members get an incoming-call popup when the meeting
              starts. Leave the list empty for a general room the whole
              community can join.
            </Text>
            {id && managing ? (
              manageBusy && manageIds.size === 0 ? (
                <ActivityIndicator
                  style={styles.pickerLoader}
                  color={c.ink}
                />
              ) : (
                <MemberPicker
                  communityId={id}
                  selected={manageIds}
                  onToggle={toggleManage}
                />
              )
            ) : null}
            <ErrorText message={sheetError} />
            <View style={styles.sheetActions}>
              <Pressable
                style={styles.sheetBtn}
                onPress={() => setManaging(null)}
              >
                <Text style={styles.sheetBtnText}>Cancel</Text>
              </Pressable>
              <Button
                title={`Save${manageIds.size > 0 ? ` (${manageIds.size})` : ''}`}
                loading={manageBusy}
                onPress={handleSaveManage}
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
  page: { flex: 1, backgroundColor: c.bg },
  loader: { marginTop: 40 },
  permBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: c.ink,
    borderRadius: radius.m,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  permText: { flex: 1, fontSize: 12, color: c.paper, lineHeight: 18 },
  permGrant: {
    fontSize: 12,
    fontWeight: '800',
    color: c.paper,
    textDecorationLine: 'underline',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  community: { fontSize: 15, fontWeight: '800', color: c.text },
  newLink: { fontSize: 13, fontWeight: '800', color: c.primary },
  form: { paddingHorizontal: 16, paddingBottom: 8 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  hint: { fontSize: 13, color: c.subtext, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: c.ink },
  chipText: { fontSize: 13, fontWeight: '700', color: c.ink },
  chipTextActive: { color: c.paper },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: c.text, flex: 1 },
  meta: { fontSize: 11, color: c.subtext, marginTop: 2, fontWeight: '700' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: c.danger,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.paper },
  liveText: { fontSize: 10, fontWeight: '800', color: c.paper },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  open: { fontSize: 13, fontWeight: '800', color: c.primary },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  private: { fontSize: 13, fontWeight: '800', color: c.subtext },
  link: { fontSize: 13, fontWeight: '800', color: c.subtext },
  end: { fontSize: 13, fontWeight: '800', color: c.danger },
  pickerLoader: { marginVertical: 16 },
  pickerEmpty: { fontSize: 13, color: c.subtext, marginVertical: 12 },
  pickerList: { maxHeight: 260, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: c.ink },
  rowMid: { flex: 1 },
  role: { fontSize: 11, color: c.subtext, marginTop: 2, fontWeight: '700' },
  sheetOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    padding: 20,
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: c.text },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  sheetBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  sheetBtnText: { fontSize: 14, fontWeight: '700', color: c.subtext },
});
}

export default function MeetingsEntry() {
  return <Meetings />;
}
