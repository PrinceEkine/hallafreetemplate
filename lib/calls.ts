import { supabase } from './supabase';
import { publicUrl } from './uploads';

/**
 * Voice/video call signaling for DMs and groups (see
 * supabase/migrations/2026111407_call_signals.sql). One live row per chat in
 * call_signals; inserting one fans out an incoming-call push, deleting ends
 * the call. Media itself flows over Agora RTC with a short-lived token from
 * the agora-token edge function.
 */

export type CallMedia = 'voice' | 'video';

export type CallSignal = {
  id: string;
  scope: 'chat' | 'room';
  refId: string;
  startedBy: string;
  media: CallMedia;
  startedAt: string;
};

export function channelForConversation(conversationId: string): string {
  return `ophixe_${conversationId.replace(/-/g, '').toLowerCase()}`;
}

// Every realtime subscription below gets its own channel topic. Supabase
// reuses one channel object per topic name, and adding postgres_changes
// callbacks to an already-subscribed channel throws ("cannot add ...
// callbacks ... after `subscribe()`"). Two live subscribers share topics
// here by design — the global incoming-call overlay plus the rooms list
// both watch all call rows, and a chat thread plus its call screen both
// watch one conversation — so a fixed topic name crashes the second
// subscriber every time.
let realtimeChannelSeq = 0;

function openCallChannel(base: string) {
  realtimeChannelSeq += 1;
  return supabase.channel(
    `${base}:${realtimeChannelSeq}:${Math.random().toString(36).slice(2, 10)}`,
  );
}

// ── Call history (best-effort; never breaks calling) ─────────────────

type LogTarget = { conversationId: string } | { meetingId: string };

function logColumn(target: LogTarget): 'conversation_id' | 'meeting_id' {
  return 'conversationId' in target ? 'conversation_id' : 'meeting_id';
}

function logValue(target: LogTarget): string {
  return 'conversationId' in target ? target.conversationId : target.meetingId;
}

async function logCallStart(
  target: LogTarget,
  starterId: string,
  media: CallMedia,
): Promise<void> {
  try {
    await supabase.from('call_logs').insert({
      [logColumn(target)]: logValue(target),
      started_by: starterId,
      media,
    });
  } catch {
    // Old backends have no history table; calls still work.
  }
}

async function logCallEnd(target: LogTarget): Promise<void> {
  try {
    const column = logColumn(target);
    const { data } = await supabase
      .from('call_logs')
      .select('id')
      .eq(column, logValue(target))
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);
    const id = (data as unknown as { id: string }[] | null)?.[0]?.id;
    if (id) {
      await supabase
        .from('call_logs')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', id);
      // Rows nobody marked answered while live ended unanswered.
      // Unknown legacy rows (ended before the column) stay null.
      // Stale backends error here; the result is ignored either way.
      await supabase
        .from('call_logs')
        .update({ answered: false })
        .eq('id', id)
        .is('answered', null);
    }
  } catch {
    // History failures never surface.
  }
}

/**
 * Mark the live call row answered (someone joined). Best-effort and
 * stale-safe: old backends without the RPC resolve nothing.
 */
export async function markCallAnswered(target: LogTarget): Promise<void> {
  try {
    const conversationId =
      'conversationId' in target ? target.conversationId : null;
    const meetingId = 'meetingId' in target ? target.meetingId : null;
    await supabase.rpc('mark_call_answered', {
      p_conversation_id: conversationId,
      p_meeting_id: meetingId,
    });
  } catch {
    // Old backends: the row stays unmarked (shown neutral).
  }
}

export type CallLogEntry = {
  id: string;
  media: CallMedia;
  startedAt: string;
  endedAt: string | null;
  answered: boolean | null;
  conversationId: string | null;
  meetingId: string | null;
  meetingName: string;
  conversationTitle: string;
};

function missingCallLogs(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (['PGRST205', '42P01', 'PGRST204'].includes(code)) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /could not find|does not exist|schema cache/i.test(message);
}

/**
 * Recent call sessions for a user: calls they started plus calls in
 * conversations they joined. RLS narrows it to what the viewer may see
 * (own calls, shared threads, or — for community admins — their
 * community's calls).
 */
