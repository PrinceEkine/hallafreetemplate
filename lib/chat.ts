import {
  decryptFromPeer,
  encryptForPeer,
  getMyKeypair,
  parseEnvelope,
} from './e2ee';
import { withTimeout } from './net';
import { supabase } from './supabase';
import { mediaLabel } from './media';
import { stickerLabel } from './stickers';
import { publicUrl } from './uploads';
import { parseVoiceDescriptor, voiceLabel } from './voice';

export type ConversationListItem = {
  id: string;
  title: string;
  avatarUrl: string | null;
  preview: string;
  at: string | null;
  unread: boolean;
  is_group: boolean;
  community_id: string | null;
};

type ParticipantRow = {
  last_read_at: string;
  conversation: {
    id: string;
    title: string;
    is_group: boolean;
    community_id: string | null;
    last_message_preview: string;
    last_message_at: string | null;
    last_message_sender_id?: string | null;
  } | null;
};

const PARTICIPANT_SELECT_WITH_SENDER =
  'last_read_at,conversation:conversations(id,title,is_group,community_id,last_message_preview,last_message_at,last_message_sender_id)';
const PARTICIPANT_SELECT_BASE =
  'last_read_at,conversation:conversations(id,title,is_group,community_id,last_message_preview,last_message_at)';

type OtherRow = {
  conversation_id: string;
  profile: { full_name: string | null; avatar_url: string | null } | null;
};

export async function listConversations(): Promise<ConversationListItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const withSender = await supabase
    .from('conversation_participants')
    .select(PARTICIPANT_SELECT_WITH_SENDER)
    .eq('user_id', user.id);
  let data = withSender.data;
  let error = withSender.error;
  if (error && isColumnError(error)) {
    // Backend predates 20261113_chat_read.sql: fall back to the old shape.
    const fallback = await supabase
      .from('conversation_participants')
      .select(PARTICIPANT_SELECT_BASE)
      .eq('user_id', user.id);
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error || !data) return [];
  const rows = (data as unknown as ParticipantRow[]).filter(
    (r) => r.conversation !== null,
  );
  const ids = rows.map((r) => r.conversation!.id);
  const names = new Map<string, string>();
  const avatars = new Map<string, string>();
  if (ids.length > 0) {
    const { data: others } = await supabase
      .from('conversation_participants')
      .select(
        'conversation_id,profile:profiles!conversation_participants_user_id_fkey(full_name,avatar_url)',
      )
      .in('conversation_id', ids)
      .neq('user_id', user.id);
    for (const o of (others as unknown as OtherRow[]) ?? []) {
      if (!names.has(o.conversation_id)) {
        names.set(o.conversation_id, o.profile?.full_name ?? 'Staff Member');
        if (o.profile?.avatar_url) {
          avatars.set(o.conversation_id, publicUrl('avatars', String(o.profile.avatar_url)));
        }
      }
    }
  }
  return rows
    .map((r) => {
      const c = r.conversation!;
      return {
        id: c.id,
        is_group: c.is_group,
        community_id: c.community_id ?? null,
        title:
          c.is_group && c.title ? c.title : (names.get(c.id) ?? 'Chat'),
        avatarUrl: !c.is_group ? (avatars.get(c.id) ?? null) : null,
        preview: missedCallDisplay(
          c.last_message_preview,
          c.last_message_sender_id ?? '',
          user.id,
        ),
        at: c.last_message_at,
        unread:
          !!c.last_message_at &&
          new Date(c.last_message_at) > new Date(r.last_read_at) &&
          (c.last_message_sender_id ?? null) !== user.id,
      };
    })
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export const REDACTED_PREVIEW = '[Encrypted message]';

