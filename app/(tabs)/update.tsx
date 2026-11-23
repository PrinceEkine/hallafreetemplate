import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DropdownMenu, type DropdownItem } from '../../components/DropdownMenu';
import { OfflineBanner } from '../../components/OfflineBanner';
import { EmptyState, SearchField } from '../../components/premium';
import { fonts, radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  deleteAnnouncement,
  isEdited,
  reportContent,
  REPORT_REASONS,
} from '../../lib/content';
import { isCommunityAdmin } from '../../lib/communityContent';
import { newestFirst } from '../../lib/format';
import {
  CACHE_TTL,
  invalidateCache,
  resolveWithCache,
} from '../../lib/net';
import {
  announcements as mockAnnouncements,
  type Announcement,
} from '../../lib/mock';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  resolveSelectedCommunityId,
  useSelectedCommunityId,
} from '../../lib/selectedCommunity';

function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toUpperCase();
}

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  post_id: string | null;
  created_at: string;
  updated_at?: string | null;
  admins_only?: boolean | null;
};

async function fetchAnnouncementsFresh(
  scoped: string,
): Promise<Announcement[]> {
  let rows: AnnouncementRow[] | null = null;
  for (const select of [
    'id,title,body,post_id,created_at,updated_at,admins_only',
    'id,title,body,post_id,created_at',
  ]) {
    const res = await supabase
      .from('announcements')
      .select(select)
      .eq('community_id', scoped)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!res.error && res.data) {
      rows = res.data as unknown as AnnouncementRow[];
      break;
    }
  }
  if (!rows) throw new Error('Could not load announcements.');
  // List cards stay text-only: pictures and videos appear after tapping
  // through to the announcement (or its linked post via SEE MORE).
  return rows.map((row) => {
    const id = String(row.id);
    return {
      id,
      title: String(row.title),
      body: String(row.body),
      createdAt: String(row.created_at),
      date: formatDate(String(row.created_at)),
      time: formatTime(String(row.created_at)),
      postId: row.post_id ? String(row.post_id) : null,
      edited: isEdited(String(row.created_at), row.updated_at),
      adminsOnly: !!row.admins_only,
    };
  });
}

