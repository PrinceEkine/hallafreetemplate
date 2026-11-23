import { bustCommunityCache } from './communities';
import { supabase } from './supabase';
import { MAX_FILE_BYTES, MAX_MEDIA_BYTES, publicUrl, uploadToBucket } from './uploads';
import type { PickedAsset } from './uploads';

export function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (['PGRST205', '42P01', 'PGRST204'].includes(code)) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /could not find|does not exist|schema cache|column/i.test(message);
}

export type MemberEntry = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  showInContact: boolean;
  isSupport: boolean;
  tag: string | null;
};

export async function listCommunityMembers(
  communityId: string,
  opts: { search?: string; limit?: number; offset?: number } = {},
): Promise<{ members: MemberEntry[]; hasMore: boolean }> {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  const columns =
    'user_id,role,status,show_in_contact,is_support,tag,profile:profiles!community_members_user_id_fkey(full_name,avatar_url)';
  const legacyColumns =
    'user_id,role,status,show_in_contact,profile:profiles!community_members_user_id_fkey(full_name,avatar_url)';
  const first = await supabase
    .from('community_members')
    .select(columns)
    .eq('community_id', communityId)
    .order('role', { ascending: true })
    .range(offset, offset + limit);
  let data: unknown = first.data;
  let error = first.error;
  if (error && isMissingTable(error)) {
    // Old backends without the support column: nobody is flagged.
    const retry = await supabase
      .from('community_members')
      .select(legacyColumns)
      .eq('community_id', communityId)
      .order('role', { ascending: true })
      .range(offset, offset + limit);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  type Row = {
    user_id: string;
    role: string;
    status: string;
    show_in_contact: boolean | null;
    is_support: boolean | null;
    tag: string | null;
    profile: { full_name: string | null; avatar_url: string | null } | null;
  };
  let members = ((data as unknown as Row[]) ?? []).map((r) => ({
    userId: String(r.user_id),
    name: r.profile?.full_name ?? 'Staff Member',
    avatarUrl: r.profile?.avatar_url ? publicUrl('avatars', String(r.profile.avatar_url)) : null,
    role: String(r.role),
    status: String(r.status),
    showInContact: r.show_in_contact !== false,
    isSupport: r.is_support === true,
    tag: typeof r.tag === 'string' && r.tag.trim() ? r.tag.trim() : null,
  }));
  const needle = (opts.search ?? '').trim().toLowerCase();
  if (needle) {
    members = members.filter((m) => m.name.toLowerCase().includes(needle));
  }
  return { members: members.slice(0, limit), hasMore: members.length > limit };
}

export async function approveMember(
  communityId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .update({ status: 'active' })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function adminAddMember(
  communityId: string,
  phone: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_add_member', {
    p_community: communityId,
    p_phone: phone.trim(),
  });
  if (error) throw error;
  bustCommunityCache();
}

export async function adminAddMemberById(
  communityId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_add_member_by_id', {
    p_community: communityId,
    p_user: userId,
  });
  if (error) throw error;
  bustCommunityCache();
}

export type CommunityInvite = {
  id: string;
  communityId: string;
  userId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
};

/**
 * LinkedIn-pattern invite: an admin invites by name, the invitee gets a
 * notification and joins by accepting. The invite row is rolled back when
 * its notification cannot be written, so the two never drift apart.
 */
export async function sendCommunityInvite(
  communityId: string,
  userId: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const basics = await getCommunityBasics(communityId).catch(() => null);
  const communityName = basics?.name ?? 'your community';
  let inviter = 'An admin';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    inviter =
      (data as { full_name: string | null } | null)?.full_name ?? 'An admin';
  } catch {
    // Fall back to the generic sender.
  }
  const { data, error } = await supabase
    .from('member_invites')
    .insert({
      community_id: communityId,
      user_id: userId,
      invited_by: user.id,
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error(
        'Already invited — they can accept from Notifications.',
      );
    }
    throw error;
  }
  const inviteId = (data as { id: string }).id;
  const { error: noteError } = await supabase.from('notifications').insert({
    user_id: userId,
    kind: 'community',
    title: `Invite to join ${communityName}`,
    body: `${inviter} invited you to join ${communityName}. Tap to accept.`,
    route: 'community_invite',
    ref_id: inviteId,
    community_id: communityId,
  });
  if (noteError) {
    try {
      await supabase.from('member_invites').delete().eq('id', inviteId);
    } catch {
      // Rollback is best-effort.
    }
    throw noteError;
  }
  bustCommunityCache();
}

/** Pending invitee ids for a community (admins, for INVITED rows). */
export async function listCommunityPendingInvites(
  communityId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('member_invites')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('status', 'pending');
  if (error) return new Set();
  return new Set(
    ((data as unknown as { user_id: string }[]) ?? []).map((r) =>
      String(r.user_id),
    ),
  );
}

/** Resolve a registered user by email for an admin invite. */
export async function findInviteUserByEmail(
  communityId: string,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_invite_user_by_email', {
    p_community: communityId,
    p_email: email.trim(),
  });
  if (error || !data) return null;
  return String(data);
}

/** Resolve a registered user by phone number for an admin invite. */
export async function findInviteUserByPhone(
  communityId: string,
  phone: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_invite_user_by_phone', {
    p_community: communityId,
    p_phone: phone.trim(),
  });
  if (error || !data) return null;
  return String(data);
}

/** My pending invites, for Accept/Decline buttons in Notifications. */
export async function listMyPendingInvites(): Promise<CommunityInvite[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('member_invites')
    .select('id,community_id,user_id,status,created_at')
    .eq('user_id', user.id)
    .eq('status', 'pending');
  if (error) return [];
  type Row = {
    id: string;
    community_id: string;
    user_id: string;
    status: CommunityInvite['status'];
    created_at: string;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: String(r.id),
    communityId: String(r.community_id),
    userId: String(r.user_id),
    status: r.status,
    createdAt: String(r.created_at),
  }));
}

async function markInviteNotificationRead(inviteId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('route', 'community_invite')
    .eq('ref_id', inviteId);
}

/** Accept an invite: join the community directly, return its id. */
export async function acceptCommunityInvite(inviteId: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_community_invite', {
    p_invite_id: inviteId,
  });
  if (error) throw error;
  await markInviteNotificationRead(inviteId).catch(() => {});
  bustCommunityCache();
  return String(data);
}

export async function declineCommunityInvite(
  inviteId: string,
): Promise<void> {
  const { error } = await supabase
    .from('member_invites')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
  await markInviteNotificationRead(inviteId).catch(() => {});
}

export type AddCandidate = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export async function searchPeopleToAdd(
  communityId: string,
  query: string,
): Promise<{ users: AddCandidate[]; unsupported: boolean }> {
  if (query.trim().length < 2) return { users: [], unsupported: false };
  const { data, error } = await supabase.rpc('search_users_to_add', {
    p_community: communityId,
    p_query: query.trim(),
  });
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    const message = String(
      (error as { message?: string }).message ?? error,
    );
    if (
      code === 'PGRST202' ||
      /could not find the function/i.test(message) ||
      isMissingTable(error)
    ) {
      return { users: [], unsupported: true };
    }
    throw error;
  }
  type Row = {
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  return {
    users: ((data as unknown as Row[]) ?? []).map((r) => ({
      userId: String(r.user_id),
      name: r.full_name ?? 'Staff Member',
      avatarUrl: r.avatar_url
        ? publicUrl('avatars', String(r.avatar_url))
        : null,
    })),
    unsupported: false,
  };
}

