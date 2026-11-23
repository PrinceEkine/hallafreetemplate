import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { OfflineBanner } from '../components/OfflineBanner';
import { ScreenHeader } from '../components/ScreenHeader';
import { fonts, radius, type ThemeColors } from '../constants/theme';
import { useColors } from '../lib/theme';
import {
  acceptCommunityInvite,
  declineCommunityInvite,
  listMyPendingInvites,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../lib/communityContent';
import { timeAgo } from '../lib/format';
import {
  CACHE_TTL,
  isOnline,
  resolveWithCache,
  runOrQueue,
  writeCache,
} from '../lib/net';
import { isSupabaseConfigured } from '../lib/supabase';

const KIND_LABEL: Record<string, string> = {
  chat: 'CHAT',
  announcements: 'ANNOUNCEMENT',
  forms: 'FORM',
  tasks: 'TASK',
  community: 'COMMUNITY',
  events: 'EVENT',
  polls: 'POLL',
};

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  chat: 'chatbubbles-outline',
  announcements: 'megaphone-outline',
  forms: 'document-text-outline',
  tasks: 'checkbox-outline',
  community: 'people-outline',
  events: 'calendar-outline',
  polls: 'bar-chart-outline',
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.toUpperCase();
}

function kindIcon(kind: string): keyof typeof Ionicons.glyphMap {
  return KIND_ICON[kind] ?? 'notifications-outline';
}