export async function listCallHistoryForUser(
  userId: string,
  limit = 20,
): Promise<{ logs: CallLogEntry[]; unsupported: boolean }> {
  let conversationIds: string[] = [];
  try {
    const { data: parts } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId)
      .limit(200);
    conversationIds = (
      (parts as unknown as { conversation_id: string }[]) ?? []
    ).map((p) => String(p.conversation_id));
  } catch {
    // Fall through to starter-only history.
  }
  async function run(withAnswered: boolean) {
    const base = supabase
      .from('call_logs')
      .select(
        withAnswered
          ? 'id,media,started_at,ended_at,answered,conversation_id,meeting_id,meeting:community_meetings(name),conversation:conversations(title)'
          : 'id,media,started_at,ended_at,conversation_id,meeting_id,meeting:community_meetings(name),conversation:conversations(title)',
      )
      .order('started_at', { ascending: false })
      .limit(limit);
    return conversationIds.length > 0
      ? base.or(
          `started_by.eq.${userId},conversation_id.in.(${conversationIds.join(',')})`,
        )
      : base.eq('started_by', userId);
  }
  let answeredKnown = true;
  let { data, error } = await run(true);
  if (error) {
    const code = (error as { code?: string } | null)?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'PGRST204' || /answered/i.test(message)) {
      // Old backends without the answered column: history still loads,
      // every row neutral.
      answeredKnown = false;
      ({ data, error } = await run(false));
    }
  }
  if (error) {
    if (missingCallLogs(error)) return { logs: [], unsupported: true };
    throw error;
  }
  type Row = {
    id: string;
    media: string;
    started_at: string;
    ended_at: string | null;
    answered?: boolean | null;
    conversation_id: string | null;
    meeting_id: string | null;
    meeting: { name: string } | null;
    conversation: { title: string } | null;
  };
  return {
    logs: ((data as unknown as Row[]) ?? []).map((r) => ({
      id: String(r.id),
      media: r.media === 'video' ? 'video' : 'voice',
      startedAt: String(r.started_at),
      endedAt: r.ended_at ? String(r.ended_at) : null,
      answered: !answeredKnown
        ? null
        : r.answered === true
          ? true
          : r.answered === false
            ? false
            : null,
      conversationId: r.conversation_id ? String(r.conversation_id) : null,
      meetingId: r.meeting_id ? String(r.meeting_id) : null,
      meetingName: r.meeting ? String(r.meeting.name ?? '') : '',
      conversationTitle: r.conversation
        ? String(r.conversation.title ?? '')
        : '',
    })),
    unsupported: false,
  };
}

export function channelForRoom(meetingId: string): string {
  return `ophixe_room_${meetingId.replace(/-/g, '').toLowerCase()}`;
}

export async function getCallToken(channel: string): Promise<{
  token: string;
  uid: number;
  appId: string;
}> {
  const { data, error } = await supabase.functions.invoke('agora-token', {
    body: { channel },
  });
  if (error) {
    const detail = (data as { error?: string } | null)?.error;
    throw new Error(detail || error.message || 'Could not authorize call.');
  }
  const row = data as { token?: string; uid?: number; appId?: string; error?: string } | null;
  if (row?.error) throw new Error(row.error);
  if (!row?.token || !row.uid || !row.appId) {
    throw new Error('Calling is not configured yet.');
  }
  return { token: row.token, uid: row.uid, appId: row.appId };
}

type SignalRow = {
  id: string;
  scope?: string;
  ref_id?: string;
  started_by: string;
  media: string;
  started_at: string;
};

function mapSignal(row: SignalRow, fallbackRefId = ''): CallSignal {
  return {
    id: String(row.id),
    scope: row.scope === 'room' ? 'room' : 'chat',
    refId: row.ref_id ? String(row.ref_id) : fallbackRefId,
    startedBy: String(row.started_by),
    media: row.media === 'video' ? 'video' : 'voice',
    startedAt: String(row.started_at),
  };
}

export async function getActiveCall(
  conversationId: string,
): Promise<CallSignal | null> {
  const { data } = await supabase
    .from('call_signals')
    .select('id,started_by,media,started_at')
    .eq('scope', 'chat')
    .eq('ref_id', conversationId)
    .maybeSingle();
  if (!data) return null;
  return mapSignal(data as unknown as SignalRow, conversationId);
}

