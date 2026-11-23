import { reportContent } from './content';
import { supabase } from './supabase';

/**
 * Chat safety: blocks, user reports, disappearing-message timers.
 * See supabase/migrations/2026111801_chat_safety.sql.
 */

export async function blockUser(peerId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: user.id, blocked_id: peerId });
  if (error) throw error;
}

export async function unblockUser(peerId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', peerId);
  if (error) throw error;
}

export async function isBlockedByMe(peerId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', peerId)
    .maybeSingle();
  return !!data;
}

export async function getDisappearSeconds(
  conversationId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('conversations')
    .select('disappear_seconds')
    .eq('id', conversationId)
    .single();
  return (
    (data as { disappear_seconds: number | null } | null)
      ?.disappear_seconds ?? null
  );
}

export async function setDisappearSeconds(
  conversationId: string,
  seconds: number | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_disappear_seconds', {
    p_conversation: conversationId,
    p_seconds: seconds,
  });
  if (error) throw error;
}

/**
 * Report a DM peer to their shared community's admins (the same queue as
 * post reports). DMs always share a community: create_dm enforces it.
 */
export async function reportUser(
  peerId: string,
  conversationId: string,
  reason: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data: convo } = await supabase
    .from('conversations')
    .select('community_id')
    .eq('id', conversationId)
    .single();
  let communityId = (convo as { community_id: string | null } | null)
    ?.community_id;
  if (!communityId) {
    type Row = { community_id: string };
    const [mine, theirs] = await Promise.all([
      supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', user.id)
        .eq('status', 'active'),
      supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', peerId)
        .eq('status', 'active'),
    ]);
    const mineIds = new Set(
      ((mine.data as unknown as Row[]) ?? []).map((r) => r.community_id),
    );
    communityId =
      ((theirs.data as unknown as Row[]) ?? []).find((r) =>
        mineIds.has(r.community_id),
      )?.community_id ?? null;
  }
  if (!communityId) {
    throw new Error('You share no community with this person.');
  }
  await reportContent(
    { userId: peerId, conversationId },
    communityId,
    reason,
  );
}

export type DisappearOption = {
  label: string;
  sub: string;
  seconds: number | null;
};

/** The one timer menu, shared by the chat thread and member profiles. */
export const DISAPPEAR_OPTIONS: DisappearOption[] = [
  { label: 'Off', sub: 'Keep everything', seconds: null },
  { label: '1 hour', sub: 'Vanish after an hour', seconds: 3600 },
  { label: '24 hours', sub: 'Vanish after a day', seconds: 86400 },
  { label: '7 days', sub: 'Vanish after a week', seconds: 604800 },
  { label: '30 days', sub: 'Vanish after a month', seconds: 2592000 },
];

export function disappearLabel(sec: number | null): string {
  if (sec === 3600) return '1 hour';
  if (sec === 86400) return '24 hours';
  if (sec === 604800) return '7 days';
  if (sec === 2592000) return '30 days';
  if (sec === 7776000) return '90 days';
  if (sec !== null) return 'On';
  return 'Off';
}