function previewText(plain: string): string {
  const voice = parseVoiceDescriptor(plain);
  const text = stickerLabel(voice ? voiceLabel(plain) : mediaLabel(plain));
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

/**
 * Best-effort plaintext previews for encrypted chats: the server only
 * stores a redacted label, but this device holds the keys, so open the
 * latest message per conversation locally. Never throws; anything that
 * cannot be opened keeps its stored preview. Slow networks resolve to
 * the stored previews instead of hanging the list.
 */
export async function resolvePreviews(
  items: ConversationListItem[],
): Promise<Record<string, string>> {
  try {
    return await withTimeout(resolvePreviewsInner(items));
  } catch {
    return {};
  }
}

async function resolvePreviewsInner(
  items: ConversationListItem[],
): Promise<Record<string, string>> {
  try {
    const targets = items.filter(
      (c) => c.preview === REDACTED_PREVIEW && c.at,
    );
    if (targets.length === 0) return {};
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return {};
    const ids = targets.map((c) => c.id);
    const isGroup = new Map(targets.map((c) => [c.id, c.is_group]));
    const { data: msgs } = await supabase
      .from('messages')
      .select('id,conversation_id,body,sender_id')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(200);
    type LastRow = {
      id: string;
      conversation_id: string;
      body: string;
      sender_id: string;
    };
    const latest = new Map<string, LastRow>();
    for (const m of ((msgs as unknown as LastRow[]) ?? [])) {
      const cid = String(m.conversation_id);
      if (!latest.has(cid) && ids.includes(cid)) latest.set(cid, m);
    }
    if (latest.size === 0) return {};
    const [mine, parts, envelopes] = await Promise.all([
      getMyKeypair().catch(() => null),
      supabase
        .from('conversation_participants')
        .select(
          'conversation_id,user_id,profile:profiles!conversation_participants_user_id_fkey(public_key)',
        )
        .in('conversation_id', [...latest.keys()])
        .neq('user_id', user.id),
      getMyEnvelopes([...latest.values()].map((m) => String(m.id))).catch(
        (): Record<string, string> => ({}),
      ),
    ]);
    if (!mine) return {};
    type PartRow = {
      conversation_id: string;
      user_id: string;
      profile: { public_key: string | null } | null;
    };
    const keyByUser = new Map<string, string>();
    const peerByConvo = new Map<string, string>();
    for (const p of ((parts.data as unknown as PartRow[]) ?? [])) {
      const key = p.profile?.public_key ?? null;
      if (!key) continue;
      keyByUser.set(`${p.conversation_id}:${p.user_id}`, key);
      if (!peerByConvo.has(String(p.conversation_id))) {
        peerByConvo.set(String(p.conversation_id), key);
      }
    }
    const out: Record<string, string> = {};
    for (const [cid, m] of latest) {
      const envelope = parseEnvelope(String(m.body));
      if (!envelope) continue;
      let plain: string | null = null;
      if (!isGroup.get(cid)) {
        const peerKey = peerByConvo.get(cid);
        if (peerKey) plain = await decryptFromPeer(envelope, peerKey);
      } else if (String(m.sender_id) === user.id) {
        plain = await decryptFromPeer(envelope, mine.publicKey);
      } else {
        const row = envelopes[String(m.id)];
        const senderKey = keyByUser.get(`${cid}:${m.sender_id}`) ?? null;
        if (row && senderKey) {
          const rowEnvelope = parseEnvelope(row);
          plain = rowEnvelope
            ? await decryptFromPeer(rowEnvelope, senderKey)
            : null;
        }
      }
      if (plain) {
        out[cid] = missedCallDisplay(
          previewText(plain),
          String(m.sender_id),
          user.id,
        );
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Decrypt one pushed message for the rich notification path. Returns null
 * when anything is missing (keys, envelopes, network) so the caller keeps
 * the generic push. Never throws.
 */
export async function decryptPushBody(
  conversationId: string,
  messageId: string,
  cipher: string,
  senderId: string,
): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const envelope = parseEnvelope(cipher);
    if (!envelope) return null;
    const [mine, peer, envelopes] = await Promise.all([
      getMyKeypair().catch(() => null),
      getDmPeerInfo(conversationId).catch(() => null),
      getMyEnvelopes([messageId]).catch((): Record<string, string> => ({})),
    ]);
    if (!mine) return null;
    if (peer && !peer.isGroup) {
      if (!peer.peerKey) return null;
      return await decryptFromPeer(envelope, peer.peerKey);
    }
    if (senderId === user.id) {
      return await decryptFromPeer(envelope, mine.publicKey);
    }
    const row = envelopes[messageId];
    if (!row) return null;
    const { data: sender } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', senderId)
      .single();
    const senderKey =
      (sender as { public_key?: string } | null)?.public_key ?? null;
    if (!senderKey) return null;
    const rowEnvelope = parseEnvelope(row);
    return rowEnvelope
      ? await decryptFromPeer(rowEnvelope, senderKey)
      : null;
  } catch {
    return null;
  }
}

/**
 * Heals keyless-era group messages: re-seals my own recent messages for
 * members who have keys now, inserting only envelopes that do not exist
 * yet. Fire-and-forget from the thread screen, throttled there.
 */
export async function backfillOwnEnvelopes(
  conversationId: string,
  messages: { id: string; body: string; sender_id: string }[],
): Promise<number> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;
    const own = messages.filter(
      (m) => m.sender_id === user.id && parseEnvelope(m.body),
    );
    if (own.length === 0) return 0;
    const [mine, keys] = await Promise.all([
      getMyKeypair().catch(() => null),
      getGroupMemberKeys(conversationId).catch((): GroupMemberKey[] => []),
    ]);
    if (!mine) return 0;
    const keyed = keys.filter((k) => k.userId !== user.id && k.publicKey);
    if (keyed.length === 0) return 0;
    const items: { message_id: string; recipient_id: string; envelope: string }[] =
      [];
    for (const m of own.slice(-50)) {
      const envelope = parseEnvelope(m.body);
      if (!envelope) continue;
      const plain = await decryptFromPeer(envelope, mine.publicKey);
      if (!plain) continue;
      for (const k of keyed) {
        items.push({
          message_id: m.id,
          recipient_id: k.userId,
          envelope: await encryptForPeer(plain, k.publicKey as string),
        });
      }
    }
    if (items.length === 0) return 0;
    const { data, error } = await supabase.rpc('backfill_group_envelopes', {
      p_items: items,
    });
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}

export async function unreadCommunityIds(): Promise<Set<string>> {
  const convos = await listConversations().catch((): ConversationListItem[] => []);
  const ids = new Set<string>();
  for (const c of convos) {
    if (c.unread && c.community_id) ids.add(c.community_id);
  }
  return ids;
}

export type Message = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  /** Send-time disappearing expiry; undefined on backends predating it. */
  expires_at?: string | null;
};

const MESSAGE_SELECT_FULL =
  'id,body,created_at,sender_id,reply_to,edited_at,deleted_at,expires_at';
const MESSAGE_SELECT_WITH_REPLY = 'id,body,created_at,sender_id,reply_to';
const MESSAGE_SELECT_BASE = 'id,body,created_at,sender_id';

type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  reply_to?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  expires_at?: string | null;
};

