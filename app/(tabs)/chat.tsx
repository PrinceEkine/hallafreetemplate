import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Avatar, EmptyState, SearchField } from '../../components/premium';
import { type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  callLabelTone,
  listConversations,
  resolvePreviews,
} from '../../lib/chat';
import { timeAgo } from '../../lib/format';
import { CACHE_TTL, resolveWithCache } from '../../lib/net';
import { chats as mockChats, type ChatPreview } from '../../lib/mock';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useSelectedCommunityId } from '../../lib/selectedCommunity';

type Filter = 'ALL' | 'UNREAD' | 'FAV';

export default function Chat() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const demo = !isSupabaseConfigured();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [items, setItems] = useState<ChatPreview[] | null>(
    demo ? mockChats : null,
  );
  const [query, setQuery] = useState('');

  const selectedId = useSelectedCommunityId();
  const load = useCallback(
    async (force = false) => {
      if (demo) return;
      const { value } = await resolveWithCache(
        'conversations',
        () => listConversations(),
        { ttlMs: CACHE_TTL.conversations, force },
      );
      const convos = value ?? [];
      const dms = convos.filter((it) => !it.is_group);
      const plain = await resolvePreviews(dms);
    setItems(
      dms
        .filter(
          (it) =>
            !selectedId ||
            it.community_id === selectedId ||
            it.community_id === null,
        )
        .map((it) => ({
        id: it.id,
        name: it.title.toUpperCase(),
        avatarUrl: it.avatarUrl ?? null,
        preview: (plain[it.id] ?? it.preview) || 'Say hello',
        time: timeAgo(it.at),
        unread: it.unread ? 1 : 0,
        fav: false,
      })),
    );
    },
    [demo, selectedId],
  );

  useEffect(() => {
    load(false);
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    if (demo) return;
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const data = (items ?? [])
    .filter((it) =>
      filter === 'ALL' ? true : filter === 'UNREAD' ? it.unread > 0 : it.fav,
    )
    .filter(
      (it) =>
        !needle ||
        it.name.toLowerCase().includes(needle) ||
        it.preview.toLowerCase().includes(needle),
    );

  return (
    <View style={styles.page}>
      <View style={styles.searchRow}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search people"
        />
      </View>
      <OfflineBanner />
      <View style={styles.chips}>
        {(['ALL', 'UNREAD', 'FAV'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text
              style={[styles.chipText, filter === f && styles.chipTextActive]}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
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
          ) : needle || filter !== 'ALL' ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              body="Try a different search or filter."
            />
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="No messages yet"
              body={
                selectedId
                  ? 'Start a chat with someone in your community. Group chats live under Teams.'
                  : 'Start a chat with someone. Group chats live under Teams.'
              }
              actionTitle="Start a chat"
              onAction={() => router.push('/chat/new')}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: item.id } })
            }
          >
            <Avatar name={item.name} size={48} uri={item.avatarUrl} />
            <View style={styles.mid}>
              <Text style={styles.name}>{item.name}</Text>
              <Text
                style={[
                  styles.preview,
                  item.unread > 0 && styles.previewUnread,
                  callLabelTone(item.preview) === 'missed' &&
                    styles.previewMissed,
                  callLabelTone(item.preview) === 'answered' &&
                    styles.previewAnswered,
                ]}
                numberOfLines={1}
              >
                {item.preview}
              </Text>
            </View>
            <View style={styles.right}>
              <Text
                style={[styles.time, item.unread > 0 && styles.timeUnread]}
              >
                {item.time}
              </Text>
              {item.unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/chat/new')}>
        <Ionicons name="add" size={28} color={c.paper} />
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
  searchRow: { padding: 16, paddingBottom: 8 },
  chips: { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: c.ink,
    borderRadius: 20,
    paddingHorizontal: 18,
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
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.card,
  },
  mid: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: c.text },
  preview: { fontSize: 13, color: c.subtext, marginTop: 2 },
  previewUnread: { color: c.text, fontWeight: '700' },
  previewMissed: { color: c.danger, fontWeight: '700' },
  previewAnswered: { color: c.success, fontWeight: '700' },
  right: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 11, color: c.subtext },
  timeUnread: { color: c.primary, fontWeight: '800' },
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
  empty: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}
