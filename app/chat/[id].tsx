import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudioBubble } from '../../components/AudioBubble';
import { MediaBubble } from '../../components/MediaBubble';
import { OfflineBanner } from '../../components/OfflineBanner';
import { AdminTag, Avatar } from '../../components/premium';
import { ScreenHeader } from '../../components/ScreenHeader';
import { publicUrl } from '../../lib/uploads';
import { VoiceBubble } from '../../components/VoiceBubble';
import { radius, type ThemeColors } from '../../constants/theme';
import { useColors, useTheme } from '../../lib/theme';
import {
  getActiveCall,
  startCallSignal,
  subscribeToCallSignals,
  type CallMedia,
  type CallSignal,
} from '../../lib/calls';
import {
  addGroupMembers,
  backfillOwnEnvelopes,
  deleteGroupChat,
  deleteMessage,
  editGroupMessage,
  editMessage,
  getConversationTitle,
  getDmPeerInfo,
  getGroupAdminIds,
  getGroupProfile,
  setConversationMuted,
  getGroupMemberKeys,
  getMessageBodies,
  getMessages,
  getMessagesBefore,
  getMyEnvelopes,
  getReadStates,
  leaveGroupChat,
  listConversations,
  listReactions,
  markRead,
  missedCallDisplay,
  callLabelTone,
  sendGroupMessage,
  sendMessage,
  subscribeToMessages,
  subscribeToReadStates,
  toggleReaction,
  type ConversationListItem,
  type GroupMemberKey,
  type Message,
  type Reaction,
  type ReadState,
} from '../../lib/chat';
import {
  getPeerLastSeen,
  statusText,
  subscribeToLastSeen,
} from '../../lib/presence';
import {
  isCommunityAdmin,
  listCommunityMembers,
  type MemberEntry,
} from '../../lib/communityContent';
import { REPORT_REASONS } from '../../lib/content';
import {
  MAX_CHAT_FILE_BYTES,
  copyCipherBytes,
  friendlyMediaError,
  kindForMime,
  mediaDescriptor,
  mediaLabel,
  parseMediaDescriptor,
  sealMediaFile,
  uploadMediaFile,
} from '../../lib/media';
import {
  giphyKey,
  searchGifs,
  trendingGifs,
  type GifResult,
} from '../../lib/gifs';
import {
  parseStickerDescriptor,
  stickerDescriptor,
  stickerLabel,
  stickerSource,
  STICKERS,
} from '../../lib/stickers';
import {
  builtinSource,
  defaultWallpaperColor,
  DEFAULT_WALLPAPER,
  getWallpaper,
  type Wallpaper,
} from '../../lib/wallpaper';
import {
  decryptFromPeer,
  encryptForGroup,
  encryptForPeer,
  ensureKeyPublished,
  getMyKeypair,
  parseEnvelope,
  setupEncryption,
} from '../../lib/e2ee';
import { timeAgo } from '../../lib/format';
import {
  useAndroidKeyboardPad,
  useKeyboardVisible,
} from '../../lib/keyboard';
import { createMentions, resolveMentions } from '../../lib/mentions';
import {
  CACHE_TTL,
  getPendingCount,
  isNetworkError,
  readCache,
  resolveWithCache,
  runOrQueue,
  subscribeQueue,
  withTimeout,
  writeCache,
} from '../../lib/net';
import { ensureMediaLibrary } from '../../lib/permissions';
import {
  isRlsError,
  isSupabaseConfigured,
  supabase,
} from '../../lib/supabase';
import {
  blockUser,
  getDisappearSeconds,
  isBlockedByMe,
  reportUser,
  setDisappearSeconds,
  unblockUser,
} from '../../lib/safety';
import { useRingtone } from '../../lib/ringtone';
import {
  ensureMicPermission,
  parseVoiceDescriptor,
  primeAudioMode,
  sealVoiceFile,
  uploadVoiceFile,
  voiceDescriptor,
  voiceLabel,
} from '../../lib/voice';

const MAX_MESSAGE = 4000;
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round(
    (startOf(now) - startOf(d)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  return d
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();
}

type Row =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'msg'; msg: Message; firstInGroup: boolean; lastInGroup: boolean };