function mapMessage(row: MessageRow): Message {
  return {
    id: String(row.id),
    body: String(row.body),
    created_at: String(row.created_at),
    sender_id: String(row.sender_id),
    reply_to: row.reply_to ? String(row.reply_to) : null,
    edited_at: row.edited_at ? String(row.edited_at) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    expires_at: row.expires_at ? String(row.expires_at) : null,
  };
}

function isColumnError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'PGRST204' || code === 'PGRST205' || code === '42P01') {
    return true;
  }
  const message =
    err instanceof Error
      ? err.message
      : String((err as { message?: string } | null)?.message ?? '');
  return /column|schema cache/i.test(message);
}

export async function getConversationTitle(
  conversationId: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('conversations')
    .select('title,is_group')
    .eq('id', conversationId)
    .single();
  if (!data) return 'Chat';
  if (data.is_group && data.title) return String(data.title);
  const { data: others } = await supabase
    .from('conversation_participants')
    .select('profile:profiles!conversation_participants_user_id_fkey(full_name)')
    .eq('conversation_id', conversationId)
    .neq('user_id', user?.id ?? '');
  const first = (
    (others as unknown as { profile: { full_name: string | null } | null }[]) ??
    []
  )[0];
  return first?.profile?.full_name ?? 'Chat';
}

