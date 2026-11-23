import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DropdownMenu, type DropdownItem } from '../../components/DropdownMenu';
import { LikeButton } from '../../components/LikeButton';
import { OfflineBanner } from '../../components/OfflineBanner';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { EmptyState, SearchField } from '../../components/premium';
import { Skeleton } from '../../components/ui';
import { fonts, radius, type ThemeColors } from '../../constants/theme';
import { useColors } from '../../lib/theme';
import {
  deletePost,
  isEdited,
  reportContent,
  REPORT_REASONS,
} from '../../lib/content';
import {
  isCommunityAdmin,
  isCommunityMember,
} from '../../lib/communityContent';
import {
  getDmPeerInfo,
  listConversations,
  sendMessage,
  type ConversationListItem,
} from '../../lib/chat';
import {
  encryptForPeer,
  ensureKeyPublished,
  getMyKeypair,
} from '../../lib/e2ee';
import { posts as mockPosts, type Post } from '../../lib/mock';
import {
  isRlsError,
  isSupabaseConfigured,
  supabase,
} from '../../lib/supabase';
import {
  addComment,
  myLikedIds,
  mySavedIds,
  toggleLike,
  toggleSave,
} from '../../lib/engagement';
import { myTaggedPostIds } from '../../lib/mentions';
import { newestFirst, timeAgo } from '../../lib/format';
import {
  CACHE_TTL,
  invalidateCache,
  resolveWithCache,
  runOrQueue,
} from '../../lib/net';
import { publicUrl } from '../../lib/uploads';
import {
  resolveSelectedCommunityId,
  useSelectedCommunityId,
} from '../../lib/selectedCommunity';

type PostRow = {
  id: string;
  title?: string | null;
  text: string;
  image_url?: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at?: string | null;
  author_id: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
  community: { name: string } | null;
};

const AUTHOR_JOIN =
  'author:profiles!posts_author_id_fkey(full_name,avatar_url),community:communities!posts_community_id_fkey(name)';
const SELECT_WITH_TITLE_UPDATED =
  `id,title,text,image_url,likes_count,comments_count,created_at,updated_at,author_id,${AUTHOR_JOIN}`;
const SELECT_WITH_TITLE =
  `id,title,text,image_url,likes_count,comments_count,created_at,author_id,${AUTHOR_JOIN}`;
const SELECT_WITH_IMAGE_UPDATED =
  `id,text,image_url,likes_count,comments_count,created_at,updated_at,author_id,${AUTHOR_JOIN}`;
const SELECT_WITH_IMAGE =
  `id,text,image_url,likes_count,comments_count,created_at,author_id,${AUTHOR_JOIN}`;
const SELECT_BASE_UPDATED =
  `id,text,likes_count,comments_count,created_at,updated_at,author_id,${AUTHOR_JOIN}`;
const SELECT_BASE =
  `id,text,likes_count,comments_count,created_at,author_id,${AUTHOR_JOIN}`;
const SELECTS = [
  SELECT_WITH_TITLE_UPDATED,
  SELECT_WITH_TITLE,
  SELECT_WITH_IMAGE_UPDATED,
  SELECT_WITH_IMAGE,
  SELECT_BASE_UPDATED,
  SELECT_BASE,
];

type FreshFeed = { posts: Post[]; liked: string[]; mine: string[] };

