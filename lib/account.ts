import { clearMyKeypair } from './e2ee';
import { clearOfflineData } from './net';
import { signInWithEmail, signOut, supabase } from './supabase';
import { removeFromBucket } from './uploads';

export type DeleteAccountResult = {
  transferred: string[];
  destroyed: string[];
};

/**
 * Truly delete the caller's public files from disk (avatar + own post
 * photos). Private buckets (chat media, voice notes, evidence) need no
 * enumeration: the server wipe revokes their rows, which is the only way
 * to mint access to them. Community-shared uploads (logos, community
 * files, surviving event banners) are left for the community.
 */
async function removeOwnPublicFiles(userId: string): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle();
    const avatar = (
      profile as { avatar_url?: string | null } | null
    )?.avatar_url;
    if (avatar) {
      jobs.push(removeFromBucket('avatars', String(avatar)).catch(() => {}));
    }
  } catch {
    // Fall through to the server wipe, which revokes the rows anyway.
  }
  try {
    const { data: posts } = await supabase
      .from('posts')
      .select('id,image_url')
      .eq('author_id', userId)
      .limit(1000);
    const rows = (posts as unknown as { id: string; image_url: string | null }[]) ?? [];
    const ids = rows.map((p) => String(p.id));
    let mediaPaths: string[] = [];
    if (ids.length > 0) {
      const { data: media } = await supabase
        .from('post_media')
        .select('path')
        .in('post_id', ids)
        .limit(5000);
      mediaPaths = (
        (media as unknown as { path: string }[]) ?? []
      ).map((m) => String(m.path));
    }
    // Banners of events that survive (authorship detached) stay up.
    const { data: events } = await supabase
      .from('events')
      .select('banner_url')
      .eq('created_by', userId)
      .limit(1000);
    const keep = new Set(
      (((events as unknown as { banner_url: string | null }[]) ?? [])
        .map((e) => e.banner_url)
        .filter(Boolean) as string[]),
    );
    for (const row of rows) {
      if (row.image_url && !keep.has(String(row.image_url))) {
        jobs.push(
          removeFromBucket('post-media', String(row.image_url)).catch(() => {}),
        );
      }
    }
    for (const path of mediaPaths) {
      if (!keep.has(path)) {
        jobs.push(removeFromBucket('post-media', path).catch(() => {}));
      }
    }
  } catch {
    // Fall through to the server wipe, which revokes the rows anyway.
  }
  // Public blobs of communities that die with the account: owned
  // communities with no other active member are destroyed server-side,
  // so their logos, banners, and post photos truly delete here.
  try {
    const { data: owned } = await supabase
      .from('communities')
      .select('id,logo_url')
      .eq('owner_id', userId);
    const ownedRows =
      (owned as unknown as { id: string; logo_url: string | null }[]) ?? [];
    const ownedIds = ownedRows.map((o) => String(o.id));
    if (ownedIds.length > 0) {
      const { data: others } = await supabase
        .from('community_members')
        .select('community_id')
        .in('community_id', ownedIds)
        .eq('status', 'active')
        .neq('user_id', userId)
        .limit(5000);
      const hasOthers = new Set(
        (((others as unknown as { community_id: string }[]) ?? []).map((m) =>
          String(m.community_id),
        )),
      );
      const dying = ownedIds.filter((id) => !hasOthers.has(id));
      for (const row of ownedRows) {
        if (dying.includes(String(row.id)) && row.logo_url) {
          jobs.push(
            removeFromBucket('avatars', String(row.logo_url)).catch(() => {}),
          );
        }
      }
      if (dying.length > 0) {
        const { data: banners } = await supabase
          .from('events')
          .select('banner_url')
          .in('community_id', dying)
          .limit(1000);
        for (const b of (
          (banners as unknown as { banner_url: string | null }[]) ?? []
        )) {
          if (b.banner_url) {
            jobs.push(
              removeFromBucket('post-media', String(b.banner_url)).catch(
                () => {},
              ),
            );
          }
        }
        const { data: dyingPosts } = await supabase
          .from('posts')
          .select('id,image_url')
          .in('community_id', dying)
          .limit(1000);
        const dyingRows =
          (dyingPosts as unknown as { id: string; image_url: string | null }[]) ??
          [];
        for (const p of dyingRows) {
          if (p.image_url) {
            jobs.push(
              removeFromBucket('post-media', String(p.image_url)).catch(
                () => {},
              ),
            );
          }
        }
        const dyingIds = dyingRows.map((p) => String(p.id));
        if (dyingIds.length > 0) {
          const { data: dyingMedia } = await supabase
            .from('post_media')
            .select('path')
            .in('post_id', dyingIds)
            .limit(5000);
          for (const m of (
            (dyingMedia as unknown as { path: string }[]) ?? []
          )) {
            jobs.push(
              removeFromBucket('post-media', String(m.path)).catch(() => {}),
            );
          }
        }
      }
    }
  } catch {
    // Fall through: rows are revoked server-side regardless.
  }
  await Promise.all(jobs);
}