async function selectMessages(
  conversationId: string,
  opts: { before?: string; limit: number },
): Promise<Message[]> {
  // Newest backends carry edited_at/deleted_at; older ones predate replies
  // entirely. Each shape falls through to the next on a column error.
  const shapes = [
    MESSAGE_SELECT_FULL,
    MESSAGE_SELECT_WITH_REPLY,
    MESSAGE_SELECT_BASE,
  ];
  let lastError: unknown = null;
  for (const shape of shapes) {
    try {
      let query = supabase
        .from('messages')
        .select(shape)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(opts.limit);
      if (opts.before) query = query.lt('created_at', opts.before);
      const { data, error } = await query;
      if (error) throw error;
      return ((data as unknown as MessageRow[]) ?? [])
        .reverse()
        .map(mapMessage);
    } catch (err) {
      if (!isColumnError(err)) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error('Could not load messages.');
}

export async function getMessages(
  conversationId: string,
): Promise<Message[]> {
  return selectMessages(conversationId, { limit: 50 });
}

export async function sendMessage(
  conversationId: string,
  body: string,
  opts: { replyTo?: string | null } = {},
): Promise<Message | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const base: {
    conversation_id: string;
    sender_id: string;
    body: string;
    reply_to?: string | null;
  } = {
    conversation_id: conversationId,
    sender_id: user.id,
    body: body.trim(),
  };
  async function attempt(withReply: boolean) {
    return supabase
      .from('messages')
      .insert(
        withReply && opts.replyTo ? { ...base, reply_to: opts.replyTo } : base,
      )
      .select('id,body,created_at,sender_id')
      .single();
  }
  let { data, error } = await attempt(true);
  if (error && opts.replyTo && isColumnError(error)) {
    ({ data, error } = await attempt(false));
  }
  if (error) throw error;
  if (!data) return null;
  await markRead(conversationId);
  return {
    ...mapMessage(data as unknown as MessageRow),
    reply_to: opts.replyTo ?? null,
  };
}

/**
 * Log a missed 1-1 call as a normal chat message ("Missed voice call" /
 * "Missed video call") so it carries the thread's usual timestamp. Sealed
 * like any DM text when the peer key is known, plaintext otherwise.
 */
export async function logMissedCall(
  conversationId: string,
  media: 'voice' | 'video',
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const label = media === 'video' ? 'Missed video call' : 'Missed voice call';
  let body = label;
  try {
    const peer = await getDmPeerInfo(conversationId);
    if (!peer.isGroup && peer.peerKey) {
      body = await encryptForPeer(label, peer.peerKey);
    }
  } catch {
    // Fall through to plaintext: the thread renders raw bodies as-is.
  }
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body,
  });
  if (error) throw error;
  await markRead(conversationId).catch(() => {});
}

/**
 * Log an answered 1-1 call ("Voice call • 1:05") the same way: sealed for
 * DMs so only participants read it, plaintext fallback otherwise. Only
 * the starter writes, so it lands exactly once per call.
 */
export async function logAnsweredCall(
  conversationId: string,
  media: 'voice' | 'video',
  seconds: number,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const clock = `${Math.floor(Math.max(0, seconds) / 60)}:${String(
    Math.max(0, seconds) % 60,
  ).padStart(2, '0')}`;
  const label = `${media === 'video' ? 'Video' : 'Voice'} call • ${clock}`;
  let body = label;
  try {
    const peer = await getDmPeerInfo(conversationId);
    if (!peer.isGroup && peer.peerKey) {
      body = await encryptForPeer(label, peer.peerKey);
    }
  } catch {
    // Fall through to plaintext: the thread renders raw bodies as-is.
  }
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body,
  });
  if (error) throw error;
  await markRead(conversationId).catch(() => {});
}

/**
 * Call-entry tone for threads and previews: missed labels (both sides'
 * wording) read red, answered entries green, everything else default.
 */
export function callLabelTone(body: string): 'missed' | 'answered' | null {
  if (
    body === 'Missed voice call' ||
    body === 'Missed video call' ||
    body === 'Call not answered'
  ) {
    return 'missed';
  }
  if (/^(Voice|Video) call • \d+:\d{2}$/.test(body)) return 'answered';
  return null;
}

/**
 * Per-side missed-call wording: the caller who was never answered sees
 * "Call not answered"; the person who missed it keeps
 * "Missed voice/video call".
 */
