import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DropdownMenu, type DropdownItem } from '../../components/DropdownMenu';
import { LikeButton } from '../../components/LikeButton';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import {
  PostFiles,
  PostVideos,
  type PostFile,
} from '../../components/PostAttachments';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OfflineBanner } from '../../components/OfflineBanner';
import { ErrorText } from '../../components/ui';
import { fonts, radius, type ThemeColors } from '../../constants/theme';
import {
  CACHE_TTL,
  invalidateCache,
  isOnline,
  resolveWithCache,
} from '../../lib/net';
import { useColors } from '../../lib/theme';
import { Alert } from 'react-native';
import {
  deletePost,
  isEdited,
  reportContent,
} from '../../lib/content';
import {
  addComment,
  deleteComment,
  editComment,
  listComments,
  myLikedIds,
  reportComment,
  toggleLike,
  type PostComment,
} from '../../lib/engagement';
import {
  isCommunityAdmin,
  listCommunityMembers,
} from '../../lib/communityContent';
import {
  createMentions,
  resolveMentions,
} from '../../lib/mentions';
import { timeAgo } from '../../lib/format';
import { useAndroidKeyboardPad } from '../../lib/keyboard';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { publicUrl } from '../../lib/uploads';

type Detail = {
  id: string;
  title: string | null;
  author: string;
  community: string;
  communityId: string;
  time: string;
  text: string;
  likes: string;
  comments: string;
  images: string[];
  videos: string[];
  files: PostFile[];
  mine: boolean;
  edited: boolean;
};

const REPORT_REASONS = ['Spam', 'Harassment', 'Misinformation', 'Other'];