function kindChipLabel(kind: string): string {
  const label = kindLabel(kind);
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

type SectionName = 'Today' | 'Yesterday' | 'Earlier';

function sectionOf(iso: string): SectionName {
  const diff = Math.round(
    (startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000,
  );
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return 'Earlier';
}

type Filter = 'all' | 'unread' | string;

const FILTER_ORDER = [
  'chat',
  'announcements',
  'tasks',
  'forms',
  'community',
  'events',
  'polls',
];

export default function Notifications() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const demo = !isSupabaseConfigured();
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(
    demo ? [] : null,
  );
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingInvites, setPendingInvites] = useState<Set<string>>(new Set());
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      if (demo) return;
      const { value, source, cachedAt } = await resolveWithCache<AppNotification[]>(
        'notifications',
        async () => (await listNotifications()).items,
        { ttlMs: CACHE_TTL.notifications, force },
      );
      if (value) {
        setItems(value);
        setFromCache(source !== 'network');
        setUpdatedAt(cachedAt);
      } else {
        setItems([]);
      }
      setRefreshing(false);
    },
    [demo],
  );

  const loadInvites = useCallback(() => {
    if (demo) return;
    listMyPendingInvites()
      .then((list) => setPendingInvites(new Set(list.map((i) => i.id))))
      .catch(() => {});
  }, [demo]);

  useEffect(() => {
    load(false);
    loadInvites();
  }, [load, loadInvites]);

  function onRefresh() {
    if (demo) return;
    setRefreshing(true);
    load(true);
    loadInvites();
  }

  function persistLocal(next: AppNotification[]) {
    setItems(next);
    // Keep the saved copy in step so reopening (even offline) shows it.
    writeCache('notifications', next).catch(() => {});
  }

  async function handleOpen(item: AppNotification) {
    if (!item.read) {
      persistLocal(
        (items ?? []).map((n) =>
          n.id === item.id ? { ...n, read: true } : n,
        ),
      );
      runOrQueue('notification-read', { id: item.id }, () =>
        markNotificationRead(item.id),
      ).catch(() => {});
    }
    if (item.route === 'chat' && item.ref_id) {
      router.push({ pathname: '/chat/[id]', params: { id: item.ref_id } });
    } else if (item.route === 'forms' && item.ref_id) {
      router.push({ pathname: '/forms/[id]', params: { id: item.ref_id } });
    } else if (item.route === 'update') {
      router.push('/update');
    } else if (item.route === 'community' && item.ref_id) {
      router.push({
        pathname: '/community/[id]',
        params: { id: item.ref_id },
      });
    } else if (item.route === 'event' && item.ref_id) {
      router.push({ pathname: '/event/[id]', params: { id: item.ref_id } });
    } else if (item.route === 'poll' && item.ref_id) {
      router.push({
        pathname: '/community/poll/[id]',
        params: { id: item.ref_id },
      });
    } else if (item.route === 'post' && item.ref_id) {
      router.push({ pathname: '/post/[id]', params: { id: item.ref_id } });
    } else if (item.route === 'community_invite' && item.community_id) {
      router.push({
        pathname: '/community/[id]',
        params: { id: item.community_id },
      });
    }
  }

  function dropInvite(item: AppNotification) {
    setPendingInvites((prev) => {
      const next = new Set(prev);
      next.delete(item.ref_id);
      return next;
    });
    persistLocal(
      (items ?? []).map((n) =>
        n.id === item.id ? { ...n, read: true } : n,
      ),
    );
  }

  async function handleAcceptInvite(item: AppNotification) {
    if (!item.ref_id || inviteBusy) return;
    setInviteBusy(item.ref_id);
    try {
      const communityId = await acceptCommunityInvite(item.ref_id);
      dropInvite(item);
      router.push({
        pathname: '/community/[id]',
        params: { id: communityId },
      });
    } catch (err) {
      Alert.alert(
        'Could not accept',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setInviteBusy(null);
    }
  }

  async function handleDeclineInvite(item: AppNotification) {
    if (!item.ref_id || inviteBusy) return;
    setInviteBusy(item.ref_id);
    try {
      await declineCommunityInvite(item.ref_id);
      dropInvite(item);
    } catch (err) {
      Alert.alert(
        'Could not decline',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setInviteBusy(null);
    }
  }

  async function handleMarkAll() {
    persistLocal((items ?? []).map((n) => ({ ...n, read: true })));
    runOrQueue('notifications-read-all', {}, () =>
      markAllNotificationsRead(),
    ).catch(() => {});
  }

  const unread = (items ?? []).filter((n) => !n.read).length;

  const kindFilters = useMemo(() => {
    const kinds = new Set((items ?? []).map((n) => n.kind));
    return FILTER_ORDER.filter((k) => kinds.has(k));
  }, [items]);

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (items ?? []).filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (filter !== 'all' && filter !== 'unread' && n.kind !== filter) {
        return false;
      }
      if (!needle) return true;
      return (
        n.title.toLowerCase().includes(needle) ||
        n.body.toLowerCase().includes(needle)
      );
    });
    const groups = new Map<SectionName, AppNotification[]>();
    for (const n of filtered) {
      const name = sectionOf(n.created_at);
      const list = groups.get(name) ?? [];
      list.push(n);
      groups.set(name, list);
    }
    return (['Today', 'Yesterday', 'Earlier'] as SectionName[])
      .filter((name) => (groups.get(name) ?? []).length > 0)
      .map((name) => ({ title: name, data: groups.get(name) ?? [] }));
  }, [items, query, filter]);

  return (
    <>
      <ScreenHeader title="NOTIFICATIONS" />
      <View style={styles.page}>
        <OfflineBanner />
        <View style={styles.summaryRow}>
          <Text style={styles.summary} accessibilityRole="header">
            {items === null
              ? 'Loading…'
              : unread > 0
                ? `${unread} unread`
                : 'All caught up'}
          </Text>
          {unread > 0 ? (
            <Pressable
              onPress={handleMarkAll}
              hitSlop={8}
              accessibilityLabel="Mark all notifications as read"
            >
              <Text style={styles.markAll}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={c.subtext} />
            <TextInput
              placeholder="Search notifications"
              placeholderTextColor={c.subtext}
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              accessibilityLabel="Search notifications"
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={8}
                accessibilityLabel="Clear search"
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={c.subtext}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.chips}>
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'unread', label: `Unread${unread > 0 ? ` (${unread})` : ''}` },
              ...kindFilters.map((k) => ({
                key: k,
                label: kindChipLabel(k),
              })),
            ] as { key: string; label: string }[]
          ).map((chip) => {
            const active = filter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => setFilter(chip.key)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter: ${chip.label}`}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {items === null ? (
          <ActivityIndicator style={styles.loader} color={c.ink} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons
                  name={
                    !isOnline() && (items ?? []).length === 0
                      ? 'cloud-offline-outline'
                      : query || filter !== 'all'
                        ? 'search-outline'
                        : 'checkmark-circle-outline'
                  }
                  size={44}
                  color={c.subtext}
                />
                <Text style={styles.emptyTitle}>
                  {!isOnline() && (items ?? []).length === 0
                    ? 'Nothing saved yet'
                    : query || filter !== 'all'
                      ? 'No matches'
                      : 'You are all caught up'}
                </Text>
                <Text style={styles.empty}>
                  {!isOnline() && (items ?? []).length === 0
                    ? 'You are offline and there are no saved notifications on this device yet.'
                    : query || filter !== 'all'
                      ? 'Try a different search or filter.'
                      : 'New chats, announcements, tasks, forms and invites will show up here.'}
                </Text>
              </View>
            }
            ListFooterComponent={
              updatedAt ? (
                <Text style={styles.footer}>
                  {fromCache ? 'Saved copy • ' : ''}Updated{' '}
                  {timeAgo(new Date(updatedAt).toISOString())}
                </Text>
              ) : undefined
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            renderItem={({ item }) => {
              const label = kindLabel(item.kind);
              const invitePending =
                item.route === 'community_invite' &&
                !!item.ref_id &&
                pendingInvites.has(item.ref_id);
              return (
                <Pressable
                  style={[styles.card, !item.read && styles.cardUnread]}
                  onPress={() => {
                    if (invitePending) return;
                    handleOpen(item);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${kindChipLabel(item.kind)}: ${item.title}${item.read ? '' : ', unread'}`}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={kindIcon(item.kind)}
                      size={20}
                      color={item.read ? c.subtext : c.ink}
                    />
                  </View>
                  <View style={styles.cardMid}>
                    <View style={styles.cardHead}>
                      <Text style={styles.kind}>{label}</Text>
                      {!item.read && <View style={styles.dot} />}
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.body ? (
                      <Text style={styles.cardBody} numberOfLines={2}>
                        {item.body}
                      </Text>
                    ) : null}
                    <Text style={styles.cardMeta}>
                      {timeAgo(item.created_at)}
                    </Text>
                    {invitePending ? (
                      <View style={styles.inviteRow}>
                        <Pressable
                          hitSlop={8}
                          disabled={inviteBusy !== null}
                          onPress={() => handleAcceptInvite(item)}
                        >
                          <Text style={styles.accept}>
                            {inviteBusy === item.ref_id ? '…' : 'ACCEPT'}
                          </Text>
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          disabled={inviteBusy !== null}
                          onPress={() => handleDeclineInvite(item)}
                        >
                          <Text style={styles.decline}>DECLINE</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={c.subtext}
                  />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  loader: { marginTop: 40 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  summary: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: c.text,
  },
  markAll: { fontSize: 13, fontWeight: '800', color: c.ink },
  searchRow: { paddingHorizontal: 16, paddingTop: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.paper,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 40, fontSize: 15, color: c.text },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: c.ink },
  chipText: { fontSize: 12, fontWeight: '700', color: c.ink },
  chipTextActive: { color: c.paper },
  list: { padding: 16, gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: c.subtext,
    marginTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 14,
  },
  cardUnread: { backgroundColor: '#ECECF1' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMid: { flex: 1 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kind: {
    fontSize: 11,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.ink,
  },
  cardTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: c.text,
    marginTop: 2,
  },
  cardBody: { fontSize: 14, color: c.text, marginTop: 4, lineHeight: 20 },
  cardMeta: {
    fontSize: 11,
    color: c.subtext,
    fontWeight: '600',
    marginTop: 6,
  },
  inviteRow: { flexDirection: 'row', gap: 20, marginTop: 10 },
  accept: { fontSize: 13, fontWeight: '800', color: c.primary },
  decline: { fontSize: 13, fontWeight: '800', color: c.subtext },
  footer: {
    fontSize: 12,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 12,
  },
  emptyWrap: { alignItems: 'center', marginTop: 48, paddingHorizontal: 40 },
  emptyTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 18,
    color: c.text,
    marginTop: 12,
  },
  empty: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 22,
  },
});
}