export function missedCallDisplay(
  body: string,
  senderId: string,
  myId: string | null,
): string {
  if (
    (body === 'Missed voice call' || body === 'Missed video call') &&
    myId !== null &&
    senderId === myId
  ) {
    return 'Call not answered';
  }
  return body;
}

export async function markRead(conversationId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);
}

export async function createDm(
  otherId: string,
  communityId: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_dm', {
    p_other: otherId,
    p_community: communityId,
  });
  if (error) throw error;
  return String(data);
}

/**
 * The existing 1-1 conversation with a peer, or null when there is none.
 * Unlike createDm this never writes: screens that only want the current
 * DM state (the member profile's timer row) must not spawn empty chats.
 */
export async function findDm(peerId: string): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || peerId === user.id) return null;
    const { data: mine } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);
    const ids = (
      (mine as unknown as { conversation_id: string }[]) ?? []
    ).map((r) => String(r.conversation_id));
    if (ids.length === 0) return null;
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', ids)
      .eq('user_id', peerId);
    const candidates = (
      (shared as unknown as { conversation_id: string }[]) ?? []
    ).map((r) => String(r.conversation_id));
    if (candidates.length === 0) return null;
    const { data: dm } = await supabase
      .from('conversations')
      .select('id')
      .in('id', candidates)
      .eq('is_group', false)
      .limit(1)
      .maybeSingle();
    return dm ? String((dm as { id: string }).id) : null;
  } catch {
    return null;
  }
}

export async function createGroup(
  communityId: string,
  title: string,
  memberIds: string[],
): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', {
    p_community: communityId,
    p_title: title,
    p_members: memberIds,
  });
  if (error) throw error;
  return String(data);
}

export function subscribeToMessages(
  conversationId: string,
  onInsert: (m: Message) => void,
  onUpdate?: (m: Message) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onInsert(mapMessage(payload.new as unknown as MessageRow));
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onUpdate?.(mapMessage(payload.new as unknown as MessageRow));
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export type ChattablePerson = {
  id: string;
  name: string;
  communityId: string;
  communityName: string;
};

export async function listChattablePeople(): Promise<ChattablePerson[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mine } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('user_id', user.id)
    .eq('status', 'active');
  const ids = ((mine as unknown as { community_id: string }[]) ?? []).map(
    (m) => m.community_id,
  );
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('community_members')
    .select(
      'user_id,community_id,profile:profiles!community_members_user_id_fkey(full_name),community:communities!community_members_community_id_fkey(name)',
    )
    .in('community_id', ids)
    .eq('status', 'active')
    .neq('user_id', user.id);
  type Row = {
    user_id: string;
    community_id: string;
    profile: { full_name: string | null } | null;
    community: { name: string } | null;
  };
  const seen = new Set<string>();
  const out: ChattablePerson[] = [];
  for (const r of (data as unknown as Row[]) ?? []) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    out.push({
      id: r.user_id,
      name: r.profile?.full_name ?? 'Staff Member',
      communityId: r.community_id,
      communityName: r.community?.name ?? 'Community',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type DmPeerInfo = {
  isGroup: boolean;
  peerId: string | null;
  peerKey: string | null;
  /** Raw avatar storage path for the thread header (absent on old callers). */
  peerAvatar?: string | null;
};

export async function getDmPeerInfo(
  conversationId: string,
): Promise<DmPeerInfo> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: convo } = await supabase
    .from('conversations')
    .select('is_group')
    .eq('id', conversationId)
    .single();
  if (!convo || (convo as { is_group: boolean }).is_group) {
    return { isGroup: true, peerId: null, peerKey: null };
  }
  try {
    const { data, error } = await supabase
      .from('conversation_participants')
      .select(
        'user_id,profile:profiles!conversation_participants_user_id_fkey(public_key,avatar_url)',
      )
      .eq('conversation_id', conversationId)
      .neq('user_id', user?.id ?? '');
    if (error) throw error;
    const row = (
      (data as unknown as {
        user_id: string;
        profile: { public_key: string | null; avatar_url: string | null } | null;
      }[]) ?? []
    )[0];
    if (!row) return { isGroup: false, peerId: null, peerKey: null };
    return {
      isGroup: false,
      peerId: String(row.user_id),
      peerKey: row.profile?.public_key ?? null,
      peerAvatar: row.profile?.avatar_url ?? null,
    };
  } catch {
    return { isGroup: false, peerId: null, peerKey: null };
  }
}

export async function getMessagesBefore(
  conversationId: string,
  beforeIso: string,
  limit = 30,
): Promise<Message[]> {
  return selectMessages(conversationId, { before: beforeIso, limit });
}

export type CommunityGroup = {
  id: string;
  title: string;
  preview: string;
  at: string | null;
  memberCount: number;
  joined: boolean;
};

export async function listCommunityGroups(
  communityId: string,
): Promise<CommunityGroup[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('conversations')
      .select('id,title,last_message_preview,last_message_at')
      .eq('community_id', communityId)
      .eq('is_group', true)
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    type Row = {
      id: string;
      title: string;
      last_message_preview: string;
      last_message_at: string | null;
    };
    const rows = (data as unknown as Row[]) ?? [];
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const { data: parts } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .in('conversation_id', ids);
      for (const p of (parts as unknown as { conversation_id: string }[]) ??
        []) {
        counts.set(p.conversation_id, (counts.get(p.conversation_id) ?? 0) + 1);
      }
      if (user) {
        const { data: joined } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id)
          .in('conversation_id', ids);
        for (const p of (joined as unknown as {
          conversation_id: string;
        }[]) ?? []) {
          mine.add(String(p.conversation_id));
        }
      }
    }
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title || 'Group'),
      preview: String(r.last_message_preview ?? ''),
      at: r.last_message_at ? String(r.last_message_at) : null,
      memberCount: counts.get(r.id) ?? 0,
      joined: mine.has(String(r.id)),
    }));
  } catch {
    return [];
  }
}