/** WhatsApp-style swipe right on a bubble to reply to it. */
function Swipeable({
  onReply,
  children,
}: {
  onReply: () => void;
  children: ReactNode;
}) {
  const x = useRef(new Animated.Value(0)).current;
  // FlatList recycles row components: the responder below is created
  // once, so it must call through a ref to reach the CURRENT row.
  const replyRef = useRef(onReply);
  replyRef.current = onReply;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        x.setValue(Math.min(Math.max(g.dx, 0), 72));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 48) replyRef.current();
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;
  return (
    <Animated.View
      style={{ transform: [{ translateX: x }] }}
      {...pan.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

type MenuIcon = ComponentProps<typeof Ionicons>['name'];

/** Icon-led row for the DM/group/disappear sheets (no emoji). */
function MenuRow({
  icon,
  title,
  sub,
  danger,
  checked,
  onPress,
}: {
  icon: MenuIcon;
  title: string;
  sub?: string;
  danger?: boolean;
  checked?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.attachIcon}>
        <Ionicons name={icon} size={22} color={c.paper} />
      </View>
      <View style={styles.attachMid}>
        <Text style={[styles.attachName, danger && styles.menuDanger]}>
          {title}
        </Text>
        {sub ? <Text style={styles.attachSub}>{sub}</Text> : null}
      </View>
      <Ionicons
        name={checked ? 'checkmark-circle' : 'chevron-forward'}
        size={18}
        color={checked ? c.primary : c.subtext}
      />
    </Pressable>
  );
}

/** Paused first-frame preview of a picked video (user can play it). */
function PreviewVideo({ uri }: { uri: string }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={styles.previewVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

/**
 * Publishing our key needs the network, but sealing a message only needs the
 * on-device key — so an offline user with a working key can still queue.
 */
async function localKeyReady(
  setError: (message: string | null) => void,
): Promise<boolean> {
  const published = await ensureKeyPublished()
    .then(() => true)
    .catch(() => false);
  if (published) return true;
  const hasLocal = await getMyKeypair()
    .then(() => true)
    .catch(() => false);
  if (!hasLocal) {
    setError('Could not set up encryption on this device. Message not sent.');
    return false;
  }
  return true;
}

export default function Conversation() {
  const c = useColors();
  const { dark } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const demo = !isSupabaseConfigured();
  const insets = useSafeAreaInsets();
  const kbPad = useAndroidKeyboardPad();
  const kbOpen = useKeyboardVisible();
  const inputRef = useRef<TextInputInstance | null>(null);
  const [title, setTitle] = useState('Chat');
  const [items, setItems] = useState<Message[]>([]);
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [reads, setReads] = useState<ReadState[]>([]);
  const [quoted, setQuoted] = useState<
    Record<string, { body: string; senderName: string }>
  >({});
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [liveCall, setLiveCall] = useState<CallSignal | null>(null);
  const [silencedCall, setSilencedCall] = useState<string | null>(null);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [groupMenu, setGroupMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState<MemberEntry[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [wallpaper, setWallpaper] = useState<Wallpaper>({ type: 'default' });
  const [peerKey, setPeerKey] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingPick, setPendingPick] = useState<{
    uri: string;
    name: string;
    mime: string;
    seconds?: number;
  } | null>(null);
  const [caption, setCaption] = useState('');
  const [recentAssets, setRecentAssets] = useState<
    Awaited<ReturnType<typeof MediaLibrary.getAssetsAsync>>['assets']
  >([]);
  const [forwardFor, setForwardFor] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<
    ConversationListItem[] | null
  >(null);
  const [forwarding, setForwarding] = useState(false);
  const [funOpen, setFunOpen] = useState(false);
  const [funTab, setFunTab] = useState<'stickers' | 'gifs'>('stickers');
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<GifResult[] | null>(null);
  const [gifLoading, setGifLoading] = useState(false);
  const [dmMenu, setDmMenu] = useState(false);
  const [disappearOpen, setDisappearOpen] = useState(false);
  const [disappear, setDisappear] = useState<number | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [peerSeen, setPeerSeen] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchHitId, setSearchHitId] = useState<string | null>(null);
  const [jumpId, setJumpId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row> | null>(null);
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  });
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // A call someone else started rings until it is answered or ends.
  useRingtone(
    !demo &&
      !!liveCall &&
      liveCall.startedBy !== myId &&
      liveCall.id !== silencedCall,
  );

  useEffect(() => {
    if (!id || demo) return;
    let off: (() => void) | undefined;
    let offReads: (() => void) | undefined;
    let offCalls: (() => void) | undefined;
    let alive = true;
    (async () => {
      try {
        // getUser needs the network; the local session is the offline fallback.
        const userId = await supabase.auth
          .getUser()
          .then(({ data }) => data.user?.id ?? null)
          .catch(() =>
            supabase.auth
              .getSession()
              .then(({ data }) => data.session?.user?.id ?? null)
              .catch(() => null),
          );
        if (!alive) return;
        setMyId(userId);
        // Repair a missing own key (e.g. launch setup ran while offline).
        void setupEncryption();
        // Saved messages render instantly; title/peer/reads degrade
        // gracefully so a dead network never blanks an openable thread.
        const [name, peer, cached] = await Promise.all([
          getConversationTitle(id).catch(() => 'Chat'),
          getDmPeerInfo(id).catch(() => ({
            isGroup: true,
            peerId: null,
            peerKey: null,
          })),
          resolveWithCache<Message[]>(`messages:${id}`, () => getMessages(id), {
            ttlMs: CACHE_TTL.messages,
          }),
        ]);
        if (!alive) return;
        setTitle(name);
        setIsGroup(peer.isGroup);
        if (peer.peerId) {
          setPeerId(peer.peerId);
          setPeerAvatar(peer.peerAvatar ? publicUrl('avatars', peer.peerAvatar) : null);
          isBlockedByMe(peer.peerId)
            .then((b) => {
              if (alive) setBlockedByMe(b);
            })
            .catch(() => {});
        }
        getDisappearSeconds(id)
          .then((sec) => {
            if (alive) setDisappear(sec);
          })
          .catch(() => {});
        getGroupProfile(id)
          .then((info) => {
            if (alive && info) {
            setMuted(info.muted);
            setMemberCount(info.members.length);
          }
          })
          .catch(() => {});
        if (peer.peerKey) {
          setPeerKey(peer.peerKey);
          writeCache(`dm-key:${id}`, peer.peerKey).catch(() => {});
        } else if (!peer.isGroup) {
          // Offline DM: the last known peer key still opens history.
          const savedKey = await readCache<string>(`dm-key:${id}`);
          if (savedKey && alive) setPeerKey(savedKey.data);
        }
        const messages = cached.value ?? [];
        setItems(messages);
        // Saved plaintext renders instantly offline; entries are only reused
        // when the message was not edited after they were cached.
        const savedPlain = await readCache<Record<string, string>>(
          `plain:${id}`,
        );
        if (savedPlain && alive) {
          const reuse: Record<string, string> = {};
          for (const m of messages) {
            const hit = savedPlain.data[m.id];
            if (hit === undefined) continue;
            if (
              m.edited_at &&
              new Date(m.edited_at).getTime() > savedPlain.at
            ) {
              continue;
            }
            if (m.deleted_at) continue;
            reuse[m.id] = hit;
          }
          if (Object.keys(reuse).length > 0) setPlain(reuse);
        }
        if (messages.length < 50) setExhausted(true);
        if (cached.source === 'none') {
          setError('Could not load this chat.');
          return;
        }
        getReadStates(id)
          .then((states) => {
            if (alive) setReads(states);
          })
          .catch(() => {});
        runOrQueue('mark-read', { conversationId: id }, () =>
          markRead(id),
        ).catch(() => {});
        if (peer.isGroup && id) {
          // Heal my keyless-era messages for members with keys now.
          const threadId: string = id;
          const snapshot = messages;
          void (async () => {
            try {
              const key = `@ophixe:backfill:${threadId}`;
              const today = new Date().toISOString().slice(0, 10);
              if ((await AsyncStorage.getItem(key)) === today) return;
              await backfillOwnEnvelopes(threadId, snapshot);
              await AsyncStorage.setItem(key, today).catch(() => {});
            } catch {
              // Best-effort only.
            }
          })();
        }
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error ? err.message : 'Could not load this chat.',
          );
        }
        return;
      }
      off = subscribeToMessages(
        id,
        (m) => {
          setItems((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
          // A message arriving while the thread is open is read on sight.
          markRead(id).catch((err) => {
            if (isNetworkError(err)) {
              runOrQueue('mark-read', { conversationId: id }, () =>
                markRead(id),
              ).catch(() => {});
            }
          });
        },
        (m) => {
          // Edits and deletes stream in: swap the row and drop the stale
          // plaintext so the decrypt pass re-opens the new envelope.
          setPlain((prev) => {
            if (prev[m.id] === undefined) return prev;
            const next = { ...prev };
            delete next[m.id];
            return next;
          });
          setItems((prev) =>
            prev.map((x) => (x.id === m.id ? m : x)),
          );
        },
      );
      offReads = subscribeToReadStates(id, async () => {
        if (alive) setReads(await getReadStates(id));
      });
      getActiveCall(id)
        .then((signal) => {
          if (alive) {
           setLiveCall(signal);
           if (!signal) setSilencedCall(null);
         }
        })
        .catch(() => {});
      offCalls = subscribeToCallSignals(id, (signal) => {
        if (alive) setLiveCall(signal);
      });
      getGroupAdminIds(id)
        .then((ids) => {
          if (alive) setAdminIds(ids);
        })
        .catch(() => {});
    })();
    return () => {
      alive = false;
      off?.();
      offReads?.();
      offCalls?.();
    };
  }, [id, demo]);

  // Peer presence under the header name: initial fetch, live updates,
  // and a 30s safety poll in case realtime drops.
  useEffect(() => {
    if (!peerId || demo || isGroup) return;
    let alive = true;
    getPeerLastSeen(peerId)
      .then((v) => {
        if (alive) setPeerSeen(v);
      })
      .catch(() => {});
    const off = subscribeToLastSeen(peerId, (v) => {
      if (alive) setPeerSeen(v);
    });
    const timer = setInterval(() => {
      getPeerLastSeen(peerId)
        .then((v) => {
          if (alive) setPeerSeen(v);
        })
        .catch(() => {});
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
      off();
    };
  }, [peerId, demo, isGroup]);

  // Returning to an open thread (back navigation, tab switch) re-marks it
  // and picks up a changed wallpaper.
  useFocusEffect(
    useCallback(() => {
      getWallpaper()
        .then(setWallpaper)
        .catch(() => {});
      if (!id || demo) return;
      runOrQueue('mark-read', { conversationId: id }, () =>
        markRead(id),
      ).catch(() => {});
      // Returning clears a stale call banner: hanging up elsewhere (or a
      // missed realtime delete) revalidates against the live row.
      getActiveCall(id)
        .then((signal) => {
          setLiveCall(signal);
          if (!signal) setSilencedCall(null);
        })
        .catch(() => {});
    }, [id, demo]),
  );

  // Ringing quiets itself: rows older than ten minutes are dead (drop the
  // banner), and live ones stop sounding after a minute while staying
  // joinable underneath.
  useEffect(() => {
    if (!liveCall) {
      setSilencedCall(null);
      return;
    }
    const ageMs = Date.now() - new Date(liveCall.startedAt).getTime();
    if (ageMs > 10 * 60 * 1000) {
      setLiveCall(null);
      return;
    }
    const timer = setTimeout(
      () => setSilencedCall(liveCall.id),
      Math.max(0, 60000 - ageMs),
    );
    return () => clearTimeout(timer);
  }, [liveCall]);

  // Realtime DELETEs can drop on flaky networks: while a call banner
  // is live, re-check the row every 10s so a hung-up call clears
  // its banner instead of ringing on.
  useEffect(() => {
    if (!liveCall || !id || demo) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await getActiveCall(id).catch(() => liveCall);
        if (!fresh) {
          setLiveCall(null);
          setSilencedCall(null);
        }
      } catch {
        // A failed check keeps the banner; realtime owns it.
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [liveCall, id, demo]);

  // Write-through: whatever is on screen is what reopens offline —
  // encrypted rows plus the plaintext already opened on this device, so a
  // thread opened offline still reads instantly without refetching keys.
  useEffect(() => {
    if (!id || demo || items.length === 0) return;
    const timer = setTimeout(() => {
      writeCache(`messages:${id}`, items.slice(-50)).catch(() => {});
      const entries = Object.entries(plain).slice(-50);
      if (entries.length > 0) {
        writeCache(`plain:${id}`, Object.fromEntries(entries)).catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [items, plain, id, demo]);

  // Outbox drained while we have queued rows: swap the temp rows for the
  // real server rows so nothing shows twice.
  const pendingRef = useRef(false);
  pendingRef.current = pendingIds.size > 0;
  useEffect(() => {
    if (!id || demo) return;
    return subscribeQueue(() => {
      if (pendingRef.current && getPendingCount() === 0) {
        pendingRef.current = false;
        setPendingIds(new Set());
        getMessages(id)
          .then((fresh) => setItems(fresh))
          .catch(() => {});
      }
    });
  }, [id, demo]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    setRecSeconds(0);
    const timer = setInterval(() => {
      setRecSeconds(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    primeAudioMode().catch(() => {});
    return () => {
      recorderRef.current?.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isGroup) {
        if (!peerKey) return;
        const next: Record<string, string> = {};
        for (const m of items) {
          if (m.deleted_at) continue;
          if (plain[m.id] !== undefined) continue;
          const envelope = parseEnvelope(m.body);
          if (!envelope) continue;
          const decrypted = await decryptFromPeer(envelope, peerKey);
          next[m.id] = decrypted ?? '[This message could not be decrypted.]';
        }
        if (!cancelled && Object.keys(next).length > 0) {
          setPlain((prev) => ({ ...prev, ...next }));
        }
        return;
      }
      if (!id) return;
      const targets = items.filter(
        (m) => !m.deleted_at && plain[m.id] === undefined,
      );
      if (targets.length === 0) return;
      const [mine, envMap, keys] = await Promise.all([
        getMyKeypair(),
        getMyEnvelopes(targets.map((m) => m.id)),
        getGroupMemberKeys(id).catch((): never[] => []),
      ]);
      if (cancelled) return;
      const keyById = new Map(keys.map((k) => [k.userId, k.publicKey]));
      const next: Record<string, string> = {};
      for (const m of targets) {
        if (m.sender_id === myId) {
          const envelope = parseEnvelope(m.body);
          if (!envelope) {
            next[m.id] = m.body;
            continue;
          }
          const opened = await decryptFromPeer(envelope, mine.publicKey);
          next[m.id] = opened ?? '[This message could not be decrypted.]';
          continue;
        }
        const row = envMap[m.id];
        const senderKey = keyById.get(m.sender_id) ?? null;
        if (row && senderKey) {
          const envelope = parseEnvelope(row);
          const opened = envelope
            ? await decryptFromPeer(envelope, senderKey)
            : null;
          next[m.id] = opened ?? '[This message could not be decrypted.]';
        } else if (row && !senderKey) {
          // My envelope exists but the sender key is not visible yet;
          // leave undecided so a later pass retries.
          continue;
        } else if (parseEnvelope(m.body)) {
          next[m.id] = '[This message could not be decrypted.]';
        } else {
          next[m.id] = m.body;
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setPlain((prev) => ({ ...prev, ...next }));
      }
      } catch {
        if (!cancelled) {
          setError('Could not set up encryption on this device.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, peerKey, plain, isGroup, myId, id]);

  // Trending GIFs load once per sheet open; search replaces them.
  useEffect(() => {
    if (
      !funOpen ||
      funTab !== 'gifs' ||
      !giphyKey() ||
      gifResults ||
      gifLoading
    ) {
      return;
    }
    setGifLoading(true);
    trendingGifs()
      .then((res) => setGifResults(res))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load GIFs.');
      })
      .finally(() => setGifLoading(false));
  }, [funOpen, funTab, gifResults, gifLoading]);

  // In-chat search over decrypted text; matches jump in thread order.
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchOpen || !q) return [];
    return items
      .filter((m) => !m.deleted_at && bodyOf(m).toLowerCase().includes(q))
      .map((m) => m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, searchQuery, items, plain]);

  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) {
      setSearchHitId(null);
      return;
    }
    const safe =
      ((searchIndex % searchMatches.length) + searchMatches.length) %
      searchMatches.length;
    const targetId = searchMatches[safe];
    setSearchHitId(targetId);
    const rowIndex = rows.findIndex(
      (r) => r.kind === 'msg' && r.msg.id === targetId,
    );
    if (rowIndex >= 0) {
      try {
        listRef.current?.scrollToIndex({ index: rowIndex, viewPosition: 0.5 });
      } catch {
        // Row not laid out yet; the highlight still marks it.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, searchMatches, searchIndex, items]);

  function stepSearch(dir: 1 | -1) {
    if (searchMatches.length === 0) return;
    setSearchIndex(
      (i) => (i + dir + searchMatches.length) % searchMatches.length,
    );
  }

  const idsKey = items.map((m) => m.id).join(',');
  useEffect(() => {
    if (!id || demo || items.length === 0) return;
    let cancelled = false;
    (async () => {
      const map = await listReactions(items.map((m) => m.id));
      if (!cancelled) setReactions(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, demo]);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    (async () => {
      const byId = new Set(items.map((m) => m.id));
      const missing = [
        ...new Set(
          items
            .map((m) => m.reply_to)
            .filter(
              (v): v is string => !!v && !byId.has(v) && quoted[v] === undefined,
            ),
        ),
      ];
      if (missing.length === 0) return;
      const bodies = await getMessageBodies(missing);
      const next: Record<string, { body: string; senderName: string }> = {};
      let mine: Awaited<ReturnType<typeof getMyKeypair>> | null = null;
      let groupEnv: Record<string, string> = {};
      const groupKeyById = new Map<string, string | null>();
      if (isGroup && id) {
        const [k, e, g] = await Promise.all([
          getMyKeypair(),
          getMyEnvelopes(Object.keys(bodies)),
          getGroupMemberKeys(id).catch((): never[] => []),
        ]);
        mine = k;
        groupEnv = e;
        for (const m of g) groupKeyById.set(m.userId, m.publicKey);
      }
      for (const [mid, info] of Object.entries(bodies)) {
        const envelope = parseEnvelope(info.body);
        if (!isGroup) {
          if (envelope && peerKey) {
            const decrypted = await decryptFromPeer(envelope, peerKey);
            next[mid] = {
              body: decrypted ?? '[Encrypted message]',
              senderName: info.senderName,
            };
          } else if (envelope) {
            next[mid] = {
              body: '[Encrypted message]',
              senderName: info.senderName,
            };
          } else {
            next[mid] = { body: info.body, senderName: info.senderName };
          }
          continue;
        }
        const senderName = info.senderName;
        if (info.senderId === myId && mine) {
          const opened = envelope
            ? await decryptFromPeer(envelope, mine.publicKey)
            : null;
          next[mid] = {
            body: opened ?? (envelope ? '[Encrypted message]' : info.body),
            senderName,
          };
          continue;
        }
        const row = groupEnv[mid];
        const senderKey = groupKeyById.get(info.senderId) ?? null;
        if (row && senderKey) {
          const rowEnvelope = parseEnvelope(row);
          const opened = rowEnvelope
            ? await decryptFromPeer(rowEnvelope, senderKey)
            : null;
          next[mid] = { body: opened ?? '[Encrypted message]', senderName };
        } else if (envelope || row) {
          next[mid] = { body: '[Encrypted message]', senderName };
        } else {
          next[mid] = { body: info.body, senderName };
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setQuoted((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, peerKey, demo, quoted, isGroup, myId, id]);

  const encrypted = isGroup || !!peerKey;

  async function handleSend() {
    if (editing) {
      await handleSaveEdit();
      return;
    }
    if (!id || !text.trim() || sending) return;
    if (!isGroup && blockedByMe) {
      setError(`Unblock ${title} to send messages.`);
      return;
    }
    const body = text.trim().slice(0, MAX_MESSAGE);
    setError(null);
    setSending(true);
    try {
      if (isGroup) {
        if (!myId) throw new Error('You must be signed in.');
        if (!(await localKeyReady(setError))) return;
        // Member keys are public and safe to reuse from the saved copy.
        let keys: GroupMemberKey[];
        try {
          keys = await withTimeout(getGroupMemberKeys(id));
          writeCache(`group-keys:${id}`, keys).catch(() => {});
        } catch (err) {
          if (!isNetworkError(err)) throw err;
          const saved = await readCache<GroupMemberKey[]>(`group-keys:${id}`);
          if (!saved) {
            setError(
              'You are offline and this group was never opened online on this device. Message not sent.',
            );
            return;
          }
          keys = saved.data;
        }
        const fanout = await encryptForGroup(body, keys, myId);
        const replyToId = replyTo?.id ?? null;
        const clientId = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        const res = await runOrQueue(
          'send-group-message',
          {
            clientId,
            conversationId: id,
            body: fanout.selfEnvelope,
            envelopes: fanout.envelopes,
            replyTo: replyToId,
          },
          () =>
            sendGroupMessage(id, fanout.selfEnvelope, fanout.envelopes, {
              replyTo: replyToId,
            }).then((mid) => {
              setPlain((prev) => ({ ...prev, [mid]: body }));
              createMentions({
                userIds: resolveMentions(
                  body,
                  reads.map((r) => ({ userId: r.userId, name: r.name })),
                  myId,
                ),
                conversationId: id,
                messageId: mid,
              }).catch(() => {});
              setItems((prev) =>
                prev.some((x) => x.id === mid)
                  ? prev
                  : [
                      ...prev,
                      {
                        id: mid,
                        body: fanout.selfEnvelope,
                        created_at: new Date().toISOString(),
                        sender_id: myId,
                        reply_to: replyToId,
                        edited_at: null,
                        deleted_at: null,
                      },
                    ],
              );
            }),
        );
        setText('');
        setReplyTo(null);
        if (res.queued) {
          const tempId = `pending:${clientId}`;
          setPlain((prev) => ({ ...prev, [tempId]: body }));
          setItems((prev) => [
            ...prev,
            {
              id: tempId,
              body: fanout.selfEnvelope,
              created_at: new Date().toISOString(),
              sender_id: myId,
              reply_to: replyToId,
              edited_at: null,
              deleted_at: null,
            },
          ]);
          setPendingIds((prev) => new Set(prev).add(tempId));
        }
        if (fanout.missing > 0) {
          setError(
            `Sent. ${fanout.missing} member${fanout.missing === 1 ? ' has' : 's have'}n't opened the app to finish setting up chat and can't read this yet.`,
          );
        }
        return;
      }
      if (!(await localKeyReady(setError))) return;
      // Offline: fall back to the peer key we already know.
      let key = peerKey;
      try {
        const freshPeer = await withTimeout(getDmPeerInfo(id));
        if (freshPeer.peerKey !== peerKey) setPeerKey(freshPeer.peerKey);
        key = freshPeer.peerKey;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
      }
      if (!key) {
        setError(
          `${title} hasn't finished setting up chat yet. Ask them to open the app once, then try again. (Message not sent.)`,
        );
        return;
      }
      let payload: string;
      try {
        payload = await encryptForPeer(body, key);
      } catch {
        setError('Could not encrypt. Message not sent.');
        return;
      }
      const replyToId = replyTo?.id ?? null;
      const clientId = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      const res = await runOrQueue(
        'send-message',
        { clientId, conversationId: id, body: payload, replyTo: replyToId },
        () =>
          sendMessage(id, payload, { replyTo: replyToId }).then((sent) => {
            if (sent) {
              if (parseEnvelope(payload)) {
                setPlain((prev) => ({ ...prev, [sent.id]: body }));
              }
              setItems((prev) =>
                prev.some((x) => x.id === sent.id) ? prev : [...prev, sent],
              );
            }
          }),
      );
      setText('');
      setReplyTo(null);
      if (res.queued) {
        const tempId = `pending:${clientId}`;
        if (parseEnvelope(payload)) {
          setPlain((prev) => ({ ...prev, [tempId]: body }));
        }
        setItems((prev) => [
          ...prev,
          {
            id: tempId,
            body: payload,
            created_at: new Date().toISOString(),
            sender_id: myId ?? '',
            reply_to: replyToId,
            edited_at: null,
            deleted_at: null,
          },
        ]);
        setPendingIds((prev) => new Set(prev).add(tempId));
      }
    } catch (err) {
      // A blocked DM rejects the insert server-side; stay vague on purpose.
      setError(
        isRlsError(err)
          ? "This message couldn't be delivered."
          : err instanceof Error
            ? err.message
            : 'Could not send.',
      );
    } finally {
      setSending(false);
    }
  }

  async function startMic() {
    if (!id || sending || recording) return;
    setError(null);
    try {
      const granted = await ensureMicPermission();
      if (!granted) {
        setError('Microphone access is needed for voice notes.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record.');
    }
  }

  async function cancelRecording() {
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      // Already stopped.
    }
  }

  async function finishVoice() {
    setRecording(false);
    const seconds = Math.max(1, recSeconds);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Recording failed.');
      await handleSendVoice(uri, seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    }
  }

  async function handleSendVoice(uri: string, seconds: number) {
    if (!id || sending) return;
    if (!isGroup && blockedByMe) {
      setError(`Unblock ${title} to send messages.`);
      return;
    }
    setError(null);
    setSending(true);
    try {
      if (isGroup) {
        if (!myId) throw new Error('You must be signed in.');
        await ensureKeyPublished();
        const keys = await getGroupMemberKeys(id);
        const { cipher, keyB64 } = await sealVoiceFile(uri);
        const path = await uploadVoiceFile(id, cipher);
        const body = voiceDescriptor(path, seconds, keyB64);
        const fanout = await encryptForGroup(body, keys, myId);
        const mid = await sendGroupMessage(
          id,
          fanout.selfEnvelope,
          fanout.envelopes,
          { replyTo: replyTo?.id ?? null },
        );
        setReplyTo(null);
        setPlain((prev) => ({ ...prev, [mid]: body }));
        setItems((prev) =>
          prev.some((x) => x.id === mid)
            ? prev
            : [
                ...prev,
                {
                  id: mid,
                  body: fanout.selfEnvelope,
                  created_at: new Date().toISOString(),
                  sender_id: myId,
                  reply_to: replyTo?.id ?? null,
                  edited_at: null,
                  deleted_at: null,
                },
              ],
        );
        if (fanout.missing > 0) {
          setError(
            `Sent. ${fanout.missing} member${fanout.missing === 1 ? ' has' : 's have'}n't opened the app to finish setting up chat and can't play this yet.`,
          );
        }
        return;
      }
      await ensureKeyPublished();
      const freshPeer = await withTimeout(getDmPeerInfo(id));
      if (freshPeer.peerKey !== peerKey) setPeerKey(freshPeer.peerKey);
      const key = freshPeer.peerKey;
      if (!key) {
        setError(
          `${title} hasn't finished setting up chat yet. Ask them to open the app once, then try again. (Message not sent.)`,
        );
        return;
      }
      const { cipher, keyB64 } = await sealVoiceFile(uri);
      const path = await uploadVoiceFile(id, cipher);
      const payload = await encryptForPeer(
        voiceDescriptor(path, seconds, keyB64),
        key,
      );
      const sent = await sendMessage(id, payload, {
        replyTo: replyTo?.id ?? null,
      });
      setReplyTo(null);
      if (sent) {
        setPlain((prev) => ({
          ...prev,
          [sent.id]: voiceDescriptor(path, seconds, keyB64),
        }));
        setItems((prev) =>
          prev.some((x) => x.id === sent.id) ? prev : [...prev, sent],
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  /** True once anyone else has opened the thread past this message. */
  function seenByAnyone(item: Message): boolean {
    return reads.some((r) => r.lastReadAt >= item.created_at);
  }

  function editable(item: Message): boolean {
    if (item.sender_id !== myId || item.deleted_at || seenByAnyone(item)) {
      return false;
    }
    // Text only: voice notes, attachments, and stickers are re-sent.
    const body = bodyOf(item);
    return (
      !parseVoiceDescriptor(body) &&
      !parseMediaDescriptor(body) &&
      !parseStickerDescriptor(body)
    );
  }

  /** Copy needs decrypted plain text; media copies nothing useful. */
  function isTextOnly(item: Message): boolean {
    if (item.deleted_at) return false;
    const body = bodyOf(item);
    return (
      body !== '[Encrypted message]' &&
      !parseVoiceDescriptor(body) &&
      !parseMediaDescriptor(body) &&
      !parseStickerDescriptor(body)
    );
  }

  /** Anything readable forwards: text, photos, video, files, voice. */
  function isForwardable(item: Message): boolean {
    return !item.deleted_at && bodyOf(item) !== '[Encrypted message]';
  }

  async function handleSaveEdit() {
    if (!id || !editing || sending) return;
    const next = text.trim().slice(0, MAX_MESSAGE);
    if (!next) {
      setError('An edited message cannot be empty.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      // Re-seal the new text exactly like a fresh send; the server rejects
      // the write if the message was seen in the meantime.
      if (isGroup) {
        if (!myId) throw new Error('You must be signed in.');
        await ensureKeyPublished();
        const keys = await getGroupMemberKeys(id);
        const fanout = await encryptForGroup(next, keys, myId);
        await editGroupMessage(editing.id, fanout.selfEnvelope, fanout.envelopes);
        setPlain((prev) => ({ ...prev, [editing.id]: next }));
      } else {
        const freshPeer = await withTimeout(getDmPeerInfo(id));
        if (freshPeer.peerKey !== peerKey) setPeerKey(freshPeer.peerKey);
        const key = freshPeer.peerKey ?? peerKey;
        const wasEnvelope = !!parseEnvelope(editing.body);
        const payload =
          key && wasEnvelope ? await encryptForPeer(next, key) : next;
        await editMessage(editing.id, payload);
        setPlain((prev) => ({ ...prev, [editing.id]: next }));
      }
      setItems((prev) =>
        prev.map((m) =>
          m.id === editing.id
            ? { ...m, edited_at: new Date().toISOString() }
            : m,
        ),
      );
      setEditing(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit.');
    } finally {
      setSending(false);
    }
  }

  async function openForward(item: Message) {
    setMenuFor(null);
    setError(null);
    try {
      const all = await listConversations();
      setForwardTargets(all.filter((it) => it.id !== id));
      setForwardFor(item);
    } catch {
      setError('Could not load your chats.');
    }
  }

  /**
   * Forward text, media, voice, and stickers to another chat. Files are
   * re-homed (same sealed bytes, new folder) and the descriptor is
   * re-sealed for the new recipients — one tap, no re-pick.
   */
  async function forwardMessage(item: Message, target: ConversationListItem) {
    setForwarding(true);
    setError(null);
    try {
      const text = bodyOf(item);
      let plaintext = text;
      const media = parseMediaDescriptor(text);
      const voice = parseVoiceDescriptor(text);
      if (media) {
        const path = await copyCipherBytes(
          'chat-media',
          media.path,
          target.id,
          media.kind,
        );
        plaintext = mediaDescriptor(
          media.kind,
          path,
          media.key,
          media.name,
          media.mime,
          media.size,
          media.seconds,
          media.caption,
        );
      } else if (voice) {
        const path = await copyCipherBytes(
          'voice-notes',
          voice.path,
          target.id,
        );
        plaintext = voiceDescriptor(path, voice.seconds, voice.key);
      }
      await ensureKeyPublished();
      if (target.is_group) {
        if (!myId) throw new Error('You must be signed in.');
        const keys = await getGroupMemberKeys(target.id);
        const fanout = await encryptForGroup(plaintext, keys, myId);
        await sendGroupMessage(target.id, fanout.selfEnvelope, fanout.envelopes);
      } else {
        const peer = await getDmPeerInfo(target.id);
        if (!peer.peerKey) {
          throw new Error(
            `${target.title} hasn't finished setting up chat yet. Ask them to open the app once, then try again.`,
          );
        }
        await sendMessage(target.id, await encryptForPeer(plaintext, peer.peerKey));
      }
      setForwardFor(null);
      setForwardTargets(null);
    } catch (err) {
      setError(friendlyMediaError(err));
    } finally {
      setForwarding(false);
    }
  }

  async function sendSticker(stickerId: string) {
    setFunOpen(false);
    await deliverMediaAttachment(stickerDescriptor(stickerId));
  }

  /** GIFs send as normal encrypted video, so they play everywhere. */
  async function sendGif(g: GifResult) {
    setFunOpen(false);
    setError(null);
    try {
      const dir = new Directory(Paths.cache, 'gifs');
      try {
        dir.create();
      } catch {
        // Already exists.
      }
      const dest = await File.downloadFileAsync(
        g.mp4Url,
        new File(dir, `${g.id}.mp4`),
      );
      await sealAndSendAttachment({
        uri: dest.uri,
        name: `${g.title.slice(0, 40) || 'GIF'}.mp4`,
        mime: 'video/mp4',
      });
    } catch (err) {
      setError(friendlyMediaError(err));
    }
  }

  async function runGifSearch() {
    const q = gifQuery.trim();
    if (!q || gifLoading) return;
    setGifLoading(true);
    try {
      setGifResults(await searchGifs(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load GIFs.');
    } finally {
      setGifLoading(false);
    }
  }

  function handleDelete(item: Message) {
    setMenuFor(null);
    Alert.alert('Delete message?', 'This removes it for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(item.id);
            setItems((prev) =>
              prev.map((m) =>
                m.id === item.id
                  ? { ...m, deleted_at: new Date().toISOString() }
                  : m,
              ),
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete.');
          }
        },
      },
    ]);
  }

  /** Uploads need the network, so attachments send online-only. */
  async function deliverMediaAttachment(descriptorText: string) {
    if (!id || sending) return;
    if (!isGroup && blockedByMe) {
      setError(`Unblock ${title} to send messages.`);
      return;
    }
    setError(null);
    setSending(true);
    const replyToId = replyTo?.id ?? null;
    try {
      if (isGroup) {
        if (!myId) throw new Error('You must be signed in.');
        await ensureKeyPublished();
        const keys = await getGroupMemberKeys(id);
        const fanout = await encryptForGroup(descriptorText, keys, myId);
        const mid = await sendGroupMessage(
          id,
          fanout.selfEnvelope,
          fanout.envelopes,
          { replyTo: replyToId },
        );
        setReplyTo(null);
        setPlain((prev) => ({ ...prev, [mid]: descriptorText }));
        setItems((prev) => [
          ...prev,
          {
            id: mid,
            body: fanout.selfEnvelope,
            created_at: new Date().toISOString(),
            sender_id: myId,
            reply_to: replyToId,
            edited_at: null,
            deleted_at: null,
          },
        ]);
        if (fanout.missing > 0) {
          setError(
            `Sent. ${fanout.missing} member${fanout.missing === 1 ? ' has' : 's have'}n't opened the app to finish setting up chat and can't open this yet.`,
          );
        }
        return;
      }
      await ensureKeyPublished();
      const freshPeer = await withTimeout(getDmPeerInfo(id));
      if (freshPeer.peerKey !== peerKey) setPeerKey(freshPeer.peerKey);
      const key = freshPeer.peerKey;
      if (!key) {
        setError(
          `${title} hasn't finished setting up chat yet. Ask them to open the app once, then try again. (File not sent.)`,
        );
        return;
      }
      const payload = await encryptForPeer(descriptorText, key);
      const sent = await sendMessage(id, payload, { replyTo: replyToId });
      setReplyTo(null);
      if (sent) {
        setPlain((prev) => ({ ...prev, [sent.id]: descriptorText }));
        setItems((prev) =>
          prev.some((x) => x.id === sent.id) ? prev : [...prev, sent],
        );
      }
    } catch (err) {
      setError(
        isRlsError(err)
          ? "This message couldn't be delivered."
          : isNetworkError(err)
            ? 'You are offline. Reconnect to send photos, videos, and files.'
            : err instanceof Error
              ? err.message
              : 'Could not send.',
      );
    } finally {
      setSending(false);
    }
  }

  async function sealAndSendAttachment(
    pick: {
      uri: string;
      name: string;
      mime: string;
      seconds?: number;
    },
    captionText?: string,
  ) {
    if (!id) return;
    setAttachOpen(false);
    setError(null);
    setUploading(true);
    try {
      const kind = kindForMime(pick.mime);
      const { cipher, keyB64, size } = await sealMediaFile(
        pick.uri,
        kind === 'file' ? MAX_CHAT_FILE_BYTES : undefined,
      );
      const path = await uploadMediaFile(id, cipher, kindForMime(pick.mime));
      await deliverMediaAttachment(
        mediaDescriptor(
          kindForMime(pick.mime),
          path,
          keyB64,
          pick.name,
          pick.mime,
          size,
          pick.seconds,
          captionText,
        ),
      );
    } catch (err) {
      setError(friendlyMediaError(err));
    } finally {
      setUploading(false);
    }
  }

  async function takePhoto() {
    setAttachOpen(false);
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera access is needed to take photos or video.');
      return;
    }
    // Best-effort: clips record silent when the mic is denied, so never
    // block the camera on it.
    await ensureMicPermission().catch(() => false);
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    const fallback = mime.startsWith('video/')
      ? `video-${Date.now()}.mp4`
      : `photo-${Date.now()}.jpg`;
    openPreview({
      uri: asset.uri,
      name: asset.fileName ?? fallback,
      mime,
      ...(typeof asset.duration === 'number' && asset.duration > 0
        ? { seconds: Math.round(asset.duration / 1000) }
        : {}),
    });
  }

  /** WhatsApp-style: photos and video preview with a caption first. */
  function openPreview(pick: {
    uri: string;
    name: string;
    mime: string;
    seconds?: number;
  }) {
    setAttachOpen(false);
    setCaption('');
    setPendingPick(pick);
    void loadRecentMedia();
  }

  function cancelPreview() {
    setPendingPick(null);
    setCaption('');
  }

  async function loadRecentMedia() {
    try {
      const allowed = await ensureMediaLibrary().catch(() => false);
      if (!allowed) return;
      const page = await MediaLibrary.getAssetsAsync({
        first: 12,
        mediaType: ['photo', 'video'],
      });
      setRecentAssets(page.assets);
    } catch {
      // The carousel is a shortcut; the picked file still sends without it.
    }
  }

  /** Swap the preview for a recent photo/video from the carousel. */
  async function swapRecent(
    asset: Awaited<
      ReturnType<typeof MediaLibrary.getAssetsAsync>
    >['assets'][number],
  ) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset).catch(
        () => null,
      );
      const isVideo = asset.mediaType === 'video';
      setPendingPick({
        uri: info?.localUri ?? asset.uri,
        name: asset.filename ?? (isVideo ? 'video.mp4' : 'photo.jpg'),
        mime: isVideo ? 'video/mp4' : 'image/jpeg',
        ...(isVideo && asset.duration > 0
          ? { seconds: Math.round(asset.duration) }
          : {}),
      });
    } catch {
      setError('Could not read that file. Pick it again.');
    }
  }

  async function sendPending() {
    const pick = pendingPick;
    if (!pick) return;
    const cap = caption.trim().slice(0, 1024);
    setPendingPick(null);
    setCaption('');
    await sealAndSendAttachment(pick, cap || undefined);
  }

  async function pickPhotoVideo() {
    const allowed = await ensureMediaLibrary().catch(() => false);
    if (!allowed) {
      setError('Ophixe needs gallery access to attach photos or video.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType ?? 'application/octet-stream';
    const fallback = mime.startsWith('video/') ? 'video.mp4' : 'photo.jpg';
    openPreview({
      uri: asset.uri,
      name: asset.fileName ?? fallback,
      mime,
      ...(typeof asset.duration === 'number' && asset.duration > 0
        ? { seconds: Math.round(asset.duration / 1000) }
        : {}),
    });
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await sealAndSendAttachment({
      uri: asset.uri,
      name: asset.name ?? 'document',
      mime: asset.mimeType ?? 'application/octet-stream',
    });
  }

  async function pickAudio() {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await sealAndSendAttachment({
      uri: asset.uri,
      name: asset.name ?? 'audio.mp3',
      mime: asset.mimeType ?? 'audio/mpeg',
    });
  }

  const iAmAdmin = !!myId && adminIds.has(myId);

  async function handleDeleteGroup() {
    if (!id || demo) return;
    setGroupMenu(false);
    Alert.alert(
      'Delete group?',
      `${title} and its messages will be gone for everyone. This cannot be undone.`,
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
                  promptMessage: `Confirm it's you to delete ${title}`,
                  cancelLabel: 'Cancel',
                });
                if (!auth.success) return;
              }
              await deleteGroupChat(id);
              router.replace('/teams');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not delete.');
            }
          },
        },
      ],
    );
  }

  async function openAddSheet() {
    if (!id) return;
    setGroupMenu(false);
    setError(null);
    try {
      const info = await getGroupProfile(id);
      if (!info?.communityId) {
        setError('Only community groups can add members here.');
        return;
      }
      const admin = await isCommunityAdmin(info.communityId).catch(() => false);
      if (!admin) {
        setError('Only admins can add members.');
        return;
      }
      const page = await listCommunityMembers(info.communityId, {
        limit: 200,
      }).catch(() => ({ members: [], hasMore: false }));
      const inGroup = new Set(info.members.map((m) => m.userId));
      setCandidates(
        page.members.filter(
          (m) => m.status === 'active' && !inGroup.has(m.userId),
        ),
      );
      setAddOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load members.');
    }
  }

  async function handleAddMember(userId: string) {
    if (!id || addingId) return;
    setAddingId(userId);
    try {
      await addGroupMembers(id, [userId]);
      setCandidates((prev) => prev.filter((it) => it.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add.');
    } finally {
      setAddingId(null);
    }
  }

  async function openGroupMenu() {
    if (!id) return;
    // Fresh mute state each time the menu opens.
    getGroupProfile(id)
      .then((info) => {
        if (info) setMuted(info.muted);
      })
      .catch(() => {});
    setGroupMenu(true);
  }

  async function toggleMute() {
    if (!id) return;
    setGroupMenu(false);
    setDmMenu(false);
    try {
      await setConversationMuted(id, !muted);
      setMuted(!muted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  async function openDmMenu() {
    if (!id) return;
    setError(null);
    getGroupProfile(id)
      .then((info) => {
        if (info) setMuted(info.muted);
      })
      .catch(() => {});
    if (peerId) {
      isBlockedByMe(peerId)
        .then(setBlockedByMe)
        .catch(() => {});
    }
    setDmMenu(true);
  }

  function disappearLabel(sec: number | null): string {
    if (sec === 3600) return '1 hour';
    if (sec === 86400) return '24 hours';
    if (sec === 604800) return '7 days';
    if (sec === 2592000) return '30 days';
    if (sec === 7776000) return '90 days';
    if (sec !== null) return 'On';
    return 'Off';
  }

  async function applyDisappear(seconds: number | null) {
    if (!id) return;
    setDisappearOpen(false);
    setError(null);
    try {
      await setDisappearSeconds(id, seconds);
      setDisappear(seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  function handleReportPeer() {
    setDmMenu(false);
    if (!id || !peerId) {
      setError('Profile unavailable.');
      return;
    }
    const pid = peerId;
    const cid = id;
    Alert.alert(`Report ${title}?`, 'Your admins will review this person.', [
      { text: 'Cancel', style: 'cancel' },
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await reportUser(pid, cid, reason);
            Alert.alert('Reported', 'Thanks — the admins have been notified.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not report.');
          }
        },
      })),
    ]);
  }

  function handleBlockToggle() {
    setDmMenu(false);
    if (!peerId) {
      setError('Profile unavailable.');
      return;
    }
    const pid = peerId;
    if (blockedByMe) {
      unblockUser(pid)
        .then(() => setBlockedByMe(false))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not unblock.');
        });
      return;
    }
    Alert.alert(
      `Block ${title}?`,
      'They will no longer be able to message you. You can unblock them anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(pid);
              setBlockedByMe(true);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Could not block.',
              );
            }
          },
        },
      ],
    );
  }

  async function handleStartCall(media: CallMedia) {
    if (isGroup && !iAmAdmin) {
      setError('Only admins can start calls in this group.');
      return;
    }
    if (!id || demo) return;
    setError(null);
    try {
      await startCallSignal(id, media);
      router.push({
        pathname: '/call/[id]',
        params: { id, media },
      } as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start call.');
    }
  }

  function handleLeaveGroup() {
    if (!id) return;
    Alert.alert(`Leave ${title}?`, 'You can rejoin later from Teams. If you are the last member, the group is deleted instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            const action = await leaveGroupChat(id);
            if (action === 'deleted') {
              Alert.alert('Group deleted', `${title} is gone.`, [
                { text: 'OK', onPress: () => router.replace('/teams') },
              ]);
            } else {
              router.replace('/teams');
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not leave.');
          }
        },
      },
    ]);
  }

  async function handleLoadOlder() {
    if (!id || loadingOlder || exhausted || items.length === 0) return;
    setLoadingOlder(true);
    try {
      const older = await getMessagesBefore(id, items[0].created_at);
      if (older.length === 0) setExhausted(true);
      setItems((prev) => [...older, ...prev]);
    } catch {
      setError('Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleReact(item: Message, emoji: string) {
    setMenuFor(null);
    try {
      await toggleReaction(item.id, emoji);
      const map = await listReactions([item.id]);
      setReactions((prev) => ({ ...prev, [item.id]: map[item.id] ?? [] }));
    } catch {
      setError('Could not react.');
    }
  }

  function scrollToRow(targetId: string): boolean {
    const idx = rowsRef.current.findIndex(
      (r) => r.kind === 'msg' && r.msg.id === targetId,
    );
    if (idx < 0) return false;
    try {
      listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5 });
    } catch {
      // Not laid out yet; the failure retry below still runs.
    }
    return true;
  }

  function flashJump(targetId: string) {
    setJumpId(targetId);
    setTimeout(() => {
      setJumpId((cur) => (cur === targetId ? null : cur));
    }, 1600);
  }

  /** Tapping a quote jumps to the quoted message, loading older
   * history until it is in the list (up to 8 windows back). */
  async function jumpToMessage(targetId: string) {
    if (!id || !targetId) return;
    if (scrollToRow(targetId)) {
      flashJump(targetId);
      return;
    }
    if (items.length === 0) return;
    let cursor = items[0].created_at;
    for (let round = 0; round < 8; round++) {
      let older: Message[];
      try {
        older = await getMessagesBefore(id, cursor);
      } catch {
        break;
      }
      if (older.length === 0) {
        setExhausted(true);
        break;
      }
      cursor = older[0].created_at;
      const batch = older;
      const found = batch.some((m) => m.id === targetId);
      setItems((prev) => [...batch, ...prev]);
      if (found) break;
    }
    setTimeout(() => {
      if (scrollToRow(targetId)) flashJump(targetId);
      else setError('That message is too far back to jump to.');
    }, 120);
  }

  function bodyOf(item: Message): string {
    if (item.deleted_at) return '';
    const envelope = parseEnvelope(item.body);
    const text = !envelope ? item.body : (plain[item.id] ?? '[Encrypted message]');
    return missedCallDisplay(text, item.sender_id, myId);
  }

  /** Quote/preview label: descriptors become short text. */
  function labelOf(text: string): string {
    return stickerLabel(mediaLabel(voiceLabel(text)));
  }

  function quotedOf(
    item: Message,
  ): { body: string; senderName: string } | null {
    if (!item.reply_to) return null;
    const parent = items.find((m) => m.id === item.reply_to);
    if (parent) {
      return {
        body: parent.deleted_at
          ? 'This message was deleted.'
          : labelOf(bodyOf(parent)),
        senderName: parent.sender_id === myId ? 'You' : title,
      };
    }
    const hit = quoted[item.reply_to] ?? null;
    return hit ? { ...hit, body: labelOf(hit.body) } : null;
  }

  function receiptOf(item: Message): string | null {
    if (item.sender_id !== myId || reads.length === 0) return null;
    const seenBy = reads.filter((r) => r.lastReadAt >= item.created_at);
    if (reads.length <= 1) {
      return seenBy.length > 0
        ? `✓✓ Seen ${timeAgo(seenBy[0].lastReadAt)}`
        : '✓ Sent';
    }
    return seenBy.length > 0 ? `✓✓ Seen by ${seenBy.length}` : '✓ Sent';
  }

  const rows: Row[] = (() => {
    // Disappearing messages vanish instantly client-side; the hourly
    // server purge is the durable backstop.
    const visible = items.filter(
      // Per-message expiry replaced the conversation-wide filter below.
      (m) => !m.expires_at || new Date(m.expires_at).getTime() > Date.now(),
      // Only stamped messages expire; older history is never touched.
      // (legacy predicate removed)
      // (legacy age check removed)
      // (legacy timer math removed)
          );
    const out: Row[] = [];
    let lastDay = '';
    let lastSender = '';
    visible.forEach((m, i) => {
      const key = dayKey(m.created_at);
      const newDay = key !== lastDay;
      if (newDay) {
        lastDay = key;
        out.push({ kind: 'day', id: `day-${key}`, label: dayLabel(m.created_at) });
      }
      const firstInGroup = newDay || m.sender_id !== lastSender;
      const next = visible[i + 1];
      const lastInGroup =
        !next ||
        next.sender_id !== m.sender_id ||
        dayKey(next.created_at) !== key;
      lastSender = m.sender_id;
      out.push({ kind: 'msg', msg: m, firstInGroup, lastInGroup });
    });
    return out.reverse();
  })();

  return (
    <>
      <ScreenHeader
        title={title}
        headAvatarUrl={peerAvatar}
        headAvatarLabel={title}
        headStatusText={
          !isGroup && peerId
            ? statusText(peerSeen).text
            : isGroup && memberCount !== null
              ? `${memberCount} member${memberCount === 1 ? '' : 's'}`
              : null
        }
        headStatusOnline={!isGroup && !!peerId && statusText(peerSeen).online}
        tray={
          demo || !id
            ? null
            : [
                ...(!isGroup || iAmAdmin
                  ? [
                      {
                        icon: 'call-outline',
                        label: 'Voice call',
                        onPress: () => handleStartCall('voice'),
                      },
                      {
                        icon: 'videocam-outline',
                        label: 'Video call',
                        onPress: () => handleStartCall('video'),
                      },
                    ]
                  : []),
                {
                  icon: 'ellipsis-vertical',
                  label: isGroup ? 'Group menu' : 'Chat menu',
                  onPress: () => (isGroup ? openGroupMenu() : openDmMenu()),
                },
              ]
        }
        action={null}
        onTitlePress={
          demo || !id
            ? null
            : isGroup
              ? () =>
                  router.push({
                    pathname: '/group/[id]',
                    params: { id },
                  })
              : peerId
                ? () =>
                    router.push({
                      pathname: '/member/[id]',
                      params: { id: peerId },
                    })
                : null
        }
      />
      <KeyboardAvoidingView
        style={styles.page}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 54}
      >
        {wallpaper.type === 'color' || wallpaper.type === 'default' ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  wallpaper.type === 'color'
                    ? wallpaper.value
                    : defaultWallpaperColor(dark),
              },
            ]}
          />
        ) : (
          <ImageBackground
            source={
              wallpaper.type === 'image'
                ? { uri: wallpaper.uri }
                : wallpaper.type === 'builtin'
                  ? (builtinSource(wallpaper.id) ?? DEFAULT_WALLPAPER)
                  : DEFAULT_WALLPAPER
            }
            style={StyleSheet.absoluteFill}
            // Doodle patterns tile at their small native size; only a
            // user photo stretches to fill the screen.
            resizeMode={wallpaper.type === 'image' ? 'cover' : 'repeat'}
          />
        )}
        <OfflineBanner />
        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {searchOpen && (
          <View style={styles.searchBar}>
            <Pressable
              onPress={() => {
                setSearchOpen(false);
                setSearchQuery('');
                setSearchHitId(null);
              }}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={c.subtext} />
            </Pressable>
            <TextInput
              style={styles.searchInput}
              placeholder="Search in chat"
              placeholderTextColor={c.subtext}
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                setSearchIndex(0);
              }}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.trim() ? (
              <Text style={styles.searchCount}>
                {searchMatches.length === 0
                  ? '0/0'
                  : `${(searchIndex % searchMatches.length) + 1}/${searchMatches.length}`}
              </Text>
            ) : null}
            <Pressable onPress={() => stepSearch(-1)} hitSlop={8}>
              <Ionicons name="chevron-up" size={20} color={c.subtext} />
            </Pressable>
            <Pressable onPress={() => stepSearch(1)} hitSlop={8}>
              <Ionicons name="chevron-down" size={20} color={c.subtext} />
            </Pressable>
          </View>
        )}
        {!isGroup && blockedByMe && (
          <View style={styles.blockBar}>
            <Text style={styles.blockText}>You blocked {title}.</Text>
            <Pressable onPress={handleBlockToggle} hitSlop={8}>
              <Text style={styles.blockAction}>Unblock</Text>
            </Pressable>
          </View>
        )}
        {disappear !== null && (
          <View style={styles.vanishBar}>
            <Ionicons name="timer-outline" size={14} color={c.subtext} />
            <Text style={styles.vanishText}>
              Disappearing messages • {disappearLabel(disappear)}
            </Text>
          </View>
        )}
        {!demo && liveCall ? (
          <View style={styles.callBanner}>
            <View style={styles.callBannerMid}>
              <Text style={styles.callBannerTitle}>
                {liveCall.startedBy === myId
                  ? `${liveCall.media === 'video' ? 'Video' : 'Voice'} call in progress`
                  : `Incoming ${liveCall.media} call`}
              </Text>
              <Text style={styles.callBannerBody}>
                {liveCall.startedBy === myId
                  ? 'Tap to rejoin.'
                  : `${title} • tap Join to answer.`}
              </Text>
            </View>
            <Pressable
              style={styles.callJoin}
              onPress={() => {
                if (!id) return;
                setSilencedCall(liveCall.id);
                router.push({
                  pathname: '/call/[id]',
                  params: { id, media: liveCall.media },
                } as never);
              }}
            >
              <Text style={styles.callJoinText}>
                {liveCall.startedBy === myId ? 'REJOIN' : 'JOIN'}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {demo ? (
          <Text style={styles.notice}>
            Connect Supabase to use live chat.
          </Text>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: Math.max(0, info.averageItemLength * info.index - 400),
                animated: false,
              });
              setTimeout(() => {
                try {
                  listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5 });
                } catch {
                  // Row still not laid out.
                }
              }, 120);
            }}
            keyExtractor={(row) => (row.kind === 'day' ? row.id : row.msg.id)}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            removeClippedSubviews
            maxToRenderPerBatch={20}
            windowSize={11}
            ListFooterComponent={
              !exhausted && items.length > 0 ? (
                <Pressable
                  style={styles.older}
                  onPress={handleLoadOlder}
                  disabled={loadingOlder}
                >
                  <Text style={styles.olderText}>
                    {loadingOlder ? 'LOADING…' : 'LOAD OLDER MESSAGES'}
                  </Text>
                </Pressable>
              ) : undefined
            }
            ListEmptyComponent={
              <Text style={styles.notice}>
                No messages yet. Say hello below.
              </Text>
            }
            renderItem={({ item: row }) => {
              if (row.kind === 'day') {
                return (
                  <View style={styles.dayLine}>
                    <Text style={styles.dayLineText}>{row.label}</Text>
                  </View>
                );
              }
              const item = row.msg;
              const mine = item.sender_id === myId;
              const quote = quotedOf(item);
              const reacts = reactions[item.id] ?? [];
              const receipt = receiptOf(item);
              const sender = reads.find((r) => r.userId === item.sender_id);
              const stickerMsg =
                !item.deleted_at &&
                parseStickerDescriptor(bodyOf(item)) !== null;
              return (
                <Pressable
                  onLongPress={() => {
                    if (item.deleted_at) return;
                    Keyboard.dismiss();
                    setMenuFor(item);
                  }}
                >
                  <Swipeable
                    onReply={() => {
                      if (item.deleted_at) return;
                      setReplyTo(item);
                      inputRef.current?.focus();
                    }}
                  >
                  <View
                    style={[
                      styles.msgRow,
                      mine && styles.msgRowMine,
                      !row.firstInGroup && styles.msgRowGrouped,
                    ]}
                  >
                  {!mine &&
                    (row.lastInGroup ? (
                      <Avatar
                        name={sender?.name ?? title}
                        size={28}
                        uri={sender?.avatarUrl ?? null}
                      />
                    ) : (
                      <View style={styles.avatarSpacer} />
                    ))}
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                      stickerMsg && styles.bubbleSticker,
                      searchHitId === item.id && styles.searchHit,
                      jumpId === item.id && styles.searchHit,
                      !mine && styles.bubbleInRow,
                      mine && row.lastInGroup && styles.tailMine,
                      !mine && row.lastInGroup && styles.tailTheirs,
                    ]}
                  >
                    {quote && (
                      <Pressable
                        style={[styles.quote, mine && styles.quoteMine]}
                        onPress={() =>
                          item.reply_to && jumpToMessage(item.reply_to)
                        }
                      >
                        <Text
                          style={[styles.quoteName, mine && styles.quoteTextMine]}
                        >
                          {quote.senderName}
                        </Text>
                        <Text
                          style={[styles.quoteBody, mine && styles.quoteTextMine]}
                          numberOfLines={2}
                        >
                          {quote.body}
                        </Text>
                      </Pressable>
                    )}
                    {!mine && isGroup && row.firstInGroup && (
                      <View style={styles.senderRow}>
                        <Text
                          style={styles.senderName}
                          numberOfLines={1}
                        >
                          {sender?.name ?? title}
                        </Text>
                        {adminIds.has(item.sender_id) ? (
                          <AdminTag size={16} />
                        ) : null}
                      </View>
                    )}
                    {item.deleted_at ? (
                      <Text
                        style={[
                          styles.bubbleText,
                          styles.deletedText,
                          mine && styles.bubbleTextMine,
                        ]}
                      >
                        🚫 This message was deleted.
                      </Text>
                    ) : (
                      (() => {
                        const voice = parseVoiceDescriptor(bodyOf(item));
                        if (voice) {
                          return (
                            <VoiceBubble
                              id={item.id}
                              descriptor={voice}
                              mine={mine}
                            />
                          );
                        }
                        const media = parseMediaDescriptor(bodyOf(item));
                        if (media) {
                          if (media.kind === 'audio') {
                            return (
                              <AudioBubble
                                id={item.id}
                                descriptor={media}
                                mine={mine}
                              />
                            );
                          }
                          return (
                            <MediaBubble
                              id={item.id}
                              descriptor={media}
                              mine={mine}
                            />
                          );
                        }
                        const sticker = parseStickerDescriptor(bodyOf(item));
                        if (sticker) {
                          const src = stickerSource(sticker.id);
                          if (src) {
                            return (
                              <Image
                                source={src}
                                style={styles.sticker}
                                resizeMode="contain"
                              />
                            );
                          }
                          return (
                            <Text
                              style={[
                                styles.bubbleText,
                                mine && styles.bubbleTextMine,
                              ]}
                            >
                              Sticker
                            </Text>
                          );
                        }
                        return (
                          <Text
                            style={[
                              styles.bubbleText,
                              mine && styles.bubbleTextMine,
                              callLabelTone(bodyOf(item)) === 'missed' &&
                                styles.bubbleTextMissed,
                              callLabelTone(bodyOf(item)) === 'answered' &&
                                styles.bubbleTextAnswered,
                            ]}
                          >
                            {bodyOf(item)}
                          </Text>
                        );
                      })()
                    )}
                    <Text
                      style={[
                        styles.bubbleTime,
                        mine && styles.bubbleTimeMine,
                      ]}
                    >
                      {clockTime(item.created_at)}
                      {item.edited_at ? ' • edited' : ''}
                      {pendingIds.has(item.id)
                        ? ' • Sending…'
                        : receipt
                          ? ` • ${receipt}`
                          : ''}
                    </Text>
                  </View>
                  </View>
                  </Swipeable>
                  {reacts.length > 0 && (
                    <View
                      style={[
                        styles.reacts,
                        mine ? styles.reactsMine : styles.reactsTheirs,
                      ]}
                    >
                      {reacts.map((r) => (
                        <Pressable
                          key={r.emoji}
                          style={[
                            styles.reactChip,
                            r.mine && styles.reactChipMine,
                          ]}
                          onPress={() => handleReact(item, r.emoji)}
                        >
                          <Text style={styles.reactText}>
                            {r.emoji} {r.count}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}
        {!demo && (
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.composerSafe,
              kbPad > 0 && { paddingBottom: kbPad },
              kbOpen && insets.bottom > 0 && { marginBottom: -insets.bottom },
            ]}
          >
            {replyTo && (
              <View style={styles.replyBar}>
                <View style={styles.replyMid}>
                  <Text style={styles.replyName}>
                    {replyTo.sender_id === myId ? 'You' : title}
                  </Text>
                  <Text style={styles.replyBody} numberOfLines={1}>
                    {labelOf(bodyOf(replyTo))}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={c.subtext} />
                </Pressable>
              </View>
            )}
            {editing && (
              <View style={styles.replyBar}>
                <View style={styles.replyMid}>
                  <Text style={styles.replyName}>Editing message</Text>
                  <Text style={styles.replyBody} numberOfLines={1}>
                    {labelOf(bodyOf(editing))}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setEditing(null);
                    setText('');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color={c.subtext} />
                </Pressable>
              </View>
            )}
            {uploading && (
              <View style={styles.uploadBar}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={styles.uploadText}>
                  Encrypting and uploading…
                </Text>
              </View>
            )}
            <View style={styles.composer}>
              <Ionicons
                name={encrypted ? 'lock-closed' : 'lock-open-outline'}
                size={18}
                color={encrypted ? c.primary : c.subtext}
              />
              {recording ? (
                <>
                  <Pressable
                    style={styles.recCancel}
                    onPress={cancelRecording}
                    hitSlop={8}
                    accessibilityLabel="Cancel voice note"
                  >
                    <Ionicons name="close" size={20} color={c.danger} />
                  </Pressable>
                  <View style={styles.recMid}>
                    <View style={styles.recDot} />
                    <Text style={styles.recTime}>
                      {Math.floor(recSeconds / 60)}:
                      {String(recSeconds % 60).padStart(2, '0')}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.send}
                    onPress={finishVoice}
                    accessibilityLabel="Send voice note"
                  >
                    <Ionicons name="send" size={20} color={c.paper} />
                  </Pressable>
                </>
              ) : (
                <>
                  {!editing && (
                    <Pressable
                      style={styles.attach}
                      onPress={() => setAttachOpen(true)}
                      disabled={sending || uploading}
                      hitSlop={8}
                      accessibilityLabel="Attach photo, video, or file"
                    >
                      <Ionicons
                        name="add"
                        size={24}
                        color={c.subtext}
                      />
                    </Pressable>
                  )}
                  {!editing && (
                    <Pressable
                      style={styles.attach}
                      onPress={() => {
                        setFunTab('stickers');
                        setGifResults(null);
                        setFunOpen(true);
                      }}
                      hitSlop={8}
                      accessibilityLabel="Stickers and GIFs"
                    >
                      <Ionicons
                        name="happy-outline"
                        size={24}
                        color={c.subtext}
                      />
                    </Pressable>
                  )}
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder={
                      editing
                        ? 'Edit message'
                        : encrypted
                          ? 'Encrypted message'
                          : 'Message'
                    }
                    placeholderTextColor={c.subtext}
                    value={text}
                    onChangeText={(value) => setText(value.slice(0, MAX_MESSAGE))}
                    multiline
                    blurOnSubmit={false}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                  />
                  {text.trim() || editing ? (
                    <Pressable
                      style={styles.send}
                      onPress={handleSend}
                      disabled={sending}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color={c.paper} />
                      ) : (
                        <Ionicons
                          name={editing ? 'checkmark' : 'send'}
                          size={20}
                          color={c.paper}
                        />
                      )}
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.send}
                      onPress={startMic}
                      disabled={sending}
                      accessibilityLabel="Record voice note"
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color={c.paper} />
                      ) : (
                        <Ionicons name="mic" size={20} color={c.paper} />
                      )}
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
      <Modal
        visible={menuFor !== null}
        transparent
        onRequestClose={() => setMenuFor(null)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuFor(null)}
          />
          <View style={styles.menuCard}>
            <View style={styles.emojiRow}>
              {REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  hitSlop={6}
                  onPress={() => menuFor && handleReact(menuFor, emoji)}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.menuBtn}
              onPress={() => {
                setReplyTo(menuFor);
                setMenuFor(null);
                inputRef.current?.focus();
              }}
            >
              <Text style={styles.menuBtnText}>Reply</Text>
            </Pressable>
            {menuFor && isTextOnly(menuFor) && (
              <Pressable
                style={styles.menuBtn}
                onPress={() => {
                  Clipboard.setStringAsync(bodyOf(menuFor)).catch(() => {});
                  setMenuFor(null);
                }}
              >
                <Text style={styles.menuBtnText}>Copy</Text>
              </Pressable>
            )}
            {menuFor && isForwardable(menuFor) && (
              <Pressable
                style={styles.menuBtn}
                onPress={() => menuFor && openForward(menuFor)}
              >
                <Text style={styles.menuBtnText}>Forward</Text>
              </Pressable>
            )}
            {menuFor && editable(menuFor) && (
              <Pressable
                style={styles.menuBtn}
                onPress={() => {
                  setEditing(menuFor);
                  setText(bodyOf(menuFor));
                  setMenuFor(null);
                  inputRef.current?.focus();
                }}
              >
                <Text style={styles.menuBtnText}>Edit</Text>
              </Pressable>
            )}
            {menuFor &&
              menuFor.sender_id === myId &&
              !menuFor.deleted_at && (
                <Pressable
                  style={[styles.menuBtn, styles.menuBtnDanger]}
                  onPress={() => menuFor && handleDelete(menuFor)}
                >
                  <Text style={styles.menuBtnText}>Delete</Text>
                </Pressable>
              )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={groupMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setGroupMenu(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setGroupMenu(false)}
          />
          <SafeAreaView edges={['bottom']} style={styles.groupSheet}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>{title}</Text>
            <MenuRow
              icon="people-outline"
              title="Group info"
              sub="Members and settings"
              onPress={() => {
                setGroupMenu(false);
                if (id) {
                  router.push({
                    pathname: '/group/[id]',
                    params: { id },
                  });
                }
              }}
            />
            <MenuRow
              icon="search-outline"
              title="Search in chat"
              sub="Find a message"
              onPress={() => {
                setGroupMenu(false);
                setSearchOpen(true);
              }}
            />
            <MenuRow
              icon="image-outline"
              title="Chat theme"
              sub="Wallpaper for this chat"
              onPress={() => {
                setGroupMenu(false);
                router.push('/chat/wallpaper');
              }}
            />
            {iAmAdmin && (
              <MenuRow
                icon="person-add-outline"
                title="Add members"
                sub="From the community"
                onPress={openAddSheet}
              />
            )}
            <MenuRow
              icon={
                muted ? 'notifications-outline' : 'notifications-off-outline'
              }
              title={muted ? 'Unmute notifications' : 'Mute notifications'}
              sub={muted ? 'Sound on again' : 'Stay silent'}
              onPress={toggleMute}
            />
            <MenuRow
              icon="timer-outline"
              title="Disappearing messages"
              sub={disappearLabel(disappear)}
              onPress={() => {
                setGroupMenu(false);
                setDisappearOpen(true);
              }}
            />
            <MenuRow
              icon="exit-outline"
              title="Leave group"
              sub="You can rejoin from Teams"
              onPress={() => {
                setGroupMenu(false);
                handleLeaveGroup();
              }}
            />
            {iAmAdmin && (
              <MenuRow
                icon="trash-outline"
                title="Delete group"
                sub="Gone for everyone"
                danger
                onPress={handleDeleteGroup}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={dmMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setDmMenu(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setDmMenu(false)}
          />
          <SafeAreaView edges={['bottom']} style={styles.groupSheet}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>{title}</Text>
            <MenuRow
              icon="person-outline"
              title="View contact"
              sub="Profile and shared groups"
              onPress={() => {
                setDmMenu(false);
                if (peerId) {
                  router.push({
                    pathname: '/member/[id]',
                    params: { id: peerId },
                  });
                } else {
                  setError('Profile unavailable.');
                }
              }}
            />
            <MenuRow
              icon="search-outline"
              title="Search in chat"
              sub="Find a message"
              onPress={() => {
                setDmMenu(false);
                setSearchOpen(true);
              }}
            />
            <MenuRow
              icon="image-outline"
              title="Chat theme"
              sub="Wallpaper for this chat"
              onPress={() => {
                setDmMenu(false);
                router.push('/chat/wallpaper');
              }}
            />
            <MenuRow
              icon={
                muted ? 'notifications-outline' : 'notifications-off-outline'
              }
              title={muted ? 'Unmute notifications' : 'Mute notifications'}
              sub={muted ? 'Sound on again' : 'Stay silent'}
              onPress={toggleMute}
            />
            <MenuRow
              icon="timer-outline"
              title="Disappearing messages"
              sub={disappearLabel(disappear)}
              onPress={() => {
                setDmMenu(false);
                setDisappearOpen(true);
              }}
            />
            <MenuRow
              icon="flag-outline"
              title="Report"
              sub="Tell the admins"
              onPress={handleReportPeer}
            />
            <MenuRow
              icon={blockedByMe ? 'checkmark-circle-outline' : 'ban'}
              title={blockedByMe ? 'Unblock' : 'Block'}
              sub={blockedByMe ? 'Let them message you' : 'Stop their messages'}
              danger={!blockedByMe}
              onPress={handleBlockToggle}
            />
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={disappearOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDisappearOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setDisappearOpen(false)}
          />
          <SafeAreaView edges={['bottom']} style={styles.groupSheet}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>Disappearing messages</Text>
            <Text style={styles.sheetSub}>
              New messages vanish for everyone after this long.
            </Text>
            <MenuRow
              icon="infinite-outline"
              title="Off"
              sub="Keep everything"
              checked={disappear === null}
              onPress={() => applyDisappear(null)}
            />
            <MenuRow
              icon="timer-outline"
              title="1 hour"
              checked={disappear === 3600}
              onPress={() => applyDisappear(3600)}
            />
            <MenuRow
              icon="timer-outline"
              title="24 hours"
              checked={disappear === 86400}
              onPress={() => applyDisappear(86400)}
            />
            <MenuRow
              icon="timer-outline"
              title="7 days"
              checked={disappear === 604800}
              onPress={() => applyDisappear(604800)}
            />
            <MenuRow
              icon="timer-outline"
              title="30 days"
              checked={disappear === 2592000}
              onPress={() => applyDisappear(2592000)}
            />
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={addOpen}
        transparent
        onRequestClose={() => setAddOpen(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setAddOpen(false)}
          />
          <View style={styles.menuCard}>
            <Text style={styles.attachTitle}>
              ADD MEMBERS ({candidates.length})
            </Text>
            {candidates.length === 0 ? (
              <Text style={styles.addEmpty}>
                Everyone in the community is already here.
              </Text>
            ) : (
              <ScrollView style={styles.addList}>
                {candidates.map((it) => (
                  <View key={it.userId} style={styles.addRow}>
                    <Text style={styles.addName} numberOfLines={1}>
                      {it.name.toUpperCase()}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      disabled={addingId !== null}
                      onPress={() => handleAddMember(it.userId)}
                    >
                      <Text style={styles.addAction}>
                        {addingId === it.userId ? '…' : 'ADD'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable
              style={[styles.menuBtn, styles.menuBtnGhost]}
              onPress={() => setAddOpen(false)}
            >
              <Text style={[styles.menuBtnText, styles.menuBtnGhostText]}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={attachOpen}
        transparent
        onRequestClose={() => setAttachOpen(false)}
      >
        <View style={styles.dropOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setAttachOpen(false)}
          />
          <View style={styles.attachDropdown}>
            <Pressable style={styles.dropRow} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={20} color={c.paper} />
              <Text style={styles.dropText}>Take photo or video</Text>
            </Pressable>
            <Pressable style={styles.dropRow} onPress={pickPhotoVideo}>
              <Ionicons name="image-outline" size={20} color={c.paper} />
              <Text style={styles.dropText}>Photo or video</Text>
            </Pressable>
            <Pressable style={styles.dropRow} onPress={pickDocument}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={c.paper}
              />
              <Text style={styles.dropText}>Document</Text>
            </Pressable>
            <Pressable style={styles.dropRow} onPress={pickAudio}>
              <Ionicons
                name="musical-notes-outline"
                size={20}
                color={c.paper}
              />
              <Text style={styles.dropText}>Audio</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={pendingPick !== null}
        transparent
        animationType="slide"
        onRequestClose={cancelPreview}
      >
        <View style={styles.previewPage}>
          <SafeAreaView edges={['top']} style={styles.previewTop}>
            <Pressable onPress={cancelPreview} hitSlop={12}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </SafeAreaView>
          <View style={styles.previewMid}>
            {pendingPick?.mime.startsWith('video/') ? (
              <PreviewVideo uri={pendingPick.uri} />
            ) : pendingPick ? (
              <Image
                source={{ uri: pendingPick.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
          {recentAssets.length > 0 && (
            <View style={styles.recentWrap}>
              <Text style={styles.recentTitle}>RECENT</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
              >
                {recentAssets.map((asset) => (
                  <Pressable
                    key={asset.id}
                    onPress={() => swapRecent(asset)}
                    style={styles.recentCell}
                  >
                    {asset.mediaType === 'video' ? (
                      <View style={styles.recentVideo}>
                        <Ionicons name="play" size={20} color="#fff" />
                        {asset.duration > 0 && (
                          <Text style={styles.recentDur}>
                            {Math.round(asset.duration)}s
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Image
                        source={{ uri: asset.uri }}
                        style={styles.recentThumb}
                      />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          <SafeAreaView edges={['bottom']} style={styles.previewBar}>
            <TextInput
              style={styles.previewInput}
              placeholder="Add caption"
              placeholderTextColor="#999"
              value={caption}
              onChangeText={(value) => setCaption(value.slice(0, 1024))}
              multiline
            />
            <Pressable
              style={styles.previewSend}
              onPress={sendPending}
              accessibilityLabel="Send with caption"
            >
              <Ionicons name="send" size={20} color={c.ink} />
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={forwardFor !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!forwarding) {
            setForwardFor(null);
            setForwardTargets(null);
          }
        }}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => {
              if (!forwarding) {
                setForwardFor(null);
                setForwardTargets(null);
              }
            }}
          />
          <SafeAreaView edges={['bottom']} style={styles.forwardSheet}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>Forward to</Text>
            {forwarding && (
              <View style={styles.forwardBusy}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={styles.forwardBusyText}>Forwarding…</Text>
              </View>
            )}
            {forwardTargets === null ? (
              <ActivityIndicator
                style={styles.forwardLoader}
                color={c.ink}
              />
            ) : forwardTargets.length === 0 ? (
              <Text style={styles.funHint}>No other chats yet.</Text>
            ) : (
              <ScrollView style={styles.forwardList}>
                {forwardTargets.map((target) => (
                  <Pressable
                    key={target.id}
                    style={styles.forwardRow}
                    disabled={forwarding}
                    onPress={() => forwardFor && forwardMessage(forwardFor, target)}
                  >
                    <Avatar
                      name={target.title}
                      size={40}
                      uri={target.avatarUrl}
                    />
                    <View style={styles.forwardMid}>
                      <Text style={styles.forwardTitle} numberOfLines={1}>
                        {target.title.toUpperCase()}
                      </Text>
                      <Text style={styles.forwardPreview} numberOfLines={1}>
                        {target.preview || 'Say hello'}
                      </Text>
                    </View>
                    {target.is_group && (
                      <Text style={styles.forwardChip}>GROUP</Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable
              style={[styles.menuBtn, styles.menuBtnGhost]}
              disabled={forwarding}
              onPress={() => {
                setForwardFor(null);
                setForwardTargets(null);
              }}
            >
              <Text style={[styles.menuBtnText, styles.menuBtnGhostText]}>
                Cancel
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={funOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFunOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setFunOpen(false)}
          />
          <SafeAreaView edges={['bottom']} style={styles.funSheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.funTabs}>
              <Pressable onPress={() => setFunTab('stickers')} hitSlop={8}>
                <Text
                  style={[styles.funTab, funTab === 'stickers' && styles.funTabActive]}
                >
                  STICKERS
                </Text>
              </Pressable>
              <Pressable onPress={() => setFunTab('gifs')} hitSlop={8}>
                <Text style={[styles.funTab, funTab === 'gifs' && styles.funTabActive]}>
                  GIFS
                </Text>
              </Pressable>
            </View>
            {funTab === 'stickers' ? (
              <FlatList
                data={STICKERS}
                numColumns={4}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const src = stickerSource(item.id);
                  if (!src) return null;
                  return (
                    <Pressable
                      style={styles.stickerCell}
                      onPress={() => sendSticker(item.id)}
                    >
                      <Image source={src} style={styles.stickerThumb} />
                    </Pressable>
                  );
                }}
              />
            ) : !giphyKey() ? (
              <Text style={styles.funHint}>
                Add EXPO_PUBLIC_GIPHY_KEY to your .env to enable GIFs. Get a
                free key at developers.giphy.com.
              </Text>
            ) : (
              <>
                <View style={styles.gifSearchRow}>
                  <TextInput
                    style={styles.gifInput}
                    placeholder="Search GIFs"
                    placeholderTextColor={c.subtext}
                    value={gifQuery}
                    onChangeText={setGifQuery}
                    onSubmitEditing={runGifSearch}
                    returnKeyType="search"
                  />
                  <Pressable
                    style={styles.gifGo}
                    onPress={runGifSearch}
                    disabled={gifLoading}
                  >
                    <Ionicons name="search" size={20} color={c.paper} />
                  </Pressable>
                </View>
                {gifLoading && gifResults === null ? (
                  <ActivityIndicator
                    style={styles.forwardLoader}
                    color={c.ink}
                  />
                ) : (gifResults ?? []).length === 0 ? (
                  <Text style={styles.funHint}>
                    {gifQuery ? 'No GIFs found.' : 'Trending GIFs appear here.'}
                  </Text>
                ) : (
                  <FlatList
                    data={gifResults ?? []}
                    numColumns={3}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <Pressable
                        style={styles.gifCell}
                        onPress={() => sendGif(item)}
                      >
                        <Image
                          source={{ uri: item.previewUrl }}
                          style={styles.gifThumb}
                        />
                      </Pressable>
                    )}
                  />
                )}
              </>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  page: { flex: 1, backgroundColor: c.paper },
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
  list: { padding: 16, gap: 8 },
  notice: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  older: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  olderText: { fontSize: 12, fontWeight: '800', color: c.subtext },
  dayLine: { alignSelf: 'center', marginVertical: 8 },
  dayLineText: {
    fontSize: 11,
    fontWeight: '800',
    color: c.subtext,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.l,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: c.ink },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
  },
  tailMine: { borderBottomRightRadius: 4 },
  tailTheirs: { borderBottomLeftRadius: 4 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowGrouped: { marginTop: -5 },
  avatarSpacer: { width: 28 },
  bubbleInRow: { flexShrink: 1 },
  bubbleText: { fontSize: 15, color: c.text, lineHeight: 21 },
  bubbleTextMine: { color: c.paper },
  bubbleTextMissed: { color: c.danger, fontWeight: '700' },
  bubbleTextAnswered: { color: c.success, fontWeight: '700' },
  bubbleTime: { fontSize: 10, color: c.subtext, marginTop: 4 },
  bubbleTimeMine: { color: '#B9B9BE' },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: c.subtext,
    paddingLeft: 8,
    marginBottom: 6,
  },
  quoteMine: { borderLeftColor: c.paper },
  quoteName: { fontSize: 12, fontWeight: '800', color: c.text },
  quoteBody: { fontSize: 13, color: c.subtext, marginTop: 2 },
  quoteTextMine: { color: c.paper },
  reacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    maxWidth: '80%',
  },
  reactsMine: { alignSelf: 'flex-end' },
  reactsTheirs: { alignSelf: 'flex-start' },
  reactChip: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactChipMine: { borderColor: c.ink },
  reactText: { fontSize: 13 },
  composerSafe: { backgroundColor: c.paper },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
  },
  replyMid: { flex: 1 },
  replyName: { fontSize: 12, fontWeight: '800', color: c.text },
  replyBody: { fontSize: 13, color: c.subtext, marginTop: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
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
  recCancel: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recMid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger },
  recTime: { fontSize: 15, fontWeight: '700', color: c.text },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuCard: {
    width: '100%',
    backgroundColor: c.paper,
    borderRadius: radius.l,
    padding: 16,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  emoji: { fontSize: 28 },
  menuBtn: {
    marginTop: 8,
    backgroundColor: c.ink,
    borderRadius: radius.m,
    paddingVertical: 12,
    alignItems: 'center',
  },
  menuBtnText: { fontSize: 15, fontWeight: '800', color: c.paper },
  menuBtnDanger: { backgroundColor: c.danger },
  menuBtnGhost: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
  menuBtnGhostText: { color: c.text },
  addList: { maxHeight: 320 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  addName: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
  addAction: { fontSize: 13, fontWeight: '800', color: c.primary },
  addEmpty: { fontSize: 14, color: c.subtext, paddingVertical: 8 },
  attachTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
    marginBottom: 4,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  dropOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  attachDropdown: {
    position: 'absolute',
    left: 12,
    bottom: 100,
    backgroundColor: c.ink,
    borderRadius: radius.l,
    padding: 6,
    minWidth: 230,
  },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.m,
  },
  dropText: { fontSize: 14, fontWeight: '600', color: c.paper },
  groupSheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    maxHeight: '85%',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  menuDanger: { color: c.danger },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.paper,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: c.text,
    paddingVertical: 6,
  },
  searchCount: { fontSize: 12, fontWeight: '700', color: c.subtext },
  searchHit: { borderWidth: 2, borderColor: c.accent },
  blockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: c.bg,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingVertical: 8,
  },
  blockText: { fontSize: 13, color: c.subtext },
  blockAction: { fontSize: 13, fontWeight: '800', color: c.primary },
  vanishBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  vanishText: { fontSize: 11, fontWeight: '700', color: c.subtext },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text },
  sheetSub: { fontSize: 13, color: c.subtext, marginTop: 2, marginBottom: 8 },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  attachIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachMid: { flex: 1 },
  attachName: { fontSize: 15, fontWeight: '700', color: c.text },
  attachSub: { fontSize: 12, color: c.subtext, marginTop: 2 },
  uploadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
  },
  uploadText: { fontSize: 13, fontWeight: '600', color: c.text },
  bubbleSticker: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 4,
  },
  sticker: { width: 96, height: 96, borderRadius: 14 },
  previewPage: { flex: 1, backgroundColor: '#000' },
  previewTop: { paddingHorizontal: 16, paddingVertical: 12 },
  previewMid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%' },
  previewVideo: { width: '100%', height: '100%' },
  recentWrap: { paddingTop: 8 },
  recentTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#999',
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  recentRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  recentCell: { borderRadius: 8, overflow: 'hidden' },
  recentThumb: { width: 64, height: 64, borderRadius: 8 },
  recentVideo: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  recentDur: { fontSize: 10, fontWeight: '700', color: '#fff' },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  previewInput: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    maxHeight: 110,
  },
  previewSend: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardSheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    maxHeight: '80%',
  },
  forwardBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  forwardBusyText: { fontSize: 13, fontWeight: '600', color: c.text },
  forwardLoader: { marginVertical: 24 },
  forwardList: { marginTop: 8 },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  forwardMid: { flex: 1 },
  forwardTitle: { fontSize: 14, fontWeight: '800', color: c.text },
  forwardPreview: { fontSize: 12, color: c.subtext, marginTop: 2 },
  forwardChip: {
    fontSize: 10,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
  },
  funSheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    height: '70%',
  },
  funTabs: { flexDirection: 'row', gap: 24, marginVertical: 12 },
  funTab: {
    fontSize: 13,
    fontWeight: '800',
    color: c.subtext,
    letterSpacing: 1,
  },
  funTabActive: { color: c.text },
  funHint: {
    fontSize: 14,
    color: c.subtext,
    textAlign: 'center',
    lineHeight: 21,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  stickerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  stickerThumb: { width: 56, height: 56, borderRadius: 12 },
  gifSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  gifInput: {
    flex: 1,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: c.text,
  },
  gifGo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gifCell: { flex: 1, padding: 3 },
  gifThumb: { height: 88, borderRadius: 10 },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '800',
    color: c.primary,
    flexShrink: 1,
  },
  deletedText: { fontStyle: 'italic', opacity: 0.75 },
  attach: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: c.ink,
    borderRadius: radius.m,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  callBannerMid: { flex: 1 },
  callBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: c.paper,
  },
  callBannerBody: { fontSize: 12, color: '#B9B9BE', marginTop: 2 },
  callJoin: {
    backgroundColor: c.primary,
    borderRadius: radius.m,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  callJoinText: { fontSize: 13, fontWeight: '800', color: c.paper },
});
}
