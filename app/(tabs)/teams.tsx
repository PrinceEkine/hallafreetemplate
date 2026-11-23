import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { OfflineBanner } from '../../components/OfflineBanner';
import { EmptyState, SearchField } from '../../components/premium';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  CACHE_TTL,
  invalidateCache,
  resolveWithCache,
} from '../../lib/net';
import { teams as mockTeams, type Team } from '../../lib/mock';
import { isCommunityAdmin } from '../../lib/communityContent';
import {
  REDACTED_PREVIEW,
  deleteGroupChat,
  joinGroup,
  listCommunityGroups,
  resolvePreviews,
} from '../../lib/chat';
import { timeAgo } from '../../lib/format';
import {
  resolveSelectedCommunityId,
  useSelectedCommunityId,
} from '../../lib/selectedCommunity';
import { isSupabaseConfigured } from '../../lib/supabase';

const TEAM_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'JOINED', label: 'Joined' },
  { key: 'NEW', label: 'New' },
] as const;

export default function Teams() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const demo = !isSupabaseConfigured();
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Team[] | null>(demo ? mockTeams : null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'JOINED' | 'NEW'>('ALL');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [admin, setAdmin] = useState(demo);

  const selectedId = useSelectedCommunityId();

  const load = useCallback(
    async (force = false) => {
      if (demo) return;
      const scoped = await resolveSelectedCommunityId();
      if (!scoped) {
        setItems([]);
        setAdmin(false);
        return;
      }
      const adminFlag = await isCommunityAdmin(scoped).catch(() => false);
      setAdmin(adminFlag);
      const { value } = await resolveWithCache(
        `groups:${scoped}`,
        () => listCommunityGroups(scoped),
        { ttlMs: CACHE_TTL.conversations, force },
      );
      const groups = value ?? [];
      // The server only stores a redacted label, but this device holds the
      // keys: open the latest message per joined group locally, exactly
      // like the DM list. Plaintext never enters the cache.
      const plain = await resolvePreviews(
        groups
          .filter((g) => g.joined)
          .map((g) => ({
            id: g.id,
            title: g.title,
            avatarUrl: null,
            preview: g.preview,
            at: g.at,
            unread: false,
            is_group: true,
            community_id: scoped,
          })),
      ).catch(() => ({} as Record<string, string>));
      setItems(
        groups.map((g) => {
          const stored = plain[g.id] ?? g.preview;
          return {
            id: g.id,
            name: g.title.toUpperCase(),
            description:
              !g.joined || !stored || stored === REDACTED_PREVIEW
                ? 'Say hello'
                : stored,
            time: g.at ? timeAgo(g.at) : '',
            unread: 0,
            joined: g.joined,
          };
        }),
      );
    },
    [demo, selectedId],
  );

  useFocusEffect(
    useCallback(() => {
      load(false).finally(() => setRefreshing(false));
    }, [load]),
  );

  function onRefresh() {
    if (demo) return;
    setRefreshing(true);
    load(true).finally(() => setRefreshing(false));
  }

  async function handleOpen(item: Team) {
    if (demo || item.joined !== false) {
      router.push({
        pathname: '/chat/[id]',
        params: { id: item.id },
      });
      return;
    }
    if (joiningId) return;
    setJoiningId(item.id);
    try {
      await joinGroup(item.id);
      if (selectedId) {
        invalidateCache(`groups:${selectedId}`).catch(() => {});
      }
      setItems((prev) =>
        (prev ?? []).map((t) =>
          t.id === item.id ? { ...t, joined: true } : t,
        ),
      );
      router.push({
        pathname: '/chat/[id]',
        params: { id: item.id },
      });
    } catch {
      Alert.alert('Could not join.', 'Check your connection and try again.');
    } finally {
      setJoiningId(null);
    }
  }

  function handleDelete(item: Team) {
    if (demo || !admin) return;
    Alert.alert(
      'Delete group?',
      `${item.name} and its messages will be gone for everyone. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const [hasHardware, enrolled] = await Promise.all([
                LocalAuthentication.hasHardwareAsync(),
                LocalAuthentication.isEnrolledAsync(),
              ]);
              if (hasHardware && enrolled) {
                const auth = await LocalAuthentication.authenticateAsync({
                  promptMessage: `Confirm it's you to delete ${item.name}`,
                  cancelLabel: 'Cancel',
                });
                if (!auth.success) return;
              }
              await deleteGroupChat(item.id);
              if (selectedId) {
                invalidateCache(`groups:${selectedId}`).catch(() => {});
              }
              setItems((prev) => (prev ?? []).filter((t) => t.id !== item.id));
            } catch (err) {
              Alert.alert(
                'Could not delete.',
                err instanceof Error ? err.message : 'Try again.',
              );
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search groups"
          />
        </View>
        {admin && selectedId ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/chat/group-new',
                params: { communityId: selectedId },
              })
            }
            hitSlop={8}
            accessibilityLabel="Create group"
          >
            <Ionicons name="add" size={26} color={c.ink} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chips}>
        <Ionicons name="funnel-outline" size={18} color={c.subtext} />
        {TEAM_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            accessibilityLabel={`Filter: ${f.label}`}
          >
            <Text
              style={[styles.chipText, filter === f.key && styles.chipTextActive]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <OfflineBanner />
      <FlatList
        data={(items ?? []).filter(
          (t) =>
            (filter === 'ALL' ||
              (filter === 'JOINED' && t.joined !== false) ||
              (filter === 'NEW' && t.joined === false)) &&
            (!query.trim() ||
              t.name.toLowerCase().includes(query.trim().toLowerCase()) ||
              t.description.toLowerCase().includes(query.trim().toLowerCase())),
        )}
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
          items === null ? (
            <ActivityIndicator style={styles.loader} color={c.ink} />
          ) : query.trim() || filter !== 'ALL' ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              body="Try a different search or filter."
            />
          ) : !selectedId ? (
            <EmptyState
              icon="people-outline"
              title="No team yet"
              body="Join your company community to see its groups here."
              actionTitle="Discover communities"
              onAction={() => router.push('/community/discover')}
            />
          ) : admin ? (
            <EmptyState
              icon="people-circle-outline"
              title="No groups yet"
              body="Create the first group for your community."
              actionTitle="Create a group"
              onAction={() =>
                router.push({
                  pathname: '/chat/group-new',
                  params: { communityId: selectedId },
                })
              }
            />
          ) : (
            <EmptyState
              icon="people-circle-outline"
              title="No groups yet"
              body="When your community creates a group, it will show up here."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => handleOpen(item)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.mid}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.description}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.time}>{item.time}</Text>
              {item.joined === false && (
                <Text style={styles.joinTag}>
                  {joiningId === item.id ? 'JOINING…' : 'JOIN'}
                </Text>
              )}
              {item.unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
    gap: 12,
  },
  searchFlex: { flex: 1 },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: c.ink },
  mid: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: c.text },
  preview: { fontSize: 13, color: c.subtext, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 11, color: c.subtext },
  joinTag: { fontSize: 12, fontWeight: '800', color: c.primary },
  badge: {
    backgroundColor: c.ink,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: c.paper, fontSize: 11, fontWeight: '700' },
  loader: { marginTop: 40 },
  emptyWrap: { alignItems: 'center' },
  empty: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  discoverLink: {
    fontSize: 13,
    fontWeight: '800',
    color: c.primary,
    marginTop: 12,
  },
});
}