/** Start (or take over) the live call row for this chat. */
export async function startCallSignal(
  conversationId: string,
  media: CallMedia,
): Promise<CallSignal> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  // A crashed starter's row would block everyone: replace it.
  await supabase
    .from('call_signals')
    .delete()
    .eq('scope', 'chat')
    .eq('ref_id', conversationId);
  await clearCallPresence('chat', conversationId);
  const { data, error } = await supabase
    .from('call_signals')
    .insert({
      scope: 'chat',
      ref_id: conversationId,
      started_by: user.id,
      media,
    })
    .select('id,started_by,media,started_at')
    .single();
  if (error) throw error;
  await logCallStart({ conversationId }, user.id, media);
  return mapSignal(data as unknown as SignalRow, conversationId);
}

export async function endCallSignal(conversationId: string): Promise<void> {
  await supabase
    .from('call_signals')
    .delete()
    .eq('scope', 'chat')
    .eq('ref_id', conversationId);
  await Promise.allSettled([
    logCallEnd({ conversationId }),
    clearCallPresence('chat', conversationId),
  ]);
}

export async function getRoomCall(
  meetingId: string,
): Promise<CallSignal | null> {
  const { data } = await supabase
    .from('call_signals')
    .select('id,scope,ref_id,started_by,media,started_at')
    .eq('scope', 'room')
    .eq('ref_id', meetingId)
    .maybeSingle();
  if (!data) return null;
  return mapSignal(data as unknown as SignalRow, meetingId);
}

/** Live room rows for a list of meetings (LIVE badges). Never throws. */
export async function getRoomCalls(
  meetingIds: string[],
): Promise<CallSignal[]> {
  if (meetingIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('call_signals')
      .select('id,scope,ref_id,started_by,media,started_at')
      .eq('scope', 'room')
      .in('ref_id', meetingIds);
    if (error || !data) return [];
    return (data as unknown as SignalRow[]).map((row) => mapSignal(row));
  } catch {
    return [];
  }
}

/**
 * Open (or join) the live video room for a meeting. Unlike chat calls,
 * joining never replaces a live row: members trickle in and the meeting
 * stays live until someone ends it. Rows older than 12h are treated as
 * crashed starters and replaced.
 */
export async function startRoomSignal(
  meetingId: string,
  communityId: string,
  media: CallMedia,
): Promise<CallSignal> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const existing = await getRoomCall(meetingId).catch(() => null);
  if (existing) {
    const ageMs = Date.now() - new Date(existing.startedAt).getTime();
    if (ageMs < 12 * 3600 * 1000) return existing;
    await endRoomSignal(meetingId).catch(() => {});
  }
  const { data, error } = await supabase
    .from('call_signals')
    .insert({
      scope: 'room',
      ref_id: meetingId,
      community_id: communityId,
      started_by: user.id,
      media,
    })
    .select('id,scope,ref_id,started_by,media,started_at')
    .single();
  if (error) {
    // Two members opening at once: the loser joins the winner's row.
    const raced = await getRoomCall(meetingId).catch(() => null);
    if (raced) return raced;
    throw error;
  }
  await logCallStart({ meetingId }, user.id, media);
  await clearCallPresence('room', meetingId);
  return mapSignal(data as unknown as SignalRow, meetingId);
}

/** End the meeting for everyone (admin or starter). */
export async function endRoomSignal(meetingId: string): Promise<void> {
  await supabase
    .from('call_signals')
    .delete()
    .eq('scope', 'room')
    .eq('ref_id', meetingId);
  await Promise.allSettled([
    logCallEnd({ meetingId }),
    clearCallPresence('room', meetingId),
  ]);
}

export type CallPresenceScope = 'chat' | 'room';

export type CallPresence = {
  userId: string;
  agoraUid: number;
  muted: boolean;
  sharing: boolean;
  name: string;
  avatarUrl: string | null;
};

/**
 * Publish my live call flags (mute / screen-share). Throws on write
 * errors so the share flow can detect a taken sharer lock (23505).
 */
export async function upsertMyPresence(
  scope: CallPresenceScope,
  refId: string,
  agoraUid: number,
  patch: { muted?: boolean; sharing?: boolean },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const row: Record<string, unknown> = {
    scope,
    ref_id: refId,
    user_id: user.id,
    agora_uid: agoraUid,
    updated_at: new Date().toISOString(),
  };
  if (patch.muted !== undefined) row.muted = patch.muted;
  if (patch.sharing !== undefined) row.sharing = patch.sharing;
  const { error } = await supabase
    .from('call_presence')
    .upsert(row, { onConflict: 'scope,ref_id,user_id' });
  if (error) throw error;
}