export async function removeMember(
  communityId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function setMemberRole(
  communityId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can change member roles.');
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (userId === user.id) {
    throw new Error('You cannot change your own role.');
  }
  const { data: target } = await supabase
    .from('community_members')
    .select('role')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .single();
  if ((target as { role?: string } | null)?.role === 'owner') {
    throw new Error('The owner role cannot be changed.');
  }
  const { error } = await supabase
    .from('community_members')
    .update({ role })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

export type ContextMembership = {
  role: string;
  status: string;
  isSupport: boolean;
  tag: string | null;
};

/** One member's standing in one community (for profile + admin actions). */
export async function getCommunityMembership(
  communityId: string,
  userId: string,
): Promise<ContextMembership | null> {
  const first = await supabase
    .from('community_members')
    .select('role,status,is_support,tag')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle();
  let data: unknown = first.data;
  if (first.error && isMissingTable(first.error)) {
    // Old backends without the tag column.
    const retry = await supabase
      .from('community_members')
      .select('role,status,is_support')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();
    if (retry.error) throw retry.error;
    data = retry.data;
  } else if (first.error) {
    throw first.error;
  }
  if (!data) return null;
  const row = data as unknown as {
    role: string;
    status: string;
    is_support: boolean | null;
    tag?: string | null;
  };
  return {
    role: String(row.role),
    status: String(row.status),
    isSupport: row.is_support === true,
    tag:
      typeof row.tag === 'string' && row.tag.trim() ? row.tag.trim() : null,
  };
}

/** How many of the community's group chats a member has joined. */
export async function countUserCommunityGroups(
  userId: string,
  communityId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id,conversation:conversations!inner(is_group,community_id)')
    .eq('user_id', userId);
  if (error) throw error;
  type Row = {
    conversation: { is_group: boolean; community_id: string } | null;
  };
  return ((data as unknown as Row[]) ?? []).filter(
    (r) =>
      r.conversation?.is_group === true &&
      String(r.conversation.community_id) === communityId,
  ).length;
}

export async function isCommunityMember(communityId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('community_members')
    .select('status')
    .eq('community_id', communityId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();
  return !!data;
}

export async function isCommunityAdmin(communityId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('community_members')
    .select('role')
    .eq('community_id', communityId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();
  const role = (data as { role?: string } | null)?.role;
  return role === 'owner' || role === 'admin';
}

export type CommunityBasics = {
  id: string;
  name: string;
  description: string;
  privacy: string;
  website: string;
  invite_code: string;
  owner_id: string;
  ownerName: string;
  logoUrl: string | null;
  bankName: string;
  accountNumber: string;
  accountName: string;
  phone: string;
  email: string;
  rules: string;
  emailDomain: string;
};

export async function getCommunityBasics(
  communityId: string,
): Promise<CommunityBasics | null> {
  const { data, error } = await supabase
    .from('communities')
    .select(
      'id,name,description,privacy,website,phone,email,rules,email_domain,invite_code,owner_id,logo_url,bank_name,account_number,account_name,owner:profiles!communities_owner_id_fkey(full_name)',
    )
    .eq('id', communityId)
    .single();
  if (error || !data) {
    // Old backends without the newer columns: retry without them.
    if (error && isMissingTable(error)) {
      return getCommunityBasicsLegacy(communityId);
    }
    return null;
  }
  const row = data as unknown as {
    id: string;
    name: string;
    description: string;
    privacy: string;
    website: string;
    phone: string | null;
    email: string | null;
    rules: string | null;
    email_domain: string | null;
    invite_code: string;
    owner_id: string;
    logo_url: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
    owner: { full_name: string | null } | null;
  };
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    privacy: String(row.privacy ?? ''),
    website: String(row.website ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    rules: String(row.rules ?? ''),
    emailDomain: String(row.email_domain ?? ''),
    invite_code: String(row.invite_code ?? ''),
    owner_id: String(row.owner_id ?? ''),
    ownerName: row.owner?.full_name ?? 'Staff',
    logoUrl: row.logo_url ? publicUrl('avatars', String(row.logo_url)) : null,
    bankName: String(row.bank_name ?? ''),
    accountNumber: String(row.account_number ?? ''),
    accountName: String(row.account_name ?? ''),
  };
}

async function getCommunityBasicsLegacy(
  communityId: string,
): Promise<CommunityBasics | null> {
  const { data, error } = await supabase
    .from('communities')
    .select(
      'id,name,description,privacy,website,invite_code,owner_id,logo_url,bank_name,account_number,account_name,owner:profiles!communities_owner_id_fkey(full_name)',
    )
    .eq('id', communityId)
    .single();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string;
    name: string;
    description: string;
    privacy: string;
    website: string;
    invite_code: string;
    owner_id: string;
    logo_url: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
    owner: { full_name: string | null } | null;
  };
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    privacy: String(row.privacy ?? ''),
    website: String(row.website ?? ''),
    phone: '',
    email: '',
    rules: '',
    emailDomain: '',
    invite_code: String(row.invite_code ?? ''),
    owner_id: String(row.owner_id ?? ''),
    ownerName: row.owner?.full_name ?? 'Staff',
    logoUrl: row.logo_url ? publicUrl('avatars', String(row.logo_url)) : null,
    bankName: String(row.bank_name ?? ''),
    accountNumber: String(row.account_number ?? ''),
    accountName: String(row.account_name ?? ''),
  };
}

export async function purgeExpiredCommunities(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('purge_expired_communities');
    if (error) return 0;
    return Number(data ?? 0);
  } catch {
    // Old backends have no purge yet.
    return 0;
  }
}

export async function exitCommunity(
  communityId: string,
): Promise<'left' | 'deleted' | 'transferred' | 'scheduled'> {
  const { data, error } = await supabase.rpc('exit_community', {
    p_community: communityId,
  });
  if (error) throw error;
  if (
    data !== 'left' &&
    data !== 'deleted' &&
    data !== 'transferred' &&
    data !== 'scheduled'
  ) {
    throw new Error('Could not leave.');
  }
  // Opportunistic cleanup of other expired communities.
  void purgeExpiredCommunities();
  bustCommunityCache();
  return data;
}

export async function deleteCommunity(communityId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_community', {
    p_community: communityId,
  });
  if (error) throw error;
  bustCommunityCache();
}

export async function transferCommunityOwnership(
  communityId: string,
  newOwnerId: string,
): Promise<void> {
  const { error } = await supabase.rpc('transfer_community_ownership', {
    p_community: communityId,
    p_new_owner: newOwnerId,
  });
  if (error) throw error;
  bustCommunityCache();
}

/**
 * Best-effort bucket cleanup after a community delete. Collects every
 * stored path while rows still exist, then removes them; failures are
 * swallowed so a stubborn file never blocks the delete.
 */
export async function collectCommunityFilePaths(
  communityId: string,
): Promise<{ bucket: string; path: string }[]> {
  const out: { bucket: string; path: string }[] = [];
  const push = (bucket: string, path: unknown) => {
    if (typeof path === 'string' && path) out.push({ bucket, path });
  };
  const [{ data: media }, { data: files }, { data: postMedia }, { data: posts }, { data: announcements }, { data: community }, { data: submissions }] =
    await Promise.all([
      supabase.from('community_media').select('path').eq('community_id', communityId),
      supabase.from('community_files').select('path').eq('community_id', communityId),
      supabase
        .from('post_media')
        .select('path,post:posts!post_media_post_id_fkey(community_id)')
        .eq('post.community_id', communityId),
      supabase.from('posts').select('image_url').eq('community_id', communityId),
      supabase.from('announcements').select('image_url').eq('community_id', communityId),
      supabase.from('communities').select('logo_url').eq('id', communityId).single(),
      supabase.from('form_submissions').select('payload').eq('community_id', communityId),
    ]);
  for (const r of (media as unknown as { path: string }[]) ?? []) {
    push('community-media', r.path);
  }
  for (const r of (files as unknown as { path: string }[]) ?? []) {
    push('community-files', r.path);
  }
  for (const r of (postMedia as unknown as { path: string }[]) ?? []) {
    push('post-media', r.path);
  }
  for (const r of (posts as unknown as { image_url: string | null }[]) ?? []) {
    push('post-media', r.image_url);
  }
  for (const r of (announcements as unknown as { image_url: string | null }[]) ?? []) {
    push('post-media', r.image_url);
  }
  push('avatars', (community as unknown as { logo_url: string | null } | null)?.logo_url);
  for (const r of (submissions as unknown as { payload: { evidence?: string[] } | null }[]) ?? []) {
    for (const path of r.payload?.evidence ?? []) push('evidence', path);
  }
  return out;
}

export async function removeCommunityFiles(
  paths: { bucket: string; path: string }[],
): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of paths) {
    const list = byBucket.get(bucket) ?? [];
    list.push(path);
    byBucket.set(bucket, list);
  }
  await Promise.all(
    [...byBucket.entries()].map(([bucket, list]) =>
      Promise.resolve(supabase.storage.from(bucket).remove(list)).then(
        () => {},
        () => {},
      ),
    ),
  );
}