export default function PostDetail() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const demo = !isSupabaseConfigured();
  const insets = useSafeAreaInsets();
  const kbPad = useAndroidKeyboardPad();
  const [post, setPost] = useState<Detail | null>(null);
  const [liked, setLiked] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError('Post not found.');
      return;
    }
    if (demo) return;
    try {
      const FULL_SELECT =
        'id,title,text,image_url,likes_count,comments_count,created_at,updated_at,community_id,author_id,author:profiles!posts_author_id_fkey(full_name),community:communities!posts_community_id_fkey(name)';
      const LEGACY_SELECT =
        'id,text,image_url,likes_count,comments_count,created_at,community_id,author:profiles!posts_author_id_fkey(full_name),community:communities!posts_community_id_fkey(name)';
      type Row = {
        id: string;
        title?: string | null;
        text: string;
        image_url: string | null;
        likes_count: number;
        comments_count: number;
        created_at: string;
        updated_at?: string | null;
        community_id: string;
        author_id?: string | null;
        author: { full_name: string | null } | null;
        community: { name: string } | null;
      };
      const bundle = (
        await resolveWithCache(
          `post:${id}`,
          async () => {
            let res = await supabase
              .from('posts')
              .select(FULL_SELECT)
              .eq('id', id)
              .single();
            if (
              res.error &&
              /column|schema cache/i.test(String(res.error.message ?? ''))
            ) {
              res = await supabase
                .from('posts')
                .select(LEGACY_SELECT)
                .eq('id', id)
                .single();
            }
            const { data, error } = res;
            if (error || !data) {
              // Genuinely gone (not a network blip): drop any saved copy
              // so a deleted post never resurrects from cache.
              await invalidateCache(`post:${id}`).catch(() => {});
              throw new Error('Post not found.');
            }
            const row = data as unknown as Row;
            const postId = String(row.id);
            const [mediaRes, likedIds, commentList, adminFlag, auth] =
              await Promise.all([
                (async () => {
                  const full = await supabase
                    .from('post_media')
                    .select('path,kind,file_name,file_size')
                    .eq('post_id', postId)
                    .order('position', { ascending: true });
                  if (!full.error && full.data) return full.data;
                  // Stale backend without the kind columns.
                  const legacy = await supabase
                    .from('post_media')
                    .select('path')
                    .eq('post_id', postId)
                    .order('position', { ascending: true });
                  return legacy.data ?? [];
                })(),
                myLikedIds([postId]),
                listComments(postId),
                isCommunityAdmin(String(row.community_id)).catch(() => false),
                supabase.auth.getUser(),
              ]);
            type MediaItem = {
              path: string;
              kind?: string | null;
              file_name?: string | null;
              file_size?: number | null;
            };
            const items = (mediaRes as unknown as MediaItem[]) ?? [];
            return {
              row,
              mediaItems: items.map((m) => ({
                path: String(m.path),
                kind: String(m.kind ?? 'image'),
                name: m.file_name
                  ? String(m.file_name)
                  : String(m.path).split('/').pop() ?? 'file',
                size: typeof m.file_size === 'number' ? m.file_size : 0,
              })),
              // Legacy cache shape: plain paths from older saves.
              mediaPaths: items.map((m) => String(m.path)),
              liked: likedIds.has(postId),
              comments: commentList,
              admin: adminFlag,
              myId: auth.data.user?.id ?? null,
            };
          },
          { ttlMs: CACHE_TTL.feed },
        )
      ).value;
      if (!bundle) {
        setError(
          isOnline()
            ? 'Post not found.'
            : 'You are offline. Open this post once online to save it.',
        );
        return;
      }
      const { row, liked, comments, admin, myId } = bundle;
      const saved = bundle as unknown as {
        mediaItems?: { path: string; kind: string; name: string; size: number }[];
        mediaPaths?: string[];
      };
      // Older saves only stored plain paths: treat them as pictures.
      const mediaItems =
        saved.mediaItems ??
        (saved.mediaPaths ?? []).map((path) => ({
          path,
          kind: 'image',
          name: 'photo',
          size: 0,
        }));
      const toUrl = (p: string) => publicUrl('post-media', p);
      const extraImages = mediaItems
        .filter((m) => m.kind !== 'video' && m.kind !== 'file')
        .map((m) => toUrl(m.path));
      const images =
        extraImages.length > 0
          ? extraImages
          : mediaItems.length === 0 && row.image_url
            ? [toUrl(String(row.image_url))]
            : [];
      const videos = mediaItems
        .filter((m) => m.kind === 'video')
        .map((m) => toUrl(m.path));
      const files: PostFile[] = mediaItems
        .filter((m) => m.kind === 'file')
        .map((m) => ({
          uri: toUrl(m.path),
          name: m.name,
          size: m.size,
        }));
      const communityId = String(row.community_id);
      setAdmin(admin);
      setPost({
        id: String(row.id),
        title: row.title ? String(row.title) : null,
        author: (row.author?.full_name ?? 'Staff Member').toUpperCase(),
        community: row.community?.name ?? 'Community',
        communityId,
        time: timeAgo(String(row.created_at)),
        text: String(row.text),
        likes: String(row.likes_count),
        comments: String(row.comments_count),
        images,
        videos,
        files,
        mine: !!myId && row.author_id === myId,
        edited: isEdited(String(row.created_at), row.updated_at),
      });
      setLiked(liked);
      setComments(comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    }
  }, [id, demo]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleToggle() {
    if (!post || busy) return;
    setBusy(true);
    try {
      const res = await toggleLike(post.id);
      setLiked(res.liked);
      setPost({ ...post, likes: String(res.count) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not like.');
    } finally {
      setBusy(false);
    }
  }

  async function handleComment() {
    if (!post || !text.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const body = text.trim();
      const commentId = await addComment(post.id, body);
      setText('');
      setComments(await listComments(post.id));
      setPost({
        ...post,
        comments: String(Number(post.comments) + 1),
      });
      const page = await listCommunityMembers(post.communityId, {
        limit: 200,
      }).catch(() => ({ members: [], hasMore: false }));
      const userIds = resolveMentions(
        body,
        page.members.map((m) => ({ userId: m.userId, name: m.name })),
        null,
      );
      await createMentions({
        userIds,
        communityId: post.communityId,
        postId: post.id,
        commentId,
      }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not comment.');
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSave(item: PostComment) {
    if (!post || busy) return;
    setError(null);
    setBusy(true);
    try {
      await editComment(item.id, editText);
      setEditingId(null);
      setEditText('');
      setComments(await listComments(post.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteComment(item: PostComment) {
    if (!post) return;
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setBusy(true);
          try {
            await deleteComment(item.id);
            setComments(await listComments(post.id));
            setPost({
              ...post,
              comments: String(Math.max(0, Number(post.comments) - 1)),
            });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Could not delete.',
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function handleReport(item: PostComment) {
    if (!post) return;
    Alert.alert('Report comment?', 'Your admins will review it.', [
      { text: 'Cancel', style: 'cancel' },
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          setError(null);
          try {
            await reportComment(post.id, item.id, post.communityId, reason);
            Alert.alert('Reported', 'Thanks — the admins have been notified.');
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Could not report.',
            );
          }
        },
      })),
    ]);
  }

  function handleSharePost() {
    if (!post) return;
    Share.share({
      message: `${post.text}\n\n— ${post.author} via Ophixe`,
    }).catch(() => {});
  }

  function handleCopyPost() {
    if (!post) return;
    Clipboard.setStringAsync(
      post.title ? `${post.title}\n\n${post.text}` : post.text,
    ).catch(() => {});
  }

  function confirmDeletePost() {
    if (!post) return;
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            router.replace('/feed');
          } catch {
            setError('Could not delete.');
          }
        },
      },
    ]);
  }

  function handleReportPost() {
    if (!post) return;
    Alert.alert('Report post?', 'Your admins will review it.', [
      { text: 'Cancel', style: 'cancel' },
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportContent({ postId: post.id }, post.communityId, reason);
            Alert.alert('Reported', 'Thanks — the admins have been notified.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not report.');
          }
        },
      })),
    ]);
  }

  function menuItems(): DropdownItem[] {
    if (!post) return [];
    if (admin || post.mine) {
      return [
        {
          label: 'Edit',
          icon: 'pencil-outline',
          onPress: () =>
            router.push({
              pathname: '/post/edit' as never,
              params: { id: post.id },
            }),
        },
        {
          label: 'Delete',
          icon: 'trash-outline',
          destructive: true,
          onPress: confirmDeletePost,
        },
        { label: 'Copy', icon: 'copy-outline', onPress: handleCopyPost },
        {
          label: 'Share',
          icon: 'share-social-outline',
          onPress: handleSharePost,
        },
      ];
    }
    return [
      { label: 'Copy', icon: 'copy-outline', onPress: handleCopyPost },
      {
        label: 'Share',
        icon: 'share-social-outline',
        onPress: handleSharePost,
      },
      { label: 'Report', icon: 'flag-outline', onPress: handleReportPost },
    ];
  }

  return (
    <>
      <ScreenHeader
        title="POST"
        action={post ? { label: '•••', onPress: () => setMenuOpen(true) } : null}
      />
      <OfflineBanner />
      <DropdownMenu
        visible={menuOpen}
        position={{ top: insets.top + 70, right: 12 }}
        items={menuItems()}
        onClose={() => setMenuOpen(false)}
      />
      <KeyboardAvoidingView
        style={styles.page}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 54}
      >
        {error && !post ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {demo ? (
          <Text style={styles.notice}>Connect Supabase to view posts.</Text>
        ) : !post ? (
          <>
            <ActivityIndicator style={styles.loader} color={c.ink} />
            <ErrorText message={error} />
          </>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.card}>
                <Text style={styles.author}>{post.author}</Text>
                <Text style={styles.handle}>
                  {post.community} • {post.time}
                  {post.edited ? ' • edited' : ''}
                </Text>
                {post.title ? (
                  <Text style={styles.postTitle}>{post.title}</Text>
                ) : null}
                <Text style={styles.text}>{post.text}</Text>
                {post.images.length > 0 ? (
                  <PhotoCarousel uris={post.images} />
                ) : null}
                <PostVideos uris={post.videos} />
                <PostFiles files={post.files} />
                <View style={styles.stats}>
                  <LikeButton
                    liked={liked}
                    count={post.likes}
                    busy={busy}
                    onToggle={handleToggle}
                  />
                  <View style={styles.stat}>
                    <Ionicons
                      name="chatbubble"
                      size={20}
                      color={c.ink}
                    />
                    <Text style={styles.statText}>{post.comments}</Text>
                  </View>
                </View>
                <Text style={styles.commentsTitle}>
                  COMMENTS ({comments.length})
                </Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.notice}>
                No comments yet. Start the conversation below.
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.comment}>
                <Text style={styles.commentAuthor}>
                  {item.authorName}
                  {item.mine ? ' (you)' : ''} • {timeAgo(item.created_at)}
                </Text>
                {editingId === item.id ? (
                  <View>
                    <TextInput
                      style={styles.editInput}
                      value={editText}
                      onChangeText={setEditText}
                      multiline
                    />
                    <View style={styles.commentActions}>
                      <Pressable
                        hitSlop={8}
                        onPress={() => handleEditSave(item)}
                        disabled={busy}
                      >
                        <Text style={styles.actionSave}>SAVE</Text>
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          setEditingId(null);
                          setEditText('');
                        }}
                      >
                        <Text style={styles.actionMuted}>CANCEL</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.commentBody}>{item.body}</Text>
                    <View style={styles.commentActions}>
                      {item.mine ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            setEditingId(item.id);
                            setEditText(item.body);
                          }}
                        >
                          <Text style={styles.actionMuted}>EDIT</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          hitSlop={8}
                          onPress={() => handleReport(item)}
                        >
                          <Text style={styles.actionMuted}>REPORT</Text>
                        </Pressable>
                      )}
                      {item.mine || admin ? (
                        <Pressable
                          hitSlop={8}
                          onPress={() => confirmDeleteComment(item)}
                        >
                          <Text style={styles.actionDanger}>DELETE</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
            )}
          />
        )}
        {!demo && post && (
          <SafeAreaView
            edges={['bottom']}
            style={[styles.composerSafe, kbPad > 0 && { paddingBottom: kbPad }]}
          >
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="Write a comment…"
                placeholderTextColor={c.subtext}
                value={text}
                onChangeText={setText}
                multiline
              />
              <Pressable
                style={styles.send}
                onPress={handleComment}
                disabled={busy || !text.trim()}
              >
                <Ionicons
                  name="send"
                  size={20}
                  color={text.trim() ? c.paper : c.subtext}
                />
              </Pressable>
            </View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.bg },
  loader: { marginTop: 40 },
  errorBar: {
    backgroundColor: '#FDECEC',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 13,
    color: c.danger,
    textAlign: 'center',
    lineHeight: 18,
  },
  notice: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 14,
  },
  author: { fontFamily: fonts.headingSemi, fontSize: 15, color: c.text },
  handle: { fontSize: 12, color: c.subtext, fontStyle: 'italic', marginTop: 2 },
  postTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 17,
    color: c.text,
    marginTop: 8,
  },
  text: { fontSize: 15, color: c.text, marginTop: 10, lineHeight: 22 },
  stats: { flexDirection: 'row', gap: 20, marginTop: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 12, color: c.subtext, fontWeight: '600' },
  commentsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: c.subtext,
    letterSpacing: 1,
    marginTop: 16,
  },
  comment: {
    backgroundColor: c.paper,
    borderRadius: radius.m,
    padding: 12,
  },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: c.text },
  commentBody: { fontSize: 14, color: c.text, marginTop: 4, lineHeight: 20 },
  commentActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  actionMuted: { fontSize: 11, fontWeight: '800', color: c.subtext },
  actionSave: { fontSize: 11, fontWeight: '800', color: c.primary },
  actionDanger: { fontSize: 11, fontWeight: '800', color: c.danger },
  editInput: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: c.text,
    marginTop: 6,
  },
  composerSafe: { backgroundColor: c.paper },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.paper,
  },
  input: {
    flex: 1,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
    maxHeight: 110,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}