async function fetchFeedFresh(scoped: string): Promise<FreshFeed> {
  const [myId, rows] = await Promise.all([
    supabase.auth
      .getUser()
      .then(({ data }) => data.user?.id ?? null)
      .catch(() => null),
    (async (): Promise<PostRow[] | null> => {
      for (const select of SELECTS) {
        try {
          const { data, error } = await supabase
            .from('posts')
            .select(select)
            .eq('community_id', scoped)
            .order('created_at', { ascending: false })
            .limit(30);
          if (error) throw error;
          return (data as unknown as PostRow[]) ?? [];
        } catch {
          // Try the next older column shape.
        }
      }
      return null;
    })(),
  ]);
  if (!rows) throw new Error('Could not load posts.');
  const mine = rows
    .filter((row) => myId && String(row.author_id) === myId)
    .map((row) => String(row.id));
  const ids = rows.map((row) => String(row.id));
  type MediaRow = {
    post_id: string;
    path: string;
    kind?: string | null;
    file_name?: string | null;
    file_size?: number | null;
  };
  const mediaPromise: Promise<MediaRow[]> =
    ids.length === 0
      ? Promise.resolve([])
      : (async () => {
          const full = await supabase
            .from('post_media')
            .select('post_id,path,kind,file_name,file_size')
            .in('post_id', ids)
            .order('position', { ascending: true })
            .limit(200);
          if (!full.error && full.data) {
            return (full.data as unknown as MediaRow[]) ?? [];
          }
          // Stale backend without the kind columns: pictures only.
          const { data } = await supabase
            .from('post_media')
            .select('post_id,path')
            .in('post_id', ids)
            .order('position', { ascending: true })
            .limit(200);
          return (data as unknown as MediaRow[]) ?? [];
        })();
  const [mediaRows, liked] = await Promise.all([
    mediaPromise,
    myLikedIds(ids),
  ]);
  type FullMedia = { uri: string; kind: string; name: string; size: number };
  const mediaByPost = new Map<string, FullMedia[]>();
  for (const m of mediaRows) {
    const key = String(m.post_id);
    const list = mediaByPost.get(key) ?? [];
    list.push({
      uri: publicUrl('post-media', String(m.path)),
      kind: String(m.kind ?? 'image'),
      name: m.file_name ? String(m.file_name) : String(m.path).split('/').pop() ?? 'file',
      size: typeof m.file_size === 'number' ? m.file_size : 0,
    });
    mediaByPost.set(key, list);
  }
  const posts: Post[] = rows.map((row) => {
    const id = String(row.id);
    const extra = mediaByPost.get(id) ?? [];
    const extraImages = extra
      .filter((m) => m.kind !== 'video' && m.kind !== 'file')
      .map((m) => m.uri);
    const images =
      extraImages.length > 0
        ? extraImages
        : extra.length === 0 && row.image_url
          ? [publicUrl('post-media', String(row.image_url))]
          : [];
    const edited = isEdited(String(row.created_at), row.updated_at);
    return {
      id,
      title: row.title ? String(row.title) : undefined,
      createdAt: String(row.created_at),
      author: (row.author?.full_name ?? 'Staff Member').toUpperCase(),
      authorAvatar: row.author?.avatar_url
        ? publicUrl('avatars', String(row.author.avatar_url))
        : null,
      handle: `${row.community?.name ?? 'Community'} • ${timeAgo(row.created_at)}${edited ? ' • edited' : ''}`,
      time: timeAgo(row.created_at),
      text: row.text,
      likes: String(row.likes_count),
      reposts: '0',
      comments: String(row.comments_count),
      shares: '0',
      color: '',
      imageUrl: images[0],
      images: images.length > 0 ? images : undefined,
      edited,
    };
  });
  return { posts, liked: [...liked], mine };
}