export async function joinGroup(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('join_group', {
    p_conversation: conversationId,
  });
  if (error) throw error;
}

export async function leaveGroupChat(
  conversationId: string,
): Promise<'left' | 'deleted'> {
  const { data, error } = await supabase.rpc('leave_group_chat', {
    p_conversation: conversationId,
  });
  if (error) throw error;
  if (data !== 'left' && data !== 'deleted') {
    throw new Error('Could not leave.');
  }
  return data;
}

export async function deleteGroupChat(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_group_chat', {
    p_conversation: conversationId,
  });
  if (error) throw error;
}

export type Reaction = { emoji: string; count: number; mine: boolean };

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .single();
  if (existing && (existing as { emoji: string }).emoji === emoji) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('message_reactions').upsert(
    { message_id: messageId, user_id: user.id, emoji },
    { onConflict: 'message_id,user_id' },
  );
  if (error) throw error;
}

export async function listReactions(
  messageIds: string[],
): Promise<Record<string, Reaction[]>> {
  if (messageIds.length === 0) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  try {
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id,emoji,user_id')
      .in('message_id', messageIds);
    if (error) throw error;
    const grouped: Record<
      string,
      Record<string, { count: number; mine: boolean }>
    > = {};
    for (const r of (data as unknown as {
      message_id: string;
      emoji: string;
      user_id: string;
    }[]) ?? []) {
      const mid = String(r.message_id);
      grouped[mid] ??= {};
      const slot = grouped[mid][r.emoji] ?? { count: 0, mine: false };
      slot.count += 1;
      if (r.user_id === user?.id) slot.mine = true;
      grouped[mid][r.emoji] = slot;
    }
    const out: Record<string, Reaction[]> = {};
    for (const [mid, emojis] of Object.entries(grouped)) {
      out[mid] = Object.entries(emojis)
        .map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
        .sort((a, b) => b.count - a.count);
    }
    return out;
  } catch {
    return {};
  }
}

export type ReadState = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string;
};

export async function getReadStates(
  conversationId: string,
): Promise<ReadState[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('conversation_participants')
    .select(
      'user_id,last_read_at,profile:profiles!conversation_participants_user_id_fkey(full_name,avatar_url)',
    )
    .eq('conversation_id', conversationId)
    .neq('user_id', user?.id ?? '');
  type Row = {
    user_id: string;
    last_read_at: string;
    profile: { full_name: string | null; avatar_url: string | null } | null;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    userId: String(r.user_id),
    name: r.profile?.full_name ?? 'Staff Member',
    avatarUrl: r.profile?.avatar_url ? publicUrl('avatars', String(r.profile.avatar_url)) : null,
    lastReadAt: String(r.last_read_at),
  }));
}