export default function Update() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const demo = !isSupabaseConfigured();
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Announcement[] | null>(
    demo ? mockAnnouncements : null,
  );
  const [query, setQuery] = useState('');
  const [admin, setAdmin] = useState(demo);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Announcement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const triggers = useRef(
    new Map<
      string,
      {
        measureInWindow: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => void;
      }
    >(),
  );

  const selectedId = useSelectedCommunityId();

  const load = useCallback(
    async (force = false) => {
      if (demo) return;
      const scoped = await resolveSelectedCommunityId();
      if (!scoped) {
        setItems([]);
        setAdmin(false);
        setScopeId(null);
        return;
      }
      const adminFlag = await isCommunityAdmin(scoped).catch(() => false);
      setAdmin(adminFlag);
      setScopeId(scoped);
      const { value } = await resolveWithCache(
        `announcements:${scoped}`,
        () => fetchAnnouncementsFresh(scoped),
        { ttlMs: CACHE_TTL.announcements, force },
      );
      if (!value) {
        setItems([]);
        return;
      }
      setItems(
        newestFirst(adminFlag ? value : value.filter((a) => !a.adminsOnly)),
      );
    },
    [demo, selectedId],
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  function onRefresh() {
    if (demo) return;
    setRefreshing(true);
    load(true).finally(() => setRefreshing(false));
  }

  function handleCopy(item: Announcement) {
    Clipboard.setStringAsync(`${item.title}\n\n${item.body}`).catch(() => {});
  }

  function handleShare(item: Announcement) {
    Share.share({
      message: `${item.title}\n\n${item.body}\n\n— via Ophixe`,
    }).catch(() => {});
  }

  function confirmDelete(item: Announcement) {
    Alert.alert('Delete announcement?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAnnouncement(item.id);
            setItems((prev) => (prev ?? []).filter((a) => a.id !== item.id));
            if (scopeId) {
              invalidateCache(`announcements:${scopeId}`).catch(() => {});
            }
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  }

  function handleReport(item: Announcement) {
    if (!scopeId) return;
    Alert.alert('Report announcement?', 'Your admins will review it.', [
      { text: 'Cancel', style: 'cancel' },
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportContent(
              { announcementId: item.id },
              scopeId,
              reason,
            );
            Alert.alert('Reported', 'Thanks — the admins have been notified.');
          } catch (err) {
            Alert.alert(
              'Could not report',
              err instanceof Error ? err.message : 'Please try again.',
            );
          }
        },
      })),
    ]);
  }

  function menuItems(item: Announcement): DropdownItem[] {
    if (demo || !admin) {
      return [
        { label: 'Copy', icon: 'copy-outline', onPress: () => handleCopy(item) },
        {
          label: 'Share',
          icon: 'share-social-outline',
          onPress: () => handleShare(item),
        },
        ...(demo
          ? []
          : [
              {
                label: 'Report',
                icon: 'flag-outline' as const,
                onPress: () => handleReport(item),
              },
            ]),
      ];
    }
    return [
      {
        label: 'Edit',
        icon: 'pencil-outline',
        onPress: () =>
          router.push({
            pathname: '/announce/edit' as never,
            params: { id: item.id },
          }),
      },
      {
        label: 'Delete',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => confirmDelete(item),
      },
      { label: 'Copy', icon: 'copy-outline', onPress: () => handleCopy(item) },
      {
        label: 'Share',
        icon: 'share-social-outline',
        onPress: () => handleShare(item),
      },
    ];
  }

  function openMenu(item: Announcement) {
    setMenuFor(item);
    setMenuPos(null);
    const node = triggers.current.get(item.id);
    if (!node?.measureInWindow) {
      setMenuPos({ top: 120, right: 16 });
      return;
    }
    try {
      node.measureInWindow((x, y, w, h) => {
        const screenW = Dimensions.get('window').width;
        setMenuPos({ top: y + h + 4, right: Math.max(8, screenW - (x + w)) });
      });
    } catch {
      setMenuPos({ top: 120, right: 16 });
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search announcements"
          />
        </View>
        {admin ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/announce/new',
                params: selectedId ? { communityId: selectedId } : {},
              })
            }
            hitSlop={8}
            accessibilityLabel="New announcement"
          >
            <Ionicons name="add" size={26} color={c.ink} />
          </Pressable>
        ) : null}
      </View>
      <OfflineBanner />
      {items === null ? (
        <ActivityIndicator style={styles.loader} color={c.ink} />
      ) : (
        <FlatList
          data={(items ?? []).filter(
            (a) =>
              !query.trim() ||
              a.title.toLowerCase().includes(query.trim().toLowerCase()) ||
              a.body.toLowerCase().includes(query.trim().toLowerCase()),
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
            query.trim() ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                body="Try a different search."
              />
            ) : !selectedId ? (
              <EmptyState
                icon="people-outline"
                title="No community yet"
                body="Join your company community to see announcements here."
                actionTitle="Discover communities"
                onAction={() => router.push('/community/discover')}
              />
            ) : admin ? (
              <EmptyState
                icon="megaphone-outline"
                title="No announcements yet"
                body="Share the first update with your community."
                actionTitle="New announcement"
                onAction={() =>
                  router.push({
                    pathname: '/announce/new',
                    params: selectedId ? { communityId: selectedId } : {},
                  })
                }
              />
            ) : (
              <EmptyState
                icon="megaphone-outline"
                title="No announcements yet"
                body="When your community posts one, it will show up here."
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                item.postId
                  ? router.push({
                      pathname: '/post/[id]',
                      params: { id: item.postId },
                    })
                  : router.push({
                      pathname: '/announce/[id]' as never,
                      params: { id: item.id },
                    })
              }
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Pressable
                  ref={(r) => {
                    if (r) {
                      triggers.current.set(
                        item.id,
                        r as unknown as {
                          measureInWindow: (
                            cb: (
                              x: number,
                              y: number,
                              w: number,
                              h: number,
                            ) => void,
                          ) => void;
                        },
                      );
                    }
                  }}
                  onPress={() => openMenu(item)}
                  hitSlop={12}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={18}
                    color={c.subtext}
                  />
                </Pressable>
              </View>
              {item.adminsOnly ? (
                <Text style={styles.adminTag}>ADMINS ONLY</Text>
              ) : null}
              <Text style={styles.cardBody} numberOfLines={3}>
                {item.body}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>
                  {item.date} • {item.time}
                  {item.edited ? ' • EDITED' : ''}
                </Text>
                {item.postId ? (
                  <Text style={styles.viewPost}>SEE MORE</Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
      <DropdownMenu
        visible={menuFor !== null}
        position={menuPos}
        items={menuFor ? menuItems(menuFor) : []}
        onClose={() => {
          setMenuFor(null);
          setMenuPos(null);
        }}
      />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  searchFlex: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  card: {
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: c.text,
  },
  adminTag: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: c.paper,
    backgroundColor: c.ink,
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  // Fixed 3-line height so every announcement card is uniform.
  cardBody: {
    fontSize: 14,
    color: c.text,
    marginTop: 6,
    lineHeight: 20,
    height: 60,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  cardDate: { fontSize: 11, color: c.subtext, fontWeight: '600' },
  viewPost: { fontSize: 11, color: c.subtext, fontWeight: '700' },
  loader: { marginTop: 40 },
  empty: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
    paddingHorizontal: 32,
  },
});
}