export default function Feed() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const demo = !isSupabaseConfigured();
  const [items, setItems] = useState<Post[] | null>(demo ? mockPosts : null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'SAVED' | 'LIKED' | 'TAG'>(
    'ALL',
  );
  const FILTERS = [
    { key: 'ALL', label: 'All' },
    { key: 'SAVED', label: 'Saved' },
    { key: 'LIKED', label: 'Liked' },
    { key: 'TAG', label: 'Tag' },
  ] as const;
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [admin, setAdmin] = useState(demo);
  const [member, setMember] = useState(demo);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Post | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [shareFor, setShareFor] = useState<Post | null>(null);
  const [shareQuery, setShareQuery] = useState('');
  const [shareDms, setShareDms] = useState<ConversationListItem[] | null>(null);
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
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
        setMember(false);
        setScopeId(null);
        setSavedIds(new Set());
        setTaggedIds(new Set());
        return;
      }
      const [adminFlag, memberFlag] = await Promise.all([
        isCommunityAdmin(scoped).catch(() => false),
        isCommunityMember(scoped).catch(() => false),
      ]);
      setAdmin(adminFlag);
      setMember(memberFlag);
      setScopeId(scoped);
      // Saved posts render instantly; the network only runs when the copy is
      // stale or the user pulls to refresh.
      const { value } = await resolveWithCache(
        `feed:${scoped}`,
        () => fetchFeedFresh(scoped),
        { ttlMs: CACHE_TTL.feed, force },
      );
      if (!value) {
        setItems([]);
        return;
      }
      setItems(newestFirst(value.posts));
      setLikedIds(new Set(value.liked));
      setMineIds(new Set(value.mine));
      const ids = value.posts.map((p) => p.id);
      setSavedIds(await mySavedIds(ids).catch(() => new Set<string>()));
      setTaggedIds(await myTaggedPostIds().catch(() => new Set<string>()));
    },
    [demo, selectedId],
  );

  useEffect(() => {
    load(false);
  }, [load]);
  // Home reloads every time it regains focus (cache-first, so a fresh copy
  // costs zero requests): new posts are always on top when the user
  // scrolls up, with no manual refresh needed.
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  async function onRefresh() {
    if (demo) return;
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }

  function bumpCount(current: string, delta: 1 | -1): string {
    const n = Number(current);
    if (!Number.isFinite(n)) return current;
    return String(Math.max(0, n + delta));
  }

  async function handleShare(item: Post) {
    try {
      await Share.share({
        message: `${item.text}\n\n— ${item.author} via Ophixe`,
      });
    } catch {
      // user dismissed the share sheet
    }
  }

  function handleCopy(item: Post) {
    Clipboard.setStringAsync(
      item.title ? `${item.title}\n\n${item.text}` : item.text,
    ).catch(() => {});
  }

  function confirmDeletePost(item: Post) {
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(item.id);
            setItems((prev) => (prev ?? []).filter((p) => p.id !== item.id));
            if (scopeId) invalidateCache(`feed:${scopeId}`).catch(() => {});
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  }

  function handleReportPost(item: Post) {
    if (!scopeId) return;
    Alert.alert('Report post?', 'Your admins will review it.', [
      { text: 'Cancel', style: 'cancel' },
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportContent({ postId: item.id }, scopeId, reason);
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

  async function handleToggleSave(item: Post) {
    setMenuFor(null);
    setMenuPos(null);
    if (demo) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      return;
    }
    try {
      const saved = await toggleSave(item.id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    }
  }

  function openShareSheet(item: Post) {
    setMenuFor(null);
    setMenuPos(null);
    setShareFor(item);
    setShareQuery('');
    setShareError(null);
    setShareDms(null);
    if (demo) {
      setShareDms([]);
      return;
    }
    listConversations()
      .then((all) => setShareDms(all.filter((it) => !it.is_group)))
      .catch(() =>
        setShareError('Could not load your chats. Please try again.'),
      );
  }

  async function handleShareToChat(item: Post, dm: ConversationListItem) {
    if (shareBusy) return;
    setShareBusy(dm.id);
    setShareError(null);
    try {
      const published = await ensureKeyPublished()
        .then(() => true)
        .catch(() => false);
      if (!published) {
        const hasLocal = await getMyKeypair()
          .then(() => true)
          .catch(() => false);
        if (!hasLocal) {
          setShareError('Could not set up encryption on this device.');
          return;
        }
      }
      const peer = await getDmPeerInfo(dm.id);
      if (peer.isGroup || !peer.peerKey) {
        setShareError(
          `${dm.title} hasn't finished setting up chat yet. Ask them to open the app once, then try again.`,
        );
        return;
      }
      const body = (
        `Shared from Home:\n\n${item.title ? `${item.title}\n\n` : ''}${item.text}`
      ).slice(0, 4000);
      const payload = await encryptForPeer(body, peer.peerKey).catch(() => null);
      if (!payload) {
        setShareError('Could not encrypt. Post not sent.');
        return;
      }
      await sendMessage(dm.id, payload);
      setShareFor(null);
      Alert.alert('Sent', `Shared to your chat with ${dm.title}.`, [
        { text: 'Stay here', style: 'cancel' },
        {
          text: 'Open chat',
          onPress: () =>
            router.push({ pathname: '/chat/[id]', params: { id: dm.id } }),
        },
      ]);
    } catch (err) {
      setShareError(
        isRlsError(err)
          ? "This post couldn't be delivered."
          : err instanceof Error
            ? err.message
            : 'Could not send.',
      );
    } finally {
      setShareBusy(null);
    }
  }

  function menuItems(item: Post): DropdownItem[] {
    if (demo || (!admin && !mineIds.has(item.id))) {
      return [
        { label: 'Copy', icon: 'copy-outline', onPress: () => handleCopy(item) },
        {
          label: 'Share',
          icon: 'share-social-outline',
          onPress: () => handleShare(item),
        },
        {
          label: 'Send to chat',
          icon: 'chatbubble-ellipses-outline',
          onPress: () => openShareSheet(item),
        },
        {
          label: savedIds.has(item.id) ? 'Unsave' : 'Save post',
          icon: 'bookmark-outline',
          onPress: () => handleToggleSave(item),
        },
        ...(demo
          ? []
          : [
              {
                label: 'Report',
                icon: 'flag-outline' as const,
                onPress: () => handleReportPost(item),
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
            pathname: '/post/edit' as never,
            params: { id: item.id },
          }),
      },
      {
        label: 'Delete',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => confirmDeletePost(item),
      },
      { label: 'Copy', icon: 'copy-outline', onPress: () => handleCopy(item) },
      {
        label: 'Share',
        icon: 'share-social-outline',
        onPress: () => handleShare(item),
      },
      {
        label: 'Send to chat',
        icon: 'chatbubble-ellipses-outline',
        onPress: () => openShareSheet(item),
      },
      {
        label: savedIds.has(item.id) ? 'Unsave' : 'Save post',
        icon: 'bookmark-outline',
        onPress: () => handleToggleSave(item),
      },
    ];
  }

  function openPostMenu(item: Post) {
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

  async function handleComment(item: Post) {
    const body = (drafts[item.id] ?? '').trim();
    if (!body || commentingId) return;
    if (demo) {
      setDrafts((prev) => ({ ...prev, [item.id]: '' }));
      setItems((prev) =>
        (prev ?? []).map((p) =>
          p.id === item.id ? { ...p, comments: bumpCount(p.comments, 1) } : p,
        ),
      );
      return;
    }
    setCommentingId(item.id);
    try {
      // Offline: the comment queues and the count still bumps immediately.
      await runOrQueue('comment', { postId: item.id, body }, () =>
        addComment(item.id, body).then(() => {}),
      );
      setDrafts((prev) => ({ ...prev, [item.id]: '' }));
      setItems((prev) =>
        (prev ?? []).map((p) =>
          p.id === item.id ? { ...p, comments: bumpCount(p.comments, 1) } : p,
        ),
      );
    } catch {
      // keep the draft on failure
    } finally {
      setCommentingId(null);
    }
  }

  async function handleToggle(item: Post) {
    if (busyId) return;
    if (demo) {
      const liked = !likedIds.has(item.id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
      setItems((prev) =>
        (prev ?? []).map((p) =>
          p.id === item.id
            ? { ...p, likes: bumpCount(p.likes, liked ? 1 : -1) }
            : p,
        ),
      );
      return;
    }
    setBusyId(item.id);
    const want = !likedIds.has(item.id);
    try {
      const res = await runOrQueue(
        'like-set',
        { postId: item.id, liked: want },
        async () => {
          const r = await toggleLike(item.id);
          setLikedIds((prev) => {
            const next = new Set(prev);
            if (r.liked) next.add(item.id);
            else next.delete(item.id);
            return next;
          });
          setItems((prev) =>
            (prev ?? []).map((p) =>
              p.id === item.id ? { ...p, likes: String(r.count) } : p,
            ),
          );
        },
      );
      if (res.queued) {
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (want) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
        setItems((prev) =>
          (prev ?? []).map((p) =>
            p.id === item.id
              ? { ...p, likes: bumpCount(p.likes, want ? 1 : -1) }
              : p,
          ),
        );
      }
    } catch {
      // keep previous state on failure
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search posts"
          />
        </View>
        {member ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/post/new',
                params: selectedId ? { communityId: selectedId } : {},
              })
            }
            hitSlop={8}
            accessibilityLabel="Create post"
          >
            <Ionicons
              name="create-outline"
              size={22}
              color={c.ink}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chips}>
        <Ionicons name="funnel-outline" size={18} color={c.subtext} />
        {FILTERS.map((f) => (
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
          (p) =>
            (filter === 'ALL' ||
              (filter === 'SAVED' && savedIds.has(p.id)) ||
              (filter === 'LIKED' && likedIds.has(p.id)) ||
              (filter === 'TAG' && taggedIds.has(p.id))) &&
            (!query.trim() ||
              p.text.toLowerCase().includes(query.trim().toLowerCase()) ||
              p.author.toLowerCase().includes(query.trim().toLowerCase()) ||
              (p.title ?? '').toLowerCase().includes(query.trim().toLowerCase())),
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
            <View style={styles.skeletonList}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.card}>
                  <View style={styles.authorRow}>
                    <Skeleton
                      width={44}
                      height={44}
                      style={{ borderRadius: 22 }}
                    />
                    <View style={styles.skeletonAuthor}>
                      <Skeleton width="60%" height={14} />
                      <Skeleton width="40%" height={12} />
                    </View>
                  </View>
                  <Skeleton height={14} style={styles.skeletonLine} />
                  <Skeleton width="80%" height={14} style={styles.skeletonLine} />
                </View>
              ))}
            </View>
          ) : !selectedId ? (
            <EmptyState
              icon="people-outline"
              title="No community yet"
              body="Join your company community to see posts here."
              actionTitle="Discover communities"
              onAction={() => router.push('/community/discover')}
            />
          ) : query.trim() || filter !== 'ALL' ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              body="Try a different search or filter."
            />
          ) : member ? (
            <EmptyState
              icon="create-outline"
              title="No posts yet"
              body="Be the first to share something with your community."
              actionTitle="Create a post"
              onAction={() =>
                router.push({
                  pathname: '/post/new',
                  params: selectedId ? { communityId: selectedId } : {},
                })
              }
            />
          ) : (
            <EmptyState
              icon="newspaper-outline"
              title="No posts yet"
              body="When your community shares something, it will show up here."
            />
          )
        }
        renderItem={({ item }) => {
          const photos =
            (item.images ?? []).length > 0
              ? (item.images ?? [])
              : item.imageUrl
                ? [item.imageUrl]
                : [];
          const openDetail = () =>
            router.push({ pathname: '/post/[id]', params: { id: item.id } });
          return (
            <View style={styles.card}>
              <View style={styles.authorRow}>
                {item.authorAvatar ? (
                  <Image source={{ uri: item.authorAvatar }} style={styles.avatarPhoto} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.author.slice(0, 1)}</Text>
                  </View>
                )}
                <Text style={styles.authorMid} numberOfLines={2}>
                  <Text style={styles.author}>{item.author} </Text>
                  <Text style={styles.handleInline}>{item.handle}</Text>
                </Text>
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
                  onPress={() => openPostMenu(item)}
                  hitSlop={12}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={18}
                    color={c.subtext}
                  />
                </Pressable>
              </View>
              {item.title ? (
                <Text style={styles.postTitle}>{item.title}</Text>
              ) : null}
              <Text style={styles.text}>{item.text}</Text>
              {photos.length > 0 ? (
                <PhotoCarousel uris={photos} />
              ) : item.color ? (
                <View style={[styles.photo, { backgroundColor: item.color }]} />
              ) : null}
              <View style={styles.stats}>
                <LikeButton
                  liked={likedIds.has(item.id)}
                  count={item.likes}
                  busy={busyId === item.id}
                  onToggle={() => handleToggle(item)}
                />
                <Pressable
                  style={styles.stat}
                  hitSlop={8}
                  onPress={() => handleShare(item)}
                >
                  <Ionicons name="repeat" size={20} color={c.ink} />
                  <Text style={styles.statText}>{item.reposts}</Text>
                </Pressable>
                <Pressable
                  style={styles.stat}
                  hitSlop={8}
                  onPress={openDetail}
                >
                  <Ionicons name="chatbubble" size={20} color={c.ink} />
                  <Text style={styles.statText}>{item.comments}</Text>
                </Pressable>
                <Pressable
                  style={styles.stat}
                  hitSlop={8}
                  onPress={() => handleShare(item)}
                >
                  <Ionicons name="share-social" size={20} color={c.ink} />
                  <Text style={styles.statText}>{item.shares}</Text>
                </Pressable>
              </View>
              <View style={styles.commentBox}>
                <TextInput
                  placeholder="Write a comment…"
                  placeholderTextColor={c.subtext}
                  style={styles.commentInput}
                  value={drafts[item.id] ?? ''}
                  onChangeText={(text) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: text }))
                  }
                  onSubmitEditing={() => handleComment(item)}
                />
                <Pressable
                  onPress={() => handleComment(item)}
                  hitSlop={8}
                  disabled={commentingId === item.id}
                >
                  <Ionicons
                    name="send"
                    size={20}
                    color={
                      (drafts[item.id] ?? '').trim()
                        ? c.primary
                        : c.subtext
                    }
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      <DropdownMenu
        visible={menuFor !== null}
        position={menuPos}
        items={menuFor ? menuItems(menuFor) : []}
        onClose={() => {
          setMenuFor(null);
          setMenuPos(null);
        }}
      />
      <Modal
        visible={shareFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShareFor(null)}
      >
        <View style={styles.shareOverlay}>
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Send to private chat</Text>
            <Text style={styles.shareSub} numberOfLines={2}>
              {shareFor?.title ? `${shareFor.title} — ` : ''}
              {shareFor?.text ?? ''}
            </Text>
            <SearchField
              value={shareQuery}
              onChange={setShareQuery}
              placeholder="Search chats"
            />
            {shareError ? (
              <Text style={styles.shareError}>{shareError}</Text>
            ) : null}
            {shareDms === null ? (
              <ActivityIndicator
                style={styles.shareLoader}
                color={c.ink}
              />
            ) : (
              <FlatList
                data={shareDms.filter(
                  (it) =>
                    !shareQuery.trim() ||
                    it.title.toLowerCase().includes(shareQuery.trim().toLowerCase()),
                )}
                keyExtractor={(it) => it.id}
                style={styles.shareList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.shareEmpty}>
                    {demo
                      ? 'Connect Supabase to share posts into chats.'
                      : 'No private chats yet. Start one from the Chat tab.'}
                  </Text>
                }
                renderItem={({ item: dm }) => (
                  <Pressable
                    style={styles.shareRow}
                    disabled={shareBusy !== null}
                    onPress={() => shareFor && handleShareToChat(shareFor, dm)}
                  >
                    <View style={styles.shareAvatar}>
                      <Text style={styles.shareAvatarText}>
                        {(dm.title.trim().slice(0, 1) || '•').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.shareName} numberOfLines={1}>
                      {dm.title}
                    </Text>
                    {shareBusy === dm.id ? (
                      <ActivityIndicator size="small" color={c.ink} />
                    ) : (
                      <Ionicons
                        name="send-outline"
                        size={20}
                        color={c.subtext}
                      />
                    )}
                  </Pressable>
                )}
              />
            )}
            <Pressable
              style={styles.shareCancel}
              onPress={() => setShareFor(null)}
            >
              <Text style={styles.shareCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  searchBox: {
    flex: 1,
    backgroundColor: c.paper,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    height: 40,
    fontSize: 15,
    color: c.text,
    textAlign: 'center',
  },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  card: {
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 14,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '800', color: c.ink },
  avatarPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
  },
  authorMid: { flex: 1 },
  author: { fontFamily: fonts.headingSemi, fontSize: 15, color: c.text },
  handle: { fontSize: 12, color: c.subtext, fontStyle: 'italic' },
  handleInline: { fontSize: 13, color: c.subtext },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  gridCell: { width: '31.5%', aspectRatio: 1 },
  gridPhoto: { width: '100%', height: '100%', borderRadius: radius.m },
  commentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.m,
    paddingHorizontal: 12,
  },
  commentInput: { flex: 1, height: 42, fontSize: 14, color: c.text },
  postTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: c.text,
    marginTop: 10,
  },
  text: { fontSize: 14, color: c.text, marginTop: 10, lineHeight: 20 },
  photo: { height: 220, borderRadius: radius.m, marginTop: 10 },
  postPhoto: { height: 220, borderRadius: radius.m, marginTop: 10 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 12, color: c.subtext, fontWeight: '600' },
  skeletonAuthor: { flex: 1, gap: 6 },
  skeletonLine: { marginTop: 10 },
  skeletonList: { gap: 12 },
  loader: { marginTop: 40 },
  empty: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  shareSheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    padding: 20,
    maxHeight: '80%',
  },
  shareTitle: { fontSize: 17, fontWeight: '800', color: c.text },
  shareSub: { fontSize: 13, color: c.subtext, marginTop: 4, marginBottom: 12 },
  shareError: { fontSize: 13, color: c.danger, marginTop: 8 },
  shareLoader: { marginVertical: 24 },
  shareList: { marginTop: 8, maxHeight: 320 },
  shareEmpty: {
    fontSize: 13,
    color: c.subtext,
    textAlign: 'center',
    marginVertical: 24,
    lineHeight: 20,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  shareAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAvatarText: { fontSize: 15, fontWeight: '800', color: c.ink },
  shareName: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
  shareCancel: { alignItems: 'center', paddingVertical: 12 },
  shareCancelText: { fontSize: 14, fontWeight: '700', color: c.subtext },
});
}