export type GroupMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  mine: boolean;
};

export type GroupProfile = {
  id: string;
  title: string;
  about: string;
  iconUrl: string | null;
  isGroup: boolean;
  muted: boolean;
  communityId: string | null;
  members: GroupMember[];
};

export async function getGroupProfile(
  conversationId: string,
): Promise<GroupProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const full = await supabase
    .from('conversations')
    .select('id,title,about,avatar_url,is_group,community_id')
    .eq('id', conversationId)
    .single();
  let convo: unknown = full.data;
  if (full.error) {
    if (!isColumnError(full.error)) throw full.error;
    // Stale backend without the profile columns.
    const legacy = await supabase
      .from('conversations')
      .select('id,title,is_group,community_id')
      .eq('id', conversationId)
      .single();
    if (legacy.error || !legacy.data) return null;
    convo = legacy.data;
  }
  if (!convo) return null;
  const { data: parts } = await supabase
    .from('conversation_participants')
    .select(
      'user_id,muted,profile:profiles!conversation_participants_user_id_fkey(full_name,avatar_url)',
    )
    .eq('conversation_id', conversationId);
  type Row = {
    user_id: string;
    muted: boolean | null;
    profile: { full_name: string | null; avatar_url: string | null } | null;
  };
  const rows = (parts as unknown as Row[]) ?? [];
  const mine = rows.find((r) => String(r.user_id) === user?.id);
  const about = String(
    (convo as { about?: string | null }).about ?? '',
  );
  const iconPath = (convo as { avatar_url?: string | null }).avatar_url;
  return {
    id: String((convo as { id: string }).id),
    title: String((convo as { title: string }).title || 'Group'),
    about,
    iconUrl: iconPath ? publicUrl('group-avatars', String(iconPath)) : null,
    isGroup: !!(convo as { is_group: boolean }).is_group,
    muted: mine?.muted === true,
    communityId:
      (convo as { community_id: string | null }).community_id ?? null,
    members: rows.map((r) => ({
      userId: String(r.user_id),
      name: r.profile?.full_name ?? 'Staff Member',
      avatarUrl: r.profile?.avatar_url
        ? publicUrl('avatars', String(r.profile.avatar_url))
        : null,
      mine: String(r.user_id) === user?.id,
    })),
  };
}

export async function addGroupMembers(
  conversationId: string,
  userIds: string[],
): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data, error } = await supabase
    .from('conversation_participants')
    .upsert(
      unique.map((userId) => ({
        conversation_id: conversationId,
        user_id: userId,
      })),
      { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
    )
    .select('user_id');
  if (error) throw error;
  return (data as unknown as { user_id: string }[]).length;
}

/** Admins change the group icon and about (server-enforced). */
export async function setGroupProfile(
  conversationId: string,
  input: { about?: string; avatarPath?: string | null },
): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (input.about !== undefined) patch.about = input.about.trim();
  if (input.avatarPath !== undefined) patch.avatar_url = input.avatarPath;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('id', conversationId);
  if (error) throw error;
}

export async function setConversationMuted(
  conversationId: string,
  muted: boolean,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('conversation_participants')
    .update({ muted })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);
  if (error) throw error;
}

/**
 * Community admins/owners inside a group chat, for the "A" membership tag.
 * Group chats have no separate roles: adminship comes from the community.
 */
export async function getGroupAdminIds(
  conversationId: string,
): Promise<Set<string>> {
  try {
    const { data: convo } = await supabase
      .from('conversations')
      .select('community_id')
      .eq('id', conversationId)
      .single();
    const communityId = (convo as { community_id: string | null } | null)
      ?.community_id;
    if (!communityId) return new Set();
    const { data } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId)
      .eq('status', 'active')
      .in('role', ['owner', 'admin']);
    return new Set(
      ((data as unknown as { user_id: string }[]) ?? []).map((r) =>
        String(r.user_id),
      ),
    );
  } catch {
    return new Set();
  }
}

