import { supabase } from './supabase';

export async function toggleLike(
  postId: string,
): Promise<{ liked: boolean; count: number }> {
  const { data, error } = await supabase.rpc('toggle_post_like', {
    p_post_id: postId,
  });
  if (error) throw error;
  const row = data as unknown as { liked: boolean; count: number };
  return { liked: !!row.liked, count: Number(row.count) };
}

export type PostComment = {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  mine: boolean;
};

export async function listComments(postId: string): Promise<PostComment[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('post_comments')
    .select(
      'id,body,created_at,author_id,author:profiles!post_comments_author_id_fkey(full_name)',
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100);
  type Row = {
    id: string;
    body: string;
    created_at: string;
    author_id: string;
    author: { full_name: string | null } | null;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: String(r.id),
    body: String(r.body),
    created_at: String(r.created_at),
    authorName: r.author?.full_name ?? 'Staff Member',
    mine: r.author_id === user?.id,
  }));
}

export async function addComment(
  postId: string,
  body: string,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      author_id: user.id,
      body: body.trim(),
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not comment.');
  return String((data as { id: string }).id);
}

export async function editComment(
  commentId: string,
  body: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (body.trim().length < 1) throw new Error('Write the comment first.');
  const { error } = await supabase
    .from('post_comments')
    .update({ body: body.trim() })
    .eq('id', commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId);
  if (error) throw error;
}

export async function reportComment(
  postId: string,
  commentId: string,
  communityId: string,
  reason: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('comment_reports').insert({
    comment_id: commentId,
    post_id: postId,
    community_id: communityId,
    reporter_id: user.id,
    reason: reason.trim(),
  });
  if (error) throw error;
}

export async function toggleSave(postId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data: existing } = await supabase
    .from('post_saves')
    .select('post_id')
    .eq('user_id', user.id)
    .eq('post_id', postId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('post_saves')
      .delete()
      .eq('user_id', user.id)
      .eq('post_id', postId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from('post_saves')
    .insert({ user_id: user.id, post_id: postId });
  if (error) throw error;
  return true;
}

export async function mySavedIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from('post_saves')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);
  return new Set(
    ((data as unknown as { post_id: string }[]) ?? []).map((r) => r.post_id),
  );
}

export async function myLikedIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);
  return new Set(
    ((data as unknown as { post_id: string }[]) ?? []).map((r) => r.post_id),
  );
}
