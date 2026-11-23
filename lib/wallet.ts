import { supabase } from './supabase';
import { publicUrl } from './uploads';

export function formatNaira(kobo: number): string {
  return `₦${Math.floor(kobo / 100).toLocaleString()}`;
}

export type Due = {
  id: string;
  title: string;
  amount_kobo: number;
  communityName: string;
  paid: boolean;
};

export async function myDues(communityId?: string | null): Promise<Due[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  let ids: string[];
  if (communityId) {
    ids = [communityId];
  } else {
    const { data: mine } = await supabase
      .from('community_members')
      .select('community_id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    ids = ((mine as unknown as { community_id: string }[]) ?? []).map(
      (m) => m.community_id,
    );
  }
  if (ids.length === 0) return [];
  const { data: dues } = await supabase
    .from('community_dues')
    .select(
      'id,title,amount_kobo,community:communities!community_dues_community_id_fkey(name)',
    )
    .in('community_id', ids)
    .order('created_at', { ascending: false });
  const { data: paid } = await supabase
    .from('due_payments')
    .select('due_id')
    .eq('user_id', user.id);
  const paidSet = new Set(
    ((paid as unknown as { due_id: string }[]) ?? []).map((p) => p.due_id),
  );
  type Row = {
    id: string;
    title: string;
    amount_kobo: number;
    community: { name: string } | null;
  };
  return ((dues as unknown as Row[]) ?? []).map((d) => ({
    id: String(d.id),
    title: String(d.title),
    amount_kobo: Number(d.amount_kobo),
    communityName: d.community?.name ?? 'Community',
    paid: paidSet.has(d.id),
  }));
}

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

export async function createDue(
  communityId: string,
  title: string,
  amountKobo: number,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase.from('community_dues').insert({
    community_id: communityId,
    title: title.trim(),
    amount_kobo: amountKobo,
    created_by: user.id,
  });
  if (error) throw error;
}

/** Member paid by bank transfer and asks an admin to confirm the due. */
export async function claimDuePaid(dueId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_due_paid', { p_due_id: dueId });
  if (error) throw error;
}

/** Due ids the signed-in member already claimed and still awaits review. */
export async function myPendingClaimDueIds(
  communityId: string,
): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('transfer_claims')
    .select('due_id')
    .eq('community_id', communityId)
    .eq('user_id', user.id)
    .eq('status', 'pending');
  return ((data as unknown as { due_id: string }[]) ?? []).map((r) =>
    String(r.due_id),
  );
}

export type TransferClaim = {
  id: string;
  dueId: string;
  dueTitle: string;
  amount_kobo: number;
  memberName: string;
  created_at: string;
};

export async function listPendingClaims(
  communityId: string,
): Promise<TransferClaim[]> {
  const { data, error } = await supabase
    .from('transfer_claims')
    .select(
      'id,due_id,created_at,due:community_dues!transfer_claims_due_id_fkey(title,amount_kobo),member:profiles!transfer_claims_user_id_fkey(full_name)',
    )
    .eq('community_id', communityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  type Row = {
    id: string;
    due_id: string;
    created_at: string;
    due: { title: string; amount_kobo: number } | null;
    member: { full_name: string | null } | null;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: String(r.id),
    dueId: String(r.due_id),
    dueTitle: r.due?.title ?? 'Due',
    amount_kobo: Number(r.due?.amount_kobo ?? 0),
    memberName: r.member?.full_name ?? 'Staff Member',
    created_at: String(r.created_at),
  }));
}

export async function reviewTransferClaim(
  id: string,
  status: 'confirmed' | 'rejected',
): Promise<void> {
  const { error } = await supabase.rpc('review_transfer_claim', {
    p_id: id,
    p_status: status,
  });
  if (error) throw error;
}