/**
 * True when the session can prove itself with a password. Google-only
 * accounts have no password, so the delete screen skips that step for
 * them instead of locking them out of deletion.
 */
export async function hasEmailPassword(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const providers = (
    user as { app_metadata?: { providers?: unknown } } | null
  )?.app_metadata?.providers;
  return Array.isArray(providers) && providers.includes('email');
}

/**
 * Re-prove the session password before something irreversible. Throws a
 * plain message when the password is wrong.
 */
export async function confirmPassword(password: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email;
  if (!user || !email) throw new Error('You must be signed in.');
  try {
    await signInWithEmail(email, password);
  } catch {
    throw new Error('That password is not correct.');
  }
}

/**
 * Human-readable deletion failure. Server errors carry a Postgres code,
 * detail, and hint (e.g. which foreign key blocked the wipe) — all of
 * that is needed to fix it, so keep it instead of collapsing to a
 * generic "could not delete".
 */
export function deletionErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const extra = err as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [err.message];
    if (typeof extra.code === 'string' && extra.code) {
      parts.push(`(${extra.code})`);
    }
    if (
      typeof extra.details === 'string' &&
      extra.details &&
      extra.details !== err.message
    ) {
      parts.push(extra.details);
    }
    if (typeof extra.hint === 'string' && extra.hint) {
      parts.push(extra.hint);
    }
    return parts.join(' ');
  }
  return typeof err === 'string' && err ? err : 'Could not delete.';
}

/**
 * Delete the caller's account: public files first, then the atomic
 * server wipe (reason recorded anonymously, communities transfer or
 * destroy, rows cascade, auth user goes). Resolves with the community
 * handover summary for the farewell message. Throws when the backend
 * predates the wipe function.
 */
export async function deleteMyAccount(
  reason: string,
): Promise<DeleteAccountResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (!reason.trim()) {
    throw new Error('Please tell us why you are leaving.');
  }
  await removeOwnPublicFiles(user.id);
  const { data, error } = await supabase.rpc('delete_my_account', {
    p_reason: reason.trim(),
  });
  if (error) {
    if ((error as { code?: string }).code === 'PGRST202') {
      throw new Error(
        'Account deletion needs the latest database update. Ask your admin to apply it, then try again.',
      );
    }
    throw error;
  }
  const row = data as {
    transferred?: string[];
    destroyed?: string[];
  } | null;
  return {
    transferred: row?.transferred ?? [],
    destroyed: row?.destroyed ?? [],
  };
}

/**
 * Local half of deletion: forget the chat key, drop every saved copy and
 * queued write, and sign out. Runs after the server confirms.
 */
export async function wipeLocalAccount(): Promise<void> {
  await clearMyKeypair().catch(() => {});
  await clearOfflineData().catch(() => {});
  await signOut().catch(() => {});
}