/** Drop my presence row (leaving). Never throws. */
export async function deleteMyPresence(
  scope: CallPresenceScope,
  refId: string,
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('call_presence')
      .delete()
      .eq('scope', scope)
      .eq('ref_id', refId)
      .eq('user_id', user.id);
  } catch {
    // Rows die with the call sweep anyway.
  }
}

/** Sweep a whole call's presence (call start/end). Never throws. */
export async function clearCallPresence(
  scope: CallPresenceScope,
  refId: string,
): Promise<void> {
  try {
    await supabase.rpc('clear_call_presence', {
      p_scope: scope,
      p_ref: refId,
    });
  } catch {
    // Old backends and races resolve to nothing.
  }
}

/** Everyone currently publishing flags in this call. Never throws. */
export async function getCallPresence(
  scope: CallPresenceScope,
  refId: string,
): Promise<CallPresence[]> {
  try {
    const { data, error } = await supabase
      .from('call_presence')
      .select(
        'user_id,agora_uid,muted,sharing,profile:profiles!call_presence_user_id_fkey(full_name,avatar_url)',
      )
      .eq('scope', scope)
      .eq('ref_id', refId);
    if (error || !data) return [];
    type Row = {
      user_id: string;
      agora_uid: number;
      muted: boolean;
      sharing: boolean;
      profile: { full_name: string | null; avatar_url: string | null } | null;
    };
    return ((data as unknown as Row[]) ?? []).map((r) => ({
      userId: String(r.user_id),
      agoraUid: Number(r.agora_uid),
      muted: r.muted === true,
      sharing: r.sharing === true,
      name: r.profile?.full_name ?? 'Someone',
      avatarUrl: r.profile?.avatar_url
        ? publicUrl('avatars', String(r.profile.avatar_url))
        : null,
    }));
  } catch {
    return [];
  }
}

/**
 * Live flags for a call: refetches the small row set on any change.
 * Powers mute badges and the single-sharer lock.
 */
export function subscribeToCallPresence(
  scope: CallPresenceScope,
  refId: string,
  onFlags: (flags: CallPresence[]) => void,
): () => void {
  let alive = true;
  const refresh = () => {
    getCallPresence(scope, refId)
      .then((flags) => {
        if (alive) onFlags(flags);
      })
      .catch(() => {});
  };
  refresh();
  const channel = openCallChannel(`presence:${scope}:${refId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'call_presence',
        filter: `ref_id=eq.${refId}`,
      },
      () => {
        refresh();
      },
    )
    .subscribe();
  return () => {
    alive = false;
    supabase.removeChannel(channel);
  };
}

export function subscribeToRoomSignals(
  meetingId: string,
  onChange: (signal: CallSignal | null) => void,
): () => void {
  const channel = openCallChannel(`room-calls:${meetingId}`).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_signals',
        filter: `ref_id=eq.${meetingId}`,
      },
      (payload) => {
        onChange(mapSignal(payload.new as SignalRow, meetingId));
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'call_signals',
        filter: `ref_id=eq.${meetingId}`,
      },
      () => {
        onChange(null);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * One global listener for every call row the signed-in user can see
 * (RLS already limits this to their chats and communities). Powers the
 * incoming-meeting-call popup and the meetings LIVE list.
 */
export function subscribeToAllCallSignals(
  onInsert: (signal: CallSignal) => void,
  onDelete: (signalId: string, refId: string) => void,
): () => void {
  const channel = openCallChannel('all-call-signals').on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'call_signals' },
      (payload) => {
        onInsert(mapSignal(payload.new as SignalRow));
      },
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'call_signals' },
      (payload) => {
        const old = payload.old as { id?: unknown; ref_id?: unknown };
        if (old?.id) {
          onDelete(String(old.id), old.ref_id ? String(old.ref_id) : '');
        }
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToCallSignals(
  conversationId: string,
  onChange: (signal: CallSignal | null) => void,
): () => void {
  const channel = openCallChannel(`calls:${conversationId}`).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_signals',
        filter: `ref_id=eq.${conversationId}`,
      },
      (payload) => {
        onChange(mapSignal(payload.new as SignalRow, conversationId));
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'call_signals',
        filter: `ref_id=eq.${conversationId}`,
      },
      () => {
        onChange(null);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
