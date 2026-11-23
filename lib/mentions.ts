import { isMissingTable } from './communityContent';
import { supabase } from './supabase';

export type MentionCandidate = { userId: string; name: string };

export function extractMentionTokens(text: string): string[] {
  const out: string[] = [];
  const re = /@([A-Za-z][A-Za-z0-9_.]{1,29})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) out.push(match[1].toLowerCase());
  return [...new Set(out)];
}

function nameKeys(name: string): string[] {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return [];
  return [...new Set([parts[0], parts.join(''), parts.join('_'), parts.join('.')])];
}

/** Post ids where the current user is tagged (home Tag filter). */
export async function myTaggedPostIds(): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  try {
    const { data, error } = await supabase
      .from('mentions')
      .select('post_id')
      .eq('mentioned_user_id', user.id)
      .not('post_id', 'is', null)
      .limit(200);
    if (error) throw error;
    return new Set(
      ((data as unknown as { post_id: string | null }[]) ?? [])
        .map((r) => r.post_id)
        .filter((v): v is string => !!v),
    );
  } catch (err) {
    if (isMissingTable(err)) return new Set();
    throw err;
  }
}

export function resolveMentions(
  text: string,
  candidates: MentionCandidate[],
  selfId: string | null,
): string[] {
  const tokens = extractMentionTokens(text);
  if (tokens.length === 0) return [];
  const ids: string[] = [];
  for (const candidate of candidates) {
    if (candidate.userId === selfId) continue;
    const keys = nameKeys(candidate.name);
    if (tokens.some((token) => keys.includes(token))) {
      ids.push(candidate.userId);
    }
  }
  return [...new Set(ids)];
}

export async function createMentions(input: {
  userIds: string[];
  communityId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  announcementId?: string | null;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || input.userIds.length === 0) return;
  const rows = input.userIds
    .filter((id) => id !== user.id)
    .map((mentioned) => ({
      mentioned_user_id: mentioned,
      mentioned_by: user.id,
      community_id: input.communityId ?? null,
      conversation_id: input.conversationId ?? null,
      message_id: input.messageId ?? null,
      post_id: input.postId ?? null,
      comment_id: input.commentId ?? null,
      ...(input.announcementId
        ? { announcement_id: input.announcementId }
        : {}),
    }));
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from('mentions').insert(rows);
    if (error) throw error;
  } catch (err) {
    if (input.announcementId && isMissingTable(err)) {
      // Backend predates announcement tagging: retry as a plain
      // community mention so the tagged user is still notified.
      const fallback = rows.map((row) => {
        const { announcement_id: _drop, ...rest } = row as Record<
          string,
          unknown
        >;
        return rest;
      });
      const retry = await supabase.from('mentions').insert(fallback);
      if (retry.error) {
        if (isMissingTable(retry.error)) return;
        throw retry.error;
      }
      return;
    }
    // Mentions must never break sending when the table is not migrated yet.
    if (isMissingTable(err)) return;
    throw err;
  }
}

/** Clears my tags on one post/announcement so an edit can re-tag cleanly. */
export async function clearOwnMentions(target: {
  postId?: string;
  announcementId?: string;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    let query = supabase
      .from('mentions')
      .delete()
      .eq('mentioned_by', user.id);
    query = target.postId
      ? query.eq('post_id', target.postId)
      : query.eq('announcement_id', target.announcementId ?? '');
    const { error } = await query;
    if (error) throw error;
  } catch {
    // Best-effort: stale tags are harmless.
  }
}