export async function setCommunityBank(
  communityId: string,
  input: { bank: string; number: string; name: string },
): Promise<void> {
  const { error } = await supabase.rpc('set_community_bank', {
    p_community: communityId,
    p_bank: input.bank.trim(),
    p_number: input.number.trim(),
    p_name: input.name.trim(),
  });
  if (error) throw error;
}

export async function updateCommunityLogo(
  communityId: string,
  logoPath: string,
): Promise<void> {
  // Table UPDATE is owner-only: admins save through the RPC instead.
  const { error } = await supabase.rpc('update_community_logo', {
    p_community: communityId,
    p_logo: logoPath,
  });
  if (error) throw error;
}

export async function updateCommunity(
  communityId: string,
  input: { name: string; description: string; website: string; phone?: string },
): Promise<void> {
  const { error } = await supabase.rpc('update_community_fields', {
    p_community: communityId,
    p_name: input.name,
    p_description: input.description,
    p_website: input.website,
    p_phone: input.phone ?? '',
  });
  if (error) throw error;
}

/** Members refresh the public About + Website. */
export async function updateCommunityProfile(
  communityId: string,
  input: { description: string; website: string },
): Promise<void> {
  const { error } = await supabase.rpc('update_community_profile', {
    p_community: communityId,
    p_description: input.description,
    p_website: input.website,
  });
  if (error) throw error;
}

/** Admin extras: contact email + rules (1000 chars max) + work domain. */
export async function updateCommunityAdminFields(
  communityId: string,
  input: { email: string; rules: string; emailDomain?: string },
): Promise<void> {
  if (input.rules.trim().length > 1000) {
    throw new Error('Rules must be 1000 characters or less.');
  }
  const domain = (input.emailDomain ?? '').trim().toLowerCase();
  if (
    domain &&
    (domain.includes('@') || !domain.includes('.') || domain.includes(' '))
  ) {
    throw new Error('Enter a domain like company.com.');
  }
  const { error } = await supabase.rpc('update_community_admin_fields', {
    p_community: communityId,
    p_email: input.email,
    p_rules: input.rules,
    p_email_domain: domain,
  });
  if (error) throw error;
}

/** Exact-match lookup: which community approved this work domain? */
export async function findCommunityByEmailDomain(
  domain: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.rpc('find_community_by_email_domain', {
    p_domain: domain.trim().toLowerCase(),
  });
  if (error || !data) return null;
  const row = (
    Array.isArray(data) ? data[0] : data
  ) as { id?: string; name?: string } | null;
  if (!row?.id) return null;
  return { id: String(row.id), name: String(row.name ?? 'Community') };
}

/** Join after a work-email OTP check. Returns the membership status. */
export async function joinVerifiedCommunity(
  communityId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('join_verified_community', {
    p_community: communityId,
  });
  if (error) throw error;
  bustCommunityCache();
  return String(data ?? 'active');
}

export type TaskItem = {
  id: string;
  title: string;
  detail: string;
  status: 'open' | 'in_progress' | 'done';
  due_date: string | null;
  assignee_id: string | null;
  assigneeName: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  due_date: string | null;
  assignee_id: string | null;
  created_at: string;
  assignee: { full_name: string | null } | null;
};

function mapTask(
  row: TaskRow,
  extra?: { ids: string[]; names: string[] },
): TaskItem {
  const firstId = row.assignee_id ? String(row.assignee_id) : null;
  const firstName = row.assignee?.full_name ?? null;
  const ids =
    extra && extra.ids.length > 0 ? extra.ids : firstId ? [firstId] : [];
  const names =
    extra && extra.names.length > 0
      ? extra.names
      : firstName
        ? [firstName]
        : [];
  return {
    id: String(row.id),
    title: String(row.title),
    detail: String(row.detail ?? ''),
    status:
      row.status === 'done'
        ? 'done'
        : row.status === 'in_progress'
          ? 'in_progress'
          : 'open',
    due_date: row.due_date ? String(row.due_date) : null,
    assignee_id: firstId,
    assigneeName: firstName,
    assigneeIds: ids,
    assigneeNames: names,
    created_at: String(row.created_at),
  };
}