export function subscribeToReadStates(
  conversationId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`reads:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_participants',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => {
        onChange();
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function getMessageBodies(
  messageIds: string[],
): Promise<
  Record<string, { body: string; senderName: string; senderId: string }>
> {
  const unique = [...new Set(messageIds)].filter(Boolean);
  if (unique.length === 0) return {};
  const { data } = await supabase
    .from('messages')
    .select('id,body,sender_id,sender:profiles!messages_sender_id_fkey(full_name)')
    .in('id', unique);
  const out: Record<
    string,
    { body: string; senderName: string; senderId: string }
  > = {};
  for (const r of (data as unknown as {
    id: string;
    body: string;
    sender_id: string;
    sender: { full_name: string | null } | null;
  }[]) ?? []) {
    out[String(r.id)] = {
      body: String(r.body),
      senderName: r.sender?.full_name ?? 'Staff Member',
      senderId: String(r.sender_id),
    };
  }
  return out;
}

export type GroupMemberKey = { userId: string; publicKey: string | null };

export async function getGroupMemberKeys(
  conversationId: string,
): Promise<GroupMemberKey[]> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select(
      'user_id,profile:profiles!conversation_participants_user_id_fkey(public_key)',
    )
    .eq('conversation_id', conversationId);
  if (error) throw error;
  return ((data as unknown as {
    user_id: string;
    profile: { public_key: string | null } | null;
  }[]) ?? []).map((r) => ({
    userId: String(r.user_id),
    publicKey: r.profile?.public_key ?? null,
  }));
}

export async function getMyEnvelopes(
  messageIds: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(messageIds)].filter(Boolean);
  if (unique.length === 0) return {};
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  try {
    const { data, error } = await supabase
      .from('message_envelopes')
      .select('message_id,envelope')
      .in('message_id', unique)
      .eq('recipient_id', user.id);
    if (error) throw error;
    const out: Record<string, string> = {};
    for (const r of (data as unknown as {
      message_id: string;
      envelope: string;
    }[]) ?? []) {
      out[String(r.message_id)] = String(r.envelope);
    }
    return out;
  } catch {
    return {};
  }
}

export async function sendGroupMessage(
  conversationId: string,
  body: string,
  envelopes: { recipientId: string; envelope: string }[],
  opts: { replyTo?: string | null } = {},
): Promise<string> {
  const { data, error } = await supabase.rpc('send_group_message', {
    p_conversation: conversationId,
    p_body: body,
    p_reply_to: opts.replyTo ?? null,
    p_envelopes: envelopes.map((e) => ({
      recipient_id: e.recipientId,
      envelope: e.envelope,
    })),
  });
  if (error) {
    if ((error as { code?: string }).code === 'PGRST202') {
      throw new Error(
        'Secure messaging is unavailable. Please update the app.',
      );
    }
    throw error;
  }
  await markRead(conversationId);
  return String(data);
}

/**
 * Edit my own DM message. The caller passes the already re-sealed envelope;
 * the server rejects the write when anyone has already seen the message.
 */
export async function editMessage(
  messageId: string,
  body: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('messages')
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', user.id);
  if (error) throw friendlyEditError(error);
}

/** Group edit: swap my envelope plus every member envelope atomically. */
export async function editGroupMessage(
  messageId: string,
  body: string,
  envelopes: { recipientId: string; envelope: string }[],
): Promise<void> {
  const { error } = await supabase.rpc('edit_group_message', {
    p_message: messageId,
    p_body: body.trim(),
    p_envelopes: envelopes.map((e) => ({
      recipient_id: e.recipientId,
      envelope: e.envelope,
    })),
  });
  if (error) throw friendlyEditError(error);
}

function friendlyEditError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/already seen/i.test(message)) {
    return new Error(
      'This chat was already seen, so it can no longer be edited.',
    );
  }
  return error instanceof Error ? error : new Error('Could not edit.');
}

/**
 * Delete my own message for everyone. Soft delete: the row keeps its place
 * in history and every client renders a tombstone.
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', user.id);
  if (error) throw error;
}
