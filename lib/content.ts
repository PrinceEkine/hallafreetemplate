import { supabase } from './supabase';

export const REPORT_REASONS = ['Spam', 'Harassment', 'Misinformation', 'Other'];

/** True when the row was changed after creation (1s grace for clock skew). */
export function isEdited(
  createdAt: string,
  updatedAt: string | null | undefined,
): boolean {
  if (!updatedAt) return false;
  return (
    new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000
  );
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

export async function editPost(
  postId: string,
  input: { title: string; text: string },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const base = { title: input.title.trim(), text: input.text.trim() };
  try {
    const { error } = await supabase
      .from('posts')
      .update({ ...base, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
    return;
  } catch (err) {
    if (!isColumnError(err)) throw err;
  }
  // Backend predates the edited-flag column: save without it.
  const { error } = await supabase
    .from('posts')
    .update(base)
    .eq('id', postId);
  if (error) throw error;
}

export async function deletePost(postId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function editAnnouncement(
  id: string,
  input: { title: string; body: string; adminsOnly: boolean },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const base = { title: input.title.trim(), body: input.body.trim() };
  try {
    const { error } = await supabase
      .from('announcements')
      .update({
        ...base,
        admins_only: input.adminsOnly,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    return;
  } catch (err) {
    if (!isColumnError(err)) throw err;
  }
  if (input.adminsOnly) {
    throw new Error(
      'Admins-only needs the latest database update. Ask your admin to apply it.',
    );
  }
  // Backend predates the new columns: save the text without them.
  const { error } = await supabase
    .from('announcements')
    .update(base)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export type StoredMedia = {
  id: string;
  path: string;
  position: number;
  kind: 'image' | 'video' | 'file';
  fileName: string | null;
  fileSize: number | null;
};

type StoredMediaRow = {
  id: string;
  path: string;
  position: number;
  kind?: string | null;
  file_name?: string | null;
  file_size?: number | null;
};

function toStoredMedia(r: StoredMediaRow): StoredMedia {
  const kind = String(r.kind ?? 'image');
  return {
    id: String(r.id),
    path: String(r.path),
    position: Number(r.position ?? 0),
    kind: kind === 'video' || kind === 'file' ? kind : 'image',
    fileName: r.file_name ? String(r.file_name) : null,
    fileSize:
      typeof r.file_size === 'number' && Number.isFinite(r.file_size)
        ? r.file_size
        : null,
  };
}

export async function listPostMedia(postId: string): Promise<StoredMedia[]> {
  const { data, error } = await supabase
    .from('post_media')
    .select('id,path,position,kind,file_name,file_size')
    .eq('post_id', postId)
    .order('position', { ascending: true });
  if (error) {
    if (!isColumnError(error)) throw error;
    // Stale backend without the kind columns: everything is a picture.
    const legacy = await supabase
      .from('post_media')
      .select('id,path,position')
      .eq('post_id', postId)
      .order('position', { ascending: true });
    if (legacy.error) {
      if (isColumnError(legacy.error)) return [];
      throw legacy.error;
    }
    return ((legacy.data as unknown as StoredMediaRow[]) ?? []).map(
      toStoredMedia,
    );
  }
  return ((data as unknown as StoredMediaRow[]) ?? []).map(toStoredMedia);
}

export type NewPostMedia = {
  path: string;
  kind?: 'image' | 'video' | 'file';
  fileName?: string;
  fileSize?: number;
};

export async function addPostMedia(
  postId: string,
  items: (string | NewPostMedia)[],
): Promise<void> {
  if (items.length === 0) return;
  const existing = await listPostMedia(postId).catch((): StoredMedia[] => []);
  const start = existing.length;
  const rows = items.map((item, i) => {
    const row = typeof item === 'string' ? { path: item } : item;
    return {
      post_id: postId,
      path: row.path,
      position: start + i,
      kind: row.kind ?? 'image',
      ...(row.fileName ? { file_name: row.fileName } : {}),
      ...(typeof row.fileSize === 'number' ? { file_size: row.fileSize } : {}),
    };
  });
  const { error } = await supabase.from('post_media').insert(rows);
  if (error) {
    if (!isColumnError(error)) throw error;
    // Stale backend: pictures still save, the rest cannot.
    if (rows.some((r) => r.kind !== 'image')) {
      throw new Error(
        'Posting videos and files needs the latest database update. Ask your admin to apply it.',
      );
    }
    const { error: legacyError } = await supabase.from('post_media').insert(
      rows.map((r) => ({
        post_id: r.post_id,
        path: r.path,
        position: r.position,
      })),
    );
    if (legacyError) throw legacyError;
  }
}

export async function removePostMedia(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('post_media').delete().in('id', ids);
  if (error) throw error;
}

export async function setPostCover(
  postId: string,
  path: string | null,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('posts')
      .update({ image_url: path })
      .eq('id', postId);
    if (error) throw error;
  } catch (err) {
    if (isColumnError(err)) return;
    throw err;
  }
}

export async function listAnnouncementMedia(
  announcementId: string,
): Promise<{ items: StoredMedia[]; unsupported: boolean }> {
  try {
    const { data, error } = await supabase
      .from('announcement_media')
      .select('id,path,position')
      .eq('announcement_id', announcementId)
      .order('position', { ascending: true });
    if (error) throw error;
    return {
      items: ((data as unknown as StoredMedia[]) ?? []).map((r) => ({
        id: String(r.id),
        path: String(r.path),
        position: Number(r.position ?? 0),
        kind: 'image' as const,
        fileName: null,
        fileSize: null,
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isColumnError(err)) return { items: [], unsupported: true };
    throw err;
  }
}

export async function addAnnouncementMedia(
  announcementId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const current = await listAnnouncementMedia(announcementId);
  if (current.unsupported) {
    throw new Error(
      'Announcement pictures need the latest database update. Ask your admin to apply it.',
    );
  }
  const start = current.items.length;
  const { error } = await supabase.from('announcement_media').insert(
    paths.map((path, i) => ({
      announcement_id: announcementId,
      path,
      position: start + i,
    })),
  );
  if (error) {
    if (isColumnError(error)) {
      throw new Error(
        'Announcement pictures need the latest database update. Ask your admin to apply it.',
      );
    }
    throw error;
  }
}

export async function removeAnnouncementMedia(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('announcement_media')
    .delete()
    .in('id', ids);
  if (error) throw error;
}

export type ReportTarget =
  | { postId: string; announcementId?: undefined }
  | { postId?: undefined; announcementId: string }
  | { userId: string; conversationId?: string };

export async function reportContent(
  target: ReportTarget,
  communityId: string,
  reason: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('content_reports').insert({
    post_id: 'postId' in target ? target.postId : null,
    announcement_id:
      'announcementId' in target ? (target.announcementId ?? null) : null,
    reported_user_id: 'userId' in target ? target.userId : null,
    conversation_id:
      'userId' in target ? (target.conversationId ?? null) : null,
    community_id: communityId,
    reporter_id: user.id,
    reason: reason.trim(),
  });
  if (error) {
    if (isColumnError(error) || (error as { code?: string }).code === 'PGRST205') {
      throw new Error(
        'Reporting needs the latest database update. Ask your admin to apply it.',
      );
    }
    throw error;
  }
}