export async function listTasks(
  communityId: string,
  opts: {
    status?: 'open' | 'in_progress' | 'done' | 'all';
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ tasks: TaskItem[]; unsupported: boolean }> {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  try {
    let query = supabase
      .from('community_tasks')
      .select(
        'id,title,detail,status,due_date,assignee_id,created_at,assignee:profiles!community_tasks_assignee_id_fkey(full_name)',
      )
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (
      opts.status === 'open' ||
      opts.status === 'in_progress' ||
      opts.status === 'done'
    ) {
      query = query.eq('status', opts.status);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as unknown as TaskRow[]) ?? [];
    // Extra assignees ride in a second table; stale backends without it
    // fall back to the single assignee column.
    let extraByTask = new Map<string, { ids: string[]; names: string[] }>();
    const ids = rows.map((r) => String(r.id));
    if (ids.length > 0) {
      try {
        const { data: links, error: linkError } = await supabase
          .from('task_assignees')
          .select('task_id,user_id,user:profiles!task_assignees_user_id_fkey(full_name)')
          .in('task_id', ids);
        if (linkError) throw linkError;
        type LinkRow = {
          task_id: string;
          user_id: string;
          user: { full_name: string | null } | null;
        };
        for (const link of ((links as unknown as LinkRow[]) ?? [])) {
          const key = String(link.task_id);
          const slot = extraByTask.get(key) ?? { ids: [], names: [] };
          slot.ids.push(String(link.user_id));
          slot.names.push(link.user?.full_name ?? 'Staff Member');
          extraByTask.set(key, slot);
        }
      } catch (err) {
        if (!isMissingTable(err)) throw err;
      }
    }
    return {
      tasks: rows.map((row) =>
        mapTask(row, extraByTask.get(String(row.id))),
      ),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { tasks: [], unsupported: true };
    throw err;
  }
}

export async function createTask(
  communityId: string,
  input: {
    title: string;
    detail: string;
    due_date: string;
    assignee_ids: string[];
  },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const unique = [...new Set(input.assignee_ids)];
  const { data, error } = await supabase
    .from('community_tasks')
    .insert({
      community_id: communityId,
      created_by: user.id,
      title: input.title.trim(),
      detail: input.detail.trim(),
      status: 'open',
      due_date: input.due_date.trim() || null,
      assignee_id: unique[0] ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create task.');
  if (unique.length === 0) return;
  const taskId = (data as { id: string }).id;
  const { error: linkError } = await supabase.from('task_assignees').insert(
    unique.map((userId) => ({ task_id: taskId, user_id: userId })),
  );
  if (linkError && !isMissingTable(linkError)) throw linkError;
}

export async function setTaskStatus(
  taskId: string,
  status: 'open' | 'in_progress' | 'done',
): Promise<void> {
  const { error } = await supabase
    .from('community_tasks')
    .update({ status })
    .eq('id', taskId);
  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('community_tasks')
    .delete()
    .eq('id', taskId);
  if (error) throw error;
}

export type ProjectItem = {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'done';
  created_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
};

function mapProject(row: ProjectRow): ProjectItem {
  const status =
    row.status === 'active' || row.status === 'done' ? row.status : 'planning';
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    status,
    created_at: String(row.created_at),
  };
}

export async function listProjects(
  communityId: string,
): Promise<{ projects: ProjectItem[]; unsupported: boolean }> {
  try {
    const { data, error } = await supabase
      .from('community_projects')
      .select('id,name,description,status,created_at')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    return {
      projects: ((data as unknown as ProjectRow[]) ?? []).map(mapProject),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { projects: [], unsupported: true };
    throw err;
  }
}

export async function createProject(
  communityId: string,
  input: { name: string; description: string },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('community_projects').insert({
    community_id: communityId,
    created_by: user.id,
    name: input.name.trim(),
    description: input.description.trim(),
    status: 'planning',
  });
  if (error) throw error;
}

export async function setProjectStatus(
  projectId: string,
  status: ProjectItem['status'],
): Promise<void> {
  const { error } = await supabase
    .from('community_projects')
    .update({ status })
    .eq('id', projectId);
  if (error) throw error;
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('community_projects')
    .delete()
    .eq('id', projectId);
  if (error) throw error;
}

export type MediaItem = {
  id: string;
  path: string;
  kind: 'image' | 'video' | 'link';
  caption: string;
  created_at: string;
  authorName: string;
  mine: boolean;
};

export async function listMedia(
  communityId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: MediaItem[]; unsupported: boolean }> {
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('community_media')
      .select(
        'id,path,kind,caption,created_at,created_by,author:profiles!community_media_created_by_fkey(full_name)',
      )
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    type Row = {
      id: string;
      path: string;
      kind: string;
      caption: string;
      created_at: string;
      created_by: string;
      author: { full_name: string | null } | null;
    };
    return {
      items: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        path: String(r.path),
        kind: r.kind === 'video' ? 'video' : r.kind === 'link' ? 'link' : 'image',
        caption: String(r.caption ?? ''),
        created_at: String(r.created_at),
        authorName: r.author?.full_name ?? 'Staff Member',
        mine: r.created_by === user?.id,
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { items: [], unsupported: true };
    throw err;
  }
}

export function kindOfAsset(mimeType: string | undefined, name: string): 'image' | 'video' {
  if ((mimeType ?? '').startsWith('video/')) return 'video';
  if ((mimeType ?? '').startsWith('image/')) return 'image';
  return /\.(mp4|mov|webm|mkv|avi)$/i.test(name) ? 'video' : 'image';
}

export async function uploadMedia(
  communityId: string,
  files: PickedAsset[],
  caption: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  for (const file of files) {
    const { path } = await uploadToBucket(
      'community-media',
      communityId,
      file,
      MAX_MEDIA_BYTES,
    );
    const { error } = await supabase.from('community_media').insert({
      community_id: communityId,
      created_by: user.id,
      path,
      kind: kindOfAsset(file.mimeType, file.name),
      caption: caption.trim(),
    });
    if (error) throw error;
  }
}

export async function deleteMediaItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('community_media')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export type GalleryItem = {
  id: string;
  bucket: 'community-media' | 'post-media';
  path: string;
  kind: 'image' | 'video';
  caption: string;
  created_at: string;
  authorName: string;
  postId: string | null;
  mediaId: string | null;
  mine: boolean;
};

/**
 * Everything shared in the community, newest first: uploaded media plus
 * every picture attached to a community post. Nothing here is added by
 * hand; posting is what fills the gallery.
 */
export async function listCommunityGallery(
  communityId: string,
): Promise<{ items: GalleryItem[]; unsupported: boolean }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [mediaRes, postsRes, attachmentsRes] = await Promise.all([
      supabase
        .from('community_media')
        .select(
          'id,path,kind,caption,created_at,created_by,author:profiles!community_media_created_by_fkey(full_name)',
        )
        .eq('community_id', communityId)
        .neq('kind', 'link')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('posts')
        .select(
          'id,image_url,created_at,author_id,author:profiles!posts_author_id_fkey(full_name)',
        )
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('post_media')
        .select(
          'path,position,post:posts!inner(id,community_id,image_url,created_at,author_id,author:profiles!posts_author_id_fkey(full_name))',
        )
        .eq('post.community_id', communityId)
        .order('position', { ascending: true })
        .limit(400),
    ]);
    if (mediaRes.error) throw mediaRes.error;
    // Post pictures enrich the gallery but must never blank it: older
    // backends may lack the image column entirely.
    const postRows =
      postsRes.error || !postsRes.data
        ? []
        : (postsRes.data as unknown as PostRow[]);
    type MediaRow = {
      id: string;
      path: string;
      kind: string;
      caption: string;
      created_at: string;
      created_by: string;
      author: { full_name: string | null } | null;
    };
    type PostRow = {
      id: string;
      image_url: string | null;
      created_at: string;
      author_id: string;
      author: { full_name: string | null } | null;
    };
    type AttachmentRow = {
      path: string;
      post: PostRow | null;
    };
    const items: GalleryItem[] = [];
    for (const r of ((mediaRes.data as unknown as MediaRow[]) ?? [])) {
      items.push({
        id: `m:${r.id}`,
        bucket: 'community-media',
        path: String(r.path),
        kind: r.kind === 'video' ? 'video' : 'image',
        caption: String(r.caption ?? ''),
        created_at: String(r.created_at),
        authorName: r.author?.full_name ?? 'Staff Member',
        postId: null,
        mediaId: String(r.id),
        mine: r.created_by === user?.id,
      });
    }
    const seen = new Set<string>();
    const pushPostPath = (post: PostRow, path: string) => {
      const key = `${post.id}:${path}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id: `p:${key}`,
        bucket: 'post-media',
        path,
        kind: /\.(mp4|mov|webm|mkv|avi)$/i.test(path) ? 'video' : 'image',
        caption: '',
        created_at: String(post.created_at),
        authorName: post.author?.full_name ?? 'Staff Member',
        postId: String(post.id),
        mediaId: null,
        mine: post.author_id === user?.id,
      });
    };
    for (const r of postRows) {
      if (r.image_url) pushPostPath(r, String(r.image_url));
    }
    const attachmentRows =
      attachmentsRes.error || !attachmentsRes.data
        ? []
        : (attachmentsRes.data as unknown as AttachmentRow[]);
    for (const r of attachmentRows) {
      if (r.post) pushPostPath(r.post, String(r.path));
    }
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { items, unsupported: false };
  } catch (err) {
    if (isMissingTable(err)) return { items: [], unsupported: true };
    throw err;
  }
}

export type FileVisibility = 'all' | 'admin' | 'selected';

export type FileItem = {
  id: string;
  name: string;
  path: string;
  size_bytes: number;
  mime: string;
  folder_id: string | null;
  visibility: FileVisibility;
  created_at: string;
  authorName: string;
  mine: boolean;
};

const FILE_SELECT_WITH_VISIBILITY =
  'id,name,path,size_bytes,mime,folder_id,visibility,created_at,created_by,author:profiles!community_files_created_by_fkey(full_name)';
const FILE_SELECT_BASE =
  'id,name,path,size_bytes,mime,folder_id,created_at,created_by,author:profiles!community_files_created_by_fkey(full_name)';

function asVisibility(value: unknown): FileVisibility {
  return value === 'admin' || value === 'selected' ? value : 'all';
}

export async function listFiles(
  communityId: string,
  opts: { folderId?: string | null } = {},
): Promise<{ files: FileItem[]; unsupported: boolean }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const build = (select: string) => {
      let query = supabase
        .from('community_files')
        .select(select)
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (opts.folderId !== undefined) {
        query =
          opts.folderId === null
            ? query.is('folder_id', null)
            : query.eq('folder_id', opts.folderId);
      }
      return query;
    };
    const withVisibility = await build(FILE_SELECT_WITH_VISIBILITY);
    let data = withVisibility.data;
    let error = withVisibility.error;
    if (error && isMissingTable(error)) {
      // Backend predates 20261114_file_visibility.sql: everything is visible.
      const fallback = await build(FILE_SELECT_BASE);
      data = fallback.data as unknown as typeof data;
      error = fallback.error;
    }
    if (error) throw error;
    type Row = {
      id: string;
      name: string;
      path: string;
      size_bytes: number;
      mime: string;
      folder_id: string | null;
      visibility?: string | null;
      created_at: string;
      created_by: string;
      author: { full_name: string | null } | null;
    };
    return {
      files: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        path: String(r.path),
        size_bytes: Number(r.size_bytes ?? 0),
        mime: String(r.mime ?? ''),
        folder_id: r.folder_id ? String(r.folder_id) : null,
        visibility: asVisibility(r.visibility),
        created_at: String(r.created_at),
        authorName: r.author?.full_name ?? 'Staff Member',
        mine: r.created_by === user?.id,
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { files: [], unsupported: true };
    throw err;
  }
}

export async function uploadCommunityFiles(
  communityId: string,
  files: PickedAsset[],
  folderId: string | null = null,
  opts: { visibility?: FileVisibility; memberIds?: string[] } = {},
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const visibility = opts.visibility ?? 'all';
  if (visibility !== 'all' && !(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can restrict visibility.');
  }
  for (const file of files) {
    const uploaded = await uploadToBucket(
      'community-files',
      communityId,
      file,
      MAX_FILE_BYTES,
    );
    const insertBase = {
      community_id: communityId,
      created_by: user.id,
      name: file.name,
      path: uploaded.path,
      size_bytes: uploaded.size,
      mime: uploaded.mime,
      folder_id: folderId,
    };
    let rowId: string | null = null;
    try {
      const { data, error } = await supabase
        .from('community_files')
        .insert({ ...insertBase, visibility })
        .select('id')
        .single();
      if (error) throw error;
      rowId = String((data as { id: string }).id);
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      // Backend predates visibility: store the file without it.
      const { data, error } = await supabase
        .from('community_files')
        .insert(insertBase)
        .select('id')
        .single();
      if (error) throw error;
      rowId = String((data as { id: string }).id);
    }
    if (visibility === 'selected' && opts.memberIds?.length) {
      await setVisibleMembers(communityId, {
        fileId: rowId,
        userIds: opts.memberIds,
      });
    }
  }
}

export async function deleteFileItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('community_files')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export type PublicCommunity = {
  id: string;
  name: string;
  description: string;
  website: string;
  rule: string;
};

export async function listPublicCommunities(
  search: string,
): Promise<PublicCommunity[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mine } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('user_id', user.id);
  const myIds = new Set(
    ((mine as unknown as { community_id: string }[]) ?? []).map(
      (m) => m.community_id,
    ),
  );
  let query = supabase
    .from('communities')
    .select('id,name,description,website,who_can_join')
    .eq('privacy', 'public')
    .order('name', { ascending: true })
    .limit(50);
  const needle = search.trim().replace(/[%_]/g, '');
  if (needle) query = query.ilike('name', `%${needle}%`);
  const { data, error } = await query;
  if (error || !data) return [];
  type Row = {
    id: string;
    name: string;
    description: string;
    website: string;
    who_can_join: string;
  };
  return ((data as unknown as Row[]) ?? [])
    .filter((r) => !myIds.has(r.id))
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ''),
      website: String(r.website ?? ''),
      rule: String(r.who_can_join ?? 'approval').toLowerCase(),
    }));
}

export async function requestToJoin(
  communityId: string,
): Promise<'active' | 'pending'> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data: community } = await supabase
    .from('communities')
    .select('who_can_join')
    .eq('id', communityId)
    .single();
  const rule = String(
    (community as { who_can_join?: string } | null)?.who_can_join ?? 'approval',
  ).toLowerCase();
  if (rule === 'invite') {
    throw new Error('This community requires an invite code.');
  }
  const status = rule === 'anyone' ? 'active' : 'pending';
  const { error } = await supabase.from('community_members').insert({
    community_id: communityId,
    user_id: user.id,
    role: 'member',
    status,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') return status;
    throw error;
  }
  bustCommunityCache();
  return status;
}

export type EventDetail = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  banner_url: string | null;
  banner_kind: 'image' | 'video';
  community_id: string | null;
  communityName: string | null;
};

export async function getEvent(id: string): Promise<EventDetail | null> {
  try {
    let { data, error } = await supabase
      .from('events')
      .select(
        'id,title,event_date,event_time,banner_url,banner_kind,community_id,community:communities!events_community_id_fkey(name)',
      )
      .eq('id', id)
      .single();
    if (error && /banner_kind/.test(String(error.message ?? ''))) {
      // Stale backend without the video-banner column: every banner there
      // is an image, so reread without the kind instead of degrading.
      ({ data, error } = await supabase
        .from('events')
        .select(
          'id,title,event_date,event_time,banner_url,community_id,community:communities!events_community_id_fkey(name)',
        )
        .eq('id', id)
        .single());
    }
    if (error) throw error;
    const row = data as unknown as {
      id: string;
      title: string;
      event_date: string;
      event_time: string;
      banner_url: string | null;
      banner_kind: string | null;
      community_id: string | null;
      community: { name: string } | null;
    };
    return {
      id: String(row.id),
      title: String(row.title),
      event_date: String(row.event_date),
      event_time: String(row.event_time ?? ''),
      banner_url: row.banner_url ? String(row.banner_url) : null,
      banner_kind: row.banner_kind === 'video' ? 'video' : 'image',
      community_id: row.community_id ? String(row.community_id) : null,
      communityName: row.community?.name ?? null,
    };
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  const { data, error } = await supabase
    .from('events')
    .select('id,title,event_date,event_time')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  const row = data as unknown as EventDetail;
  return {
    id: String(row.id),
    title: String(row.title),
    event_date: String(row.event_date),
    event_time: String(row.event_time ?? ''),
    banner_url: null,
    banner_kind: 'image',
    community_id: null,
    communityName: null,
  };
}

export async function createEvent(input: {
  communityId: string | null;
  title: string;
  date: string;
  time: string;
  bannerPath?: string | null;
  bannerKind?: 'image' | 'video';
}): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const base: Record<string, unknown> = {
    title: input.title.trim(),
    event_date: input.date.trim(),
    event_time: input.time.trim(),
    created_by: user.id,
  };
  if (input.bannerPath) {
    base.banner_url = input.bannerPath;
    // 'image' is the database default, so only video touches the new
    // column: image events stay writable on a backend that predates it.
    if (input.bannerKind === 'video') base.banner_kind = 'video';
  }
  if (input.communityId) {
    try {
      const { data, error } = await supabase
        .from('events')
        .insert({ ...base, community_id: input.communityId })
        .select('id')
        .single();
      if (!error && data) return String((data as { id: string }).id);
      if (error) {
        const message = String(
          (error as { message?: string }).message ?? error,
        );
        if (input.bannerPath && /column|schema|PGRST/i.test(message)) {
          throw new Error(
            'Event banners need the latest database update. Ask your admin to apply it.',
          );
        }
        if (!isMissingTable(error) && !/column/i.test(message)) throw error;
      }
    } catch (err) {
      if (!isMissingTable(err)) throw err;
    }
  }
  const { data, error } = await supabase
    .from('events')
    .insert(base)
    .select('id')
    .single();
  if (error || !data) {
    if (input.bannerPath && error) {
      const message = String(
        (error as { message?: string }).message ?? error,
      );
      if (/column|schema|PGRST/i.test(message)) {
        throw new Error(
          'Event banners need the latest database update. Ask your admin to apply it.',
        );
      }
    }
    throw error ?? new Error('Could not create event.');
  }
  return String((data as { id: string }).id);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function updateEvent(
  id: string,
  input: {
    title: string;
    date: string;
    time: string;
    /** New banner path, null to remove, undefined to keep. */
    bannerPath?: string | null;
    /** Kind of the replacement banner; required when replacing. */
    bannerKind?: 'image' | 'video';
  },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const base: Record<string, unknown> = {
    title: input.title.trim(),
    event_date: input.date.trim(),
    event_time: input.time.trim(),
  };
  if (input.bannerPath !== undefined) {
    const next: Record<string, unknown> = {
      ...base,
      banner_url: input.bannerPath,
    };
    if (typeof input.bannerPath === 'string') {
      // Replacing resets the kind too, so a video never masquerades as
      // an image (or the reverse) after a swap.
      next.banner_kind = input.bannerKind === 'video' ? 'video' : 'image';
    }
    try {
      const { error } = await supabase
        .from('events')
        .update(next)
        .eq('id', id);
      if (!error) return;
      const message = String(
        (error as { message?: string }).message ?? error,
      );
      if (!/column|schema|PGRST/i.test(message)) throw error;
      if (input.bannerPath) {
        throw new Error(
          'Event banners need the latest database update. Ask your admin to apply it.',
        );
      }
    } catch (err) {
      if (!isMissingTable(err)) throw err;
    }
  }
  const { error } = await supabase.from('events').update(base).eq('id', id);
  if (error) throw error;
}

/**
 * Best-effort stale-event sweep: removes events 5+ working days past.
 * Runs nightly server-side too; safe to call on every events load.
 */
export async function purgeStaleEvents(): Promise<void> {
  try {
    await supabase.rpc('purge_stale_events');
  } catch {
    // Old backend or offline: the nightly job (or a later load) covers it.
  }
}

export async function getRsvpSummary(
  eventId: string,
): Promise<{ going: number; mine: boolean; unsupported: boolean }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ count, error }, mineRes] = await Promise.all([
      supabase
        .from('event_rsvps')
        .select('user_id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'going'),
      user
        ? supabase
            .from('event_rsvps')
            .select('status')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (error) throw error;
    if (mineRes.error && (mineRes.error as { code?: string }).code !== 'PGRST116') {
      throw mineRes.error;
    }
    return {
      going: count ?? 0,
      mine:
        (mineRes.data as { status?: string } | null)?.status === 'going',
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { going: 0, mine: false, unsupported: true };
    throw err;
  }
}

export async function setRsvp(eventId: string, going: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (!going) {
    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', user.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('event_rsvps')
    .upsert(
      { event_id: eventId, user_id: user.id, status: 'going' },
      { onConflict: 'event_id,user_id' },
    );
  if (error) throw error;
}

// ── File folders ───────────────────────────────────────────────────────

export type FolderItem = {
  id: string;
  name: string;
  visibility: FileVisibility;
  created_at: string;
};

const FOLDER_SELECT_WITH_VISIBILITY = 'id,name,visibility,created_at';
const FOLDER_SELECT_BASE = 'id,name,created_at';

export async function listFolders(
  communityId: string,
): Promise<{ folders: FolderItem[]; unsupported: boolean }> {
  try {
    const build = (select: string) =>
      supabase
        .from('community_file_folders')
        .select(select)
        .eq('community_id', communityId)
        .order('name', { ascending: true })
        .limit(100);
    const withVisibility = await build(FOLDER_SELECT_WITH_VISIBILITY);
    let data = withVisibility.data;
    let error = withVisibility.error;
    if (error && isMissingTable(error)) {
      // Backend predates 20261114_file_visibility.sql: everything is visible.
      const fallback = await build(FOLDER_SELECT_BASE);
      data = fallback.data as unknown as typeof data;
      error = fallback.error;
    }
    if (error) throw error;
    type Row = {
      id: string;
      name: string;
      visibility?: string | null;
      created_at: string;
    };
    return {
      folders: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        visibility: asVisibility(r.visibility),
        created_at: String(r.created_at),
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { folders: [], unsupported: true };
    throw err;
  }
}

export async function createFolder(
  communityId: string,
  name: string,
  opts: { visibility?: FileVisibility; memberIds?: string[] } = {},
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can create folders.');
  }
  if (name.trim().length < 1) throw new Error('Give the folder a name.');
  const visibility = opts.visibility ?? 'all';
  const insertBase = {
    community_id: communityId,
    name: name.trim().slice(0, 60),
    created_by: user.id,
  };
  let folderId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('community_file_folders')
      .insert({ ...insertBase, visibility })
      .select('id')
      .single();
    if (error) throw error;
    folderId = String((data as { id: string }).id);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    // Backend predates visibility: store the folder without it.
    const { data, error } = await supabase
      .from('community_file_folders')
      .insert(insertBase)
      .select('id')
      .single();
    if (error) throw error;
    folderId = String((data as { id: string }).id);
  }
  if (visibility === 'selected' && opts.memberIds?.length) {
    await setVisibleMembers(communityId, {
      folderId,
      userIds: opts.memberIds,
    });
  }
}

export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase
    .from('community_file_folders')
    .delete()
    .eq('id', folderId);
  if (error) throw error;
}

async function setVisibleMembers(
  communityId: string,
  target: { folderId: string; userIds: string[] } | { fileId: string; userIds: string[] },
): Promise<void> {
  const rows = [...new Set(target.userIds)].filter(Boolean).map((userId) => ({
    community_id: communityId,
    folder_id: 'folderId' in target ? target.folderId : null,
    file_id: 'fileId' in target ? target.fileId : null,
    user_id: userId,
  }));
  if ('folderId' in target) {
    await supabase
      .from('community_file_visible_members')
      .delete()
      .eq('folder_id', target.folderId);
  } else {
    await supabase
      .from('community_file_visible_members')
      .delete()
      .eq('file_id', target.fileId);
  }
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('community_file_visible_members')
    .insert(rows);
  if (error) throw error;
}

async function requireFolderAdmin(folderId: string): Promise<string> {
  const { data, error } = await supabase
    .from('community_file_folders')
    .select('community_id')
    .eq('id', folderId)
    .single();
  if (error || !data) throw new Error('Folder not found.');
  const communityId = String((data as { community_id: string }).community_id);
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can change visibility.');
  }
  return communityId;
}

async function requireFileAdmin(fileId: string): Promise<string> {
  const { data, error } = await supabase
    .from('community_files')
    .select('community_id')
    .eq('id', fileId)
    .single();
  if (error || !data) throw new Error('File not found.');
  const communityId = String((data as { community_id: string }).community_id);
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can change visibility.');
  }
  return communityId;
}

export async function setFolderVisibility(
  folderId: string,
  visibility: FileVisibility,
  memberIds: string[] = [],
): Promise<void> {
  const communityId = await requireFolderAdmin(folderId);
  const { error } = await supabase
    .from('community_file_folders')
    .update({ visibility })
    .eq('id', folderId);
  if (error) throw error;
  await setVisibleMembers(communityId, {
    folderId,
    userIds: visibility === 'selected' ? memberIds : [],
  });
}

export async function setFileVisibility(
  fileId: string,
  visibility: FileVisibility,
  memberIds: string[] = [],
): Promise<void> {
  const communityId = await requireFileAdmin(fileId);
  const { error } = await supabase
    .from('community_files')
    .update({ visibility })
    .eq('id', fileId);
  if (error) throw error;
  await setVisibleMembers(communityId, {
    fileId,
    userIds: visibility === 'selected' ? memberIds : [],
  });
}

export async function listVisibleMembers(target: { folderId: string } | { fileId: string }): Promise<string[]> {
  let query = supabase.from('community_file_visible_members').select('user_id');
  query =
    'folderId' in target
      ? query.eq('folder_id', target.folderId)
      : query.eq('file_id', target.fileId);
  const { data, error } = await query.limit(200);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return ((data as unknown as { user_id: string }[]) ?? []).map((r) =>
    String(r.user_id),
  );
}

// ── Media links ────────────────────────────────────────────────────────

export async function addMediaLink(
  communityId: string,
  title: string,
  url: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const clean = url.trim();
  if (!/^https?:\/\/.+\..+/.test(clean)) {
    throw new Error('Enter a valid link starting with http(s).');
  }
  const { error } = await supabase.from('community_media').insert({
    community_id: communityId,
    created_by: user.id,
    path: clean,
    kind: 'link',
    caption: title.trim().slice(0, 120) || clean,
  });
  if (error) throw error;
}

// ── Google-form links ──────────────────────────────────────────────────

export type FormLink = {
  id: string;
  title: string;
  url: string;
  created_at: string;
  authorName: string;
  mine: boolean;
};

export async function listFormLinks(
  communityId: string,
): Promise<{ links: FormLink[]; unsupported: boolean }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('community_form_links')
      .select(
        'id,title,url,created_at,created_by,author:profiles!community_form_links_created_by_fkey(full_name)',
      )
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    type Row = {
      id: string;
      title: string;
      url: string;
      created_at: string;
      created_by: string;
      author: { full_name: string | null } | null;
    };
    return {
      links: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        url: String(r.url),
        created_at: String(r.created_at),
        authorName: r.author?.full_name ?? 'Staff Member',
        mine: r.created_by === user?.id,
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { links: [], unsupported: true };
    throw err;
  }
}

export async function createFormLink(
  communityId: string,
  title: string,
  url: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (title.trim().length < 3) throw new Error('Give the form a title.');
  const clean = url.trim();
  if (!/^https?:\/\/.+\..+/.test(clean)) {
    throw new Error('Enter a valid link starting with http(s).');
  }
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can add form links.');
  }
  const { error } = await supabase.from('community_form_links').insert({
    community_id: communityId,
    created_by: user.id,
    title: title.trim().slice(0, 120),
    url: clean,
  });
  if (error) throw error;
}

export async function deleteFormLink(id: string): Promise<void> {
  const { error } = await supabase
    .from('community_form_links')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Meeting rooms ──────────────────────────────────────────────────────

export type Meeting = {
  id: string;
  name: string;
  kind: 'room' | 'podcast' | 'management';
  conversation_id: string | null;
  created_at: string;
};

export async function listMeetings(
  communityId: string,
): Promise<{ meetings: Meeting[]; unsupported: boolean }> {
  try {
    const { data, error } = await supabase
      .from('community_meetings')
      .select('id,name,kind,conversation_id,created_at')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    type Row = {
      id: string;
      name: string;
      kind: string;
      conversation_id: string | null;
      created_at: string;
    };
    return {
      meetings: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        kind:
          r.kind === 'podcast'
            ? 'podcast'
            : r.kind === 'management'
              ? 'management'
              : 'room',
        conversation_id: r.conversation_id ? String(r.conversation_id) : null,
        created_at: String(r.created_at),
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { meetings: [], unsupported: true };
    throw err;
  }
}

export async function createMeeting(
  communityId: string,
  input: {
    name: string;
    kind: 'room' | 'podcast' | 'management';
    conversationId: string | null;
  },
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only admins can create meeting rooms.');
  }
  if (input.name.trim().length < 3) {
    throw new Error('Give the room a name (3+ characters).');
  }
  const { data, error } = await supabase
    .from('community_meetings')
    .insert({
      community_id: communityId,
      created_by: user.id,
      name: input.name.trim().slice(0, 60),
      kind: input.kind,
      conversation_id: input.conversationId,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create room.');
  return String((data as { id: string }).id);
}

export type MeetingDetail = Meeting & {
  community_id: string | null;
  communityName: string | null;
};

export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  const { data, error } = await supabase
    .from('community_meetings')
    .select(
      'id,name,kind,conversation_id,created_at,community_id,community:communities!community_meetings_community_id_fkey(name)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string;
    name: string;
    kind: string;
    conversation_id: string | null;
    created_at: string;
    community_id: string | null;
    community: { name: string } | null;
  };
  return {
    id: String(row.id),
    name: String(row.name),
    kind:
      row.kind === 'podcast'
        ? 'podcast'
        : row.kind === 'management'
          ? 'management'
          : 'room',
    conversation_id: row.conversation_id ? String(row.conversation_id) : null,
    created_at: String(row.created_at),
    community_id: row.community_id ? String(row.community_id) : null,
    communityName: row.community?.name ?? null,
  };
}

export type MeetingMember = { userId: string; name: string };

export async function listMeetingMembers(
  meetingId: string,
): Promise<MeetingMember[]> {
  try {
    const { data, error } = await supabase
      .from('meeting_members')
      .select(
        'user_id,profile:profiles!meeting_members_user_id_fkey(full_name)',
      )
      .eq('meeting_id', meetingId)
      .order('added_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    type Row = {
      user_id: string;
      profile: { full_name: string | null } | null;
    };
    return ((data as unknown as Row[]) ?? []).map((r) => ({
      userId: String(r.user_id),
      name: r.profile?.full_name ?? 'Staff Member',
    }));
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

/** Replace the invited list (admin only, enforced server-side too). */
export async function setMeetingMembers(
  meetingId: string,
  userIds: string[],
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const unique = [...new Set(userIds)];
  const { error: delError } = await supabase
    .from('meeting_members')
    .delete()
    .eq('meeting_id', meetingId);
  if (delError) throw delError;
  if (unique.length === 0) return;
  const { error } = await supabase.from('meeting_members').insert(
    unique.map((userId) => ({
      meeting_id: meetingId,
      user_id: userId,
      added_by: user.id,
    })),
  );
  if (error) throw error;
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase
    .from('community_meetings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Personal events ────────────────────────────────────────────────────

export type PersonalEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  done: boolean;
};

export async function listPersonalEvents(
  communityId?: string | null,
): Promise<{
  items: PersonalEvent[];
  unsupported: boolean;
}> {
  try {
    let query = supabase
      .from('personal_events')
      .select('id,title,event_date,event_time,done')
      .order('event_date', { ascending: true })
      .limit(100);
    if (communityId) {
      // Legacy rows without a community stay visible everywhere.
      query = query.or(`community_id.eq.${communityId},community_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw error;
    type Row = {
      id: string;
      title: string;
      event_date: string;
      event_time: string;
      done: boolean;
    };
    return {
      items: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        event_date: String(r.event_date),
        event_time: String(r.event_time ?? ''),
        done: !!r.done,
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { items: [], unsupported: true };
    throw err;
  }
}

export async function createPersonalEvent(input: {
  title: string;
  date: string;
  time: string;
  communityId?: string | null;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (input.title.trim().length < 3) {
    throw new Error('Give the event a title.');
  }
  const { error } = await supabase.from('personal_events').insert({
    user_id: user.id,
    community_id: input.communityId ?? null,
    title: input.title.trim(),
    event_date: input.date.trim(),
    event_time: input.time.trim(),
  });
  if (error) throw error;
}

export async function setPersonalEventDone(
  id: string,
  done: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('personal_events')
    .update({ done })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePersonalEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('personal_events')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Community polls ──────────────────────────────────────────────────

export type PollSummary = {
  id: string;
  question: string;
  closed: boolean;
  created_at: string;
  voteCount: number;
  voted: boolean;
};

export async function listPolls(communityId: string): Promise<{
  items: PollSummary[];
  unsupported: boolean;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('community_polls')
      .select('id,question,closed,created_at')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    type Row = {
      id: string;
      question: string;
      closed: boolean;
      created_at: string;
    };
    const polls = ((data as unknown as Row[]) ?? []).map((r) => ({
      id: String(r.id),
      question: String(r.question),
      closed: !!r.closed,
      created_at: String(r.created_at),
    }));
    if (polls.length === 0) return { items: [], unsupported: false };
    const { data: votes } = await supabase
      .from('poll_votes')
      .select('poll_id,user_id')
      .in(
        'poll_id',
        polls.map((p) => p.id),
      )
      .limit(5000);
    type VoteRow = { poll_id: string; user_id: string };
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const v of ((votes as unknown as VoteRow[]) ?? [])) {
      const key = String(v.poll_id);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (user && String(v.user_id) === user.id) mine.add(key);
    }
    return {
      items: polls.map((p) => ({
        ...p,
        voteCount: counts.get(p.id) ?? 0,
        voted: mine.has(p.id),
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { items: [], unsupported: true };
    throw err;
  }
}

export type PollDetail = {
  id: string;
  communityId: string;
  question: string;
  closed: boolean;
  created_at: string;
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  myOptionId: string | null;
};

export async function getPoll(pollId: string): Promise<PollDetail | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: poll, error } = await supabase
    .from('community_polls')
    .select('id,community_id,question,closed,created_at')
    .eq('id', pollId)
    .single();
  if (error || !poll) return null;
  const row = poll as unknown as {
    id: string;
    community_id: string;
    question: string;
    closed: boolean;
    created_at: string;
  };
  const [{ data: options }, { data: votes }] = await Promise.all([
    supabase
      .from('poll_options')
      .select('id,label')
      .eq('poll_id', pollId)
      .order('position', { ascending: true }),
    supabase.from('poll_votes').select('option_id,user_id').eq('poll_id', pollId).limit(5000),
  ]);
  type OptionRow = { id: string; label: string };
  type VoteRow = { option_id: string; user_id: string };
  const counts = new Map<string, number>();
  let mine: string | null = null;
  for (const v of ((votes as unknown as VoteRow[]) ?? [])) {
    const key = String(v.option_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (user && String(v.user_id) === user.id) mine = key;
  }
  const list = ((options as unknown as OptionRow[]) ?? []).map((o) => ({
    id: String(o.id),
    label: String(o.label),
    votes: counts.get(String(o.id)) ?? 0,
  }));
  return {
    id: String(row.id),
    communityId: String(row.community_id),
    question: String(row.question),
    closed: !!row.closed,
    created_at: String(row.created_at),
    options: list,
    totalVotes: list.reduce((n, o) => n + o.votes, 0),
    myOptionId: mine,
  };
}

export async function createPoll(
  communityId: string,
  question: string,
  options: string[],
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only an admin can create a poll.');
  }
  const clean = options.map((o) => o.trim()).filter(Boolean);
  if (question.trim().length < 3) throw new Error('Ask a question.');
  if (clean.length < 2) throw new Error('Add at least two options.');
  const { data, error } = await supabase
    .from('community_polls')
    .insert({
      community_id: communityId,
      question: question.trim(),
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create poll.');
  const pollId = String((data as { id: string }).id);
  const { error: optError } = await supabase.from('poll_options').insert(
    clean.map((label, i) => ({ poll_id: pollId, label, position: i })),
  );
  if (optError) throw optError;
  return pollId;
}

export async function votePoll(
  pollId: string,
  optionId: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('poll_votes').upsert(
    { poll_id: pollId, option_id: optionId, user_id: user.id },
    { onConflict: 'poll_id,user_id' },
  );
  if (error) throw error;
}

export async function closePoll(pollId: string): Promise<void> {
  const poll = await getPoll(pollId);
  if (!poll) throw new Error('Poll not found.');
  if (!(await isCommunityAdmin(poll.communityId))) {
    throw new Error('Only an admin can close a poll.');
  }
  const { error } = await supabase
    .from('community_polls')
    .update({ closed: true })
    .eq('id', pollId);
  if (error) throw error;
}

// ── My assigned tasks ──────────────────────────────────────────────────

export async function listMyTasks(
  communityId: string,
): Promise<{ tasks: TaskItem[]; unsupported: boolean }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { tasks: [], unsupported: false };
    const { data, error } = await supabase
      .from('community_tasks')
      .select(
        'id,title,detail,status,due_date,assignee_id,created_at,assignee:profiles!community_tasks_assignee_id_fkey(full_name)',
      )
      .eq('community_id', communityId)
      .eq('assignee_id', user.id)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true })
      .limit(30);
    if (error) throw error;
    return {
      tasks: ((data as unknown as TaskRow[]) ?? []).map((row) =>
        mapTask(row),
      ),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { tasks: [], unsupported: true };
    throw err;
  }
}

// ── Community prefs (pin / low priority / archive) ─────────────────────

export type CommunityPref = {
  pinned: boolean;
  low_priority: boolean;
  archived: boolean;
};

export const EMPTY_PREF: CommunityPref = {
  pinned: false,
  low_priority: false,
  archived: false,
};

export async function getCommunityPrefs(): Promise<
  Record<string, CommunityPref>
> {
  try {
    const { data, error } = await supabase
      .from('community_prefs')
      .select('community_id,pinned,low_priority,archived');
    if (error) throw error;
    const out: Record<string, CommunityPref> = {};
    for (const r of (data as unknown as {
      community_id: string;
      pinned: boolean;
      low_priority: boolean;
      archived: boolean;
    }[]) ?? []) {
      out[String(r.community_id)] = {
        pinned: !!r.pinned,
        low_priority: !!r.low_priority,
        archived: !!r.archived,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export async function setCommunityPref(
  communityId: string,
  patch: Partial<CommunityPref>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  if (patch.pinned) {
    const prefs = await getCommunityPrefs();
    const count = Object.entries(prefs).filter(
      ([cid, p]) => p.pinned && cid !== communityId,
    ).length;
    if (count >= 5) {
      throw new Error('You can pin at most 5 communities. Unpin one first.');
    }
  }
  const { error } = await supabase.from('community_prefs').upsert(
    {
      user_id: user.id,
      community_id: communityId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,community_id' },
  );
  if (error) throw error;
}

// ── Notifications feed ─────────────────────────────────────────────────

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  route: string;
  ref_id: string;
  community_id: string | null;
  read: boolean;
  created_at: string;
};

export async function listNotifications(): Promise<{
  items: AppNotification[];
  unsupported: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id,kind,title,body,route,ref_id,community_id,read,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    type Row = {
      id: string;
      kind: string;
      title: string;
      body: string;
      route: string;
      ref_id: string;
      community_id: string | null;
      read: boolean;
      created_at: string;
    };
    return {
      items: ((data as unknown as Row[]) ?? []).map((r) => ({
        id: String(r.id),
        kind: String(r.kind),
        title: String(r.title),
        body: String(r.body ?? ''),
        route: String(r.route ?? ''),
        ref_id: String(r.ref_id ?? ''),
        community_id: r.community_id ? String(r.community_id) : null,
        read: !!r.read,
        created_at: String(r.created_at),
      })),
      unsupported: false,
    };
  } catch (err) {
    if (isMissingTable(err)) return { items: [], unsupported: true };
    throw err;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
}

export async function countUnreadNotifications(): Promise<number> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

// ── Notification prefs ─────────────────────────────────────────────────

export type NotificationPrefs = {
  chat: boolean;
  announcements: boolean;
  forms: boolean;
  tasks: boolean;
  community: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  chat: true,
  announcements: true,
  forms: true,
  tasks: true,
  community: true,
};

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ...DEFAULT_NOTIFICATION_PREFS };
    const { data } = await supabase
      .from('notification_prefs')
      .select('chat,announcements,forms,tasks,community')
      .eq('user_id', user.id)
      .single();
    if (!data) return { ...DEFAULT_NOTIFICATION_PREFS };
    const row = data as unknown as NotificationPrefs;
    return {
      chat: !!row.chat,
      announcements: !!row.announcements,
      forms: !!row.forms,
      tasks: !!row.tasks,
      community: row.community !== false,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function saveNotificationPrefs(
  prefs: NotificationPrefs,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: user.id,
      ...prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

// ── Contact visibility (owner manages the contact list) ────────────────

export async function isCommunityOwner(communityId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('communities')
    .select('owner_id')
    .eq('id', communityId)
    .single();
  return (data as { owner_id?: string } | null)?.owner_id === user.id;
}

export async function setContactVisibility(
  communityId: string,
  userId: string,
  show: boolean,
): Promise<void> {
  if (!(await isCommunityOwner(communityId))) {
    throw new Error('Only the owner can manage the contact list.');
  }
  const { error } = await supabase
    .from('community_members')
    .update({ show_in_contact: show })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Flag or unflag a member as support staff on the contact page. */
export async function setSupportMember(
  communityId: string,
  userId: string,
  support: boolean,
): Promise<void> {
  if (!(await isCommunityOwner(communityId))) {
    throw new Error('Only the owner can manage the contact list.');
  }
  const { error } = await supabase
    .from('community_members')
    .update({ is_support: support })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Add or remove the SUPPORT tag from a member's profile. Unlike the
 * contact-list roster above, community admins may manage tags: the
 * membership update policy already allows admin writes.
 */
export async function setMemberSupportTag(
  communityId: string,
  userId: string,
  support: boolean,
): Promise<void> {
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only community admins can manage tags.');
  }
  const { error } = await supabase
    .from('community_members')
    .update({ is_support: support })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Set (or clear, with an empty label) a member's custom tag: a free word
 * the admin picks, like Usher or Choir. Admin-only, like support tags.
 */
export async function setMemberTag(
  communityId: string,
  userId: string,
  label: string,
): Promise<void> {
  if (!(await isCommunityAdmin(communityId))) {
    throw new Error('Only community admins can manage tags.');
  }
  const clean = label.trim().slice(0, 24);
  const { error } = await supabase
    .from('community_members')
    .update({ tag: clean ? clean : null })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        'Member tags need the latest database update. Ask your admin to apply it, then try again.',
      );
    }
    throw error;
  }
}

// ── Due payers (who paid a contribution) ────────────────────────────────

export type DuePayer = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  paid_at: string;
};

export async function listDuePayers(dueId: string): Promise<DuePayer[]> {
  const { data, error } = await supabase
    .from('due_payments')
    .select(
      'user_id,created_at,payer:profiles!due_payments_user_id_fkey(full_name,avatar_url)',
    )
    .eq('due_id', dueId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  type Row = {
    user_id: string;
    created_at: string;
    payer: { full_name: string | null; avatar_url: string | null } | null;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    userId: String(r.user_id),
    name: r.payer?.full_name ?? 'Staff Member',
    avatarUrl: r.payer?.avatar_url
      ? publicUrl('avatars', String(r.payer.avatar_url))
      : null,
    paid_at: String(r.created_at),
  }));
}
