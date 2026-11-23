// Push fan-out: resolves Expo push tokens and delivers via the Expo API.
// Called by DB triggers (see supabase/migrations/2026110802_push_triggers.sql).
// Also writes per-user rows to public.notifications and honors
// public.notification_prefs. Row writes never fail a push.
// Phone pushes go out only for chat, announcements, mentions, and calls;
// every other event still lands in the in-app notification list.
// Deploy: supabase functions deploy push-fanout
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatic), FANOUT_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Events loud enough for the phone. Forms, tasks, polls, reports, and
// membership changes stay in-app only (notification rows, no push).
const PUSH_EVENTS: ReadonlySet<string> = new Set([
  'message',
  'announcement',
  'mention',
  'call',
]);

type FanoutEvent =
  | {
      event: 'message';
      message_id: string;
      conversation_id: string;
      sender_id: string;
    }
  | { event: 'submission'; submission_id: string; op: string; status: string }
  | { event: 'announcement'; announcement_id: string }
  | { event: 'poll'; poll_id: string }
  | { event: 'comment_report'; report_id: string }
  | { event: 'mention'; mention_id: string }
  | { event: 'task'; task_id: string }
  | { event: 'call'; signal_id: string }
  | {
      event: 'membership';
      op: string;
      status?: string;
      old_status?: string;
      community_id: string;
      user_id: string;
    }
  | { event: 'member_added'; community_id: string; user_id: string };

type NoticeKind = 'chat' | 'announcements' | 'forms' | 'tasks' | 'community';

type Notice = {
  userIds: string[];
  kind: NoticeKind;
  title: string;
  body: string;
  data: { route: string; id?: string };
  refId: string;
  communityId: string | null;
};

type Ticket = {
  to: string;
  title: string;
  body: string;
  data: object;
  threadId?: string;
  collapseId?: string;
  tag?: string;
  channelId?: string;
  priority?: 'high';
  ttl?: number;
  badge?: number;
  categoryId?: string;
  _contentAvailable?: boolean;
};

// deno-lint-ignore no-explicit-any
type Db = any;

async function tokensFor(
  sb: Db,
  userIds: string[],
): Promise<{ token: string; userId: string }[]> {
  if (userIds.length === 0) return [];
  const { data } = await sb
    .from('push_tokens')
    .select('token,user_id')
    .in('user_id', [...new Set(userIds)]);
  return ((data as { token: string | null; user_id: string }[]) ?? [])
    .filter((r) => !!r.token && r.token.startsWith('ExponentPushToken'))
    .map((r) => ({ token: r.token as string, userId: String(r.user_id) }));
}

/**
 * Unread counts per recipient, read after the current rows land so the
 * numbers include this very push: per-thread (chat route), per-kind,
 * and the total behind the app badge.
 */
async function unreadCounts(
  sb: Db,
  userIds: string[],
  route: string,
  refId: string,
): Promise<
  Map<string, { thread: number; total: number; kinds: Record<string, number> }>
> {
  const out = new Map<
    string,
    { thread: number; total: number; kinds: Record<string, number> }
  >();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return out;
  for (const id of unique) {
    out.set(id, { thread: 0, total: 0, kinds: {} });
  }
  const { data } = await sb
    .from('notifications')
    .select('user_id,route,ref_id,kind')
    .in('user_id', unique)
    .eq('read', false)
    .limit(2000);
  for (
    const row of (
      data as
        | { user_id: string; route: string; ref_id: string; kind: string }[]
        | null
    ) ?? []
  ) {
    const slot = out.get(String(row.user_id));
    if (!slot) continue;
    slot.total += 1;
    slot.kinds[row.kind] = (slot.kinds[row.kind] ?? 0) + 1;
    if (row.route === route && row.ref_id === refId) slot.thread += 1;
  }
  return out;
}

async function communityMemberIds(
  sb: Db,
  communityId: string,
  roles?: string[],
): Promise<string[]> {
  let query = sb
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('status', 'active')
    .limit(2000);
  if (roles) query = query.in('role', roles);
  const { data } = await query;
  return ((data as { user_id: string }[]) ?? []).map((r) => r.user_id);
}

async function buildNotice(sb: Db, payload: FanoutEvent): Promise<Notice | null> {
  if (payload.event === 'message') {
    const [{ data: message }, { data: convo }, { data: parts }] =
      await Promise.all([
        sb
          .from('messages')
          .select('body,sender:profiles!messages_sender_id_fkey(full_name,avatar_url)')
          .eq('id', payload.message_id)
          .single(),
        sb
          .from('conversations')
          .select('title,is_group,community_id')
          .eq('id', payload.conversation_id)
          .single(),
        sb
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', payload.conversation_id)
          .neq('user_id', payload.sender_id)
          .eq('muted', false),
      ]);
    if (!message || !convo) return null;
    const sender =
      (message.sender?.full_name as string | undefined) ?? 'Someone';
    // Never ship message text through push or notification rows: plaintext
    // history would leak to lock screens and the notifications table.
    // Envelopes stay redacted too; both branches are generic by design.
    // The sealed envelope rides along (size-capped) so the device can
    // decrypt on receipt and upgrade to the real text itself.
    const raw = String(message.body ?? '');
    const body = raw.startsWith('{"v":1,')
      ? 'New encrypted message'
      : 'New message';
    const cipher =
      raw.startsWith('{"v":1,') && raw.length <= 2000 ? raw : null;
    const avatarPath =
      (message.sender as { avatar_url?: string } | undefined)?.avatar_url ??
      null;
    const avatar = avatarPath
      ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/avatars/${avatarPath}`
      : null;
    const title = convo.is_group
      ? `${sender} in ${String(convo.title || 'group')}`
      : sender;
    return {
      userIds: ((parts as { user_id: string }[]) ?? []).map((p) =>
        String(p.user_id),
      ),
      kind: 'chat',
      title,
      body,
      data: {
        route: 'chat',
        id: payload.conversation_id,
        message_id: payload.message_id,
        sender_id: payload.sender_id,
        sender,
        ...(cipher ? { cipher } : {}),
        ...(avatar ? { avatar } : {}),
      },
      refId: payload.conversation_id,
      communityId: convo.community_id ? String(convo.community_id) : null,
    };
  }

  if (payload.event === 'submission') {
    const { data: sub } = await sb
      .from('form_submissions')
      .select(
        'type,submitted_by,community_id,community:communities!form_submissions_community_id_fkey(name),submitter:profiles!form_submissions_submitted_by_fkey(full_name)',
      )
      .eq('id', payload.submission_id)
      .single();
    if (!sub) return null;
    const community = String(sub.community?.name ?? 'your community');
    if (payload.op === 'INSERT' || payload.status === 'pending') {
      const admins = await communityMemberIds(sb, String(sub.community_id), [
        'owner',
        'admin',
      ]);
      return {
        userIds: admins,
        kind: 'forms',
        title: `${community}: new request`,
        body: `${String(sub.submitter?.full_name ?? 'A member')} filed a ${String(sub.type).replace(/_/g, ' ')} request.`,
        data: { route: 'forms', id: payload.submission_id },
        refId: payload.submission_id,
        communityId: String(sub.community_id),
      };
    }
    const verdict =
      payload.status === 'approved' ? 'approved' : 'not approved';
    return {
      userIds: [String(sub.submitted_by)],
      kind: 'forms',
      title: `${community}: request ${verdict}`,
      body: `Your ${String(sub.type).replace(/_/g, ' ')} request was ${verdict}.`,
      data: { route: 'forms', id: payload.submission_id },
      refId: payload.submission_id,
      communityId: String(sub.community_id),
    };
  }

  if (payload.event === 'announcement') {
    const { data: row } = await sb
      .from('announcements')
      .select(
        'title,community_id,community:communities!announcements_community_id_fkey(name)',
      )
      .eq('id', payload.announcement_id)
      .single();
    if (!row) return null;
    const members = await communityMemberIds(sb, String(row.community_id));
    return {
      userIds: members,
      kind: 'announcements',
      title: String(row.community?.name ?? 'Announcement'),
      body: String(row.title ?? '').slice(0, 180),
      data: { route: 'update' },
      refId: payload.announcement_id,
      communityId: String(row.community_id),
    };
  }

  if (payload.event === 'call') {
    const { data: sig } = await sb
      .from('call_signals')
      .select('scope,ref_id,started_by,media')
      .eq('id', payload.signal_id)
      .single();
    if (!sig) return null;
    if (sig.scope === 'room') {
      const [{ data: meeting }, { data: members }, { data: starter }] =
        await Promise.all([
          sb
            .from('community_meetings')
            .select(
              'name,community_id,community:communities!community_meetings_community_id_fkey(name)',
            )
            .eq('id', String(sig.ref_id))
            .single(),
          sb
            .from('meeting_members')
            .select('user_id')
            .eq('meeting_id', String(sig.ref_id))
            .neq('user_id', String(sig.started_by)),
          sb
            .from('profiles')
            .select('full_name')
            .eq('id', String(sig.started_by))
            .single(),
        ]);
      if (!meeting) return null;
      const name = String(starter?.full_name ?? 'Someone');
      const room = String(meeting.name ?? 'Meeting room');
      let userIds = (((members as { user_id: string }[]) ?? []).map((m) =>
        String(m.user_id),
      ));
      if (userIds.length === 0 && meeting.community_id) {
        // General room: the whole community is in the room.
        const all = await communityMemberIds(sb, String(meeting.community_id));
        userIds = all.filter((u) => u !== String(sig.started_by));
      }
      return {
        userIds,
        kind: 'chat',
        title: `Meeting starting: ${room}`,
        body: `${name} opened the room. Tap to join.`,
        data: {
        route: 'meeting',
        id: String(sig.ref_id),
        kind: 'call',
        media: sig.media === 'video' ? 'video' : 'voice',
      },
        refId: String(sig.ref_id),
        communityId: meeting.community_id
          ? String(meeting.community_id)
          : null,
      };
    }
    const [{ data: convo }, { data: parts }, { data: starter }] =
      await Promise.all([
        sb
          .from('conversations')
          .select('title,is_group,community_id')
          .eq('id', String(sig.ref_id))
          .single(),
        sb
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', String(sig.ref_id))
          .neq('user_id', String(sig.started_by)),
        sb
          .from('profiles')
          .select('full_name')
          .eq('id', String(sig.started_by))
          .single(),
      ]);
    if (!convo) return null;
    const name = String(starter?.full_name ?? 'Someone');
    const media = sig.media === 'video' ? 'video' : 'voice';
    const group = Boolean(convo.is_group);
    return {
      userIds: ((parts as { user_id: string }[]) ?? []).map((p) =>
        String(p.user_id),
      ),
      kind: 'chat',
      title: group
        ? `${name} started a ${media} call in ${String(convo.title || 'group')}`
        : `Incoming ${media} call`,
      body: group ? 'Tap to join.' : `${name} is calling you. Tap to join.`,
      data: { route: 'chat', id: String(sig.ref_id), kind: 'call' },
      refId: String(sig.ref_id),
      communityId: convo.community_id ? String(convo.community_id) : null,
    };
  }

  if (payload.event === 'membership' || payload.event === 'member_added') {
    const communityId = String(payload.community_id);
    const memberId = String(payload.user_id);
    const [{ data: community }, { data: actor }] = await Promise.all([
      sb.from('communities').select('name').eq('id', communityId).single(),
      sb.from('profiles').select('full_name').eq('id', memberId).single(),
    ]);
    if (!community) return null;
    const cname = String(community.name ?? 'your community');
    const aname = String(actor?.full_name ?? 'Someone');
    if (payload.event === 'member_added') {
      return {
        userIds: [memberId],
        kind: 'community',
        title: `You were added to ${cname}`,
        body: 'An admin added you. Say hello!',
        data: { route: 'community', id: communityId },
        refId: communityId,
        communityId,
      };
    }
    if (payload.op === 'DELETE') {
      const admins = await communityMemberIds(sb, communityId, ['owner', 'admin']);
      return {
        userIds: admins,
        kind: 'community',
        title: `${cname}: member left`,
        body: `${aname} left ${cname}.`,
        data: { route: 'community', id: communityId },
        refId: communityId,
        communityId,
      };
    }
    if (payload.op === 'UPDATE') {
      if (payload.old_status === 'pending' && payload.status === 'active') {
        return {
          userIds: [memberId],
          kind: 'community',
          title: `Welcome to ${cname}`,
          body: 'Your request was approved.',
          data: { route: 'community', id: communityId },
          refId: communityId,
          communityId,
        };
      }
      return null;
    }
    const { data: mship } = await sb
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', memberId)
      .single();
    if ((mship as { role?: string } | null)?.role === 'owner') return null;
    const admins = await communityMemberIds(sb, communityId, ['owner', 'admin']);
    const requested = payload.status === 'pending';
    return {
      userIds: admins,
      kind: 'community',
      title: requested ? `${cname}: new join request` : `${cname}: new member`,
      body: requested ? `${aname} wants to join.` : `${aname} joined ${cname}.`,
      data: { route: 'community', id: communityId },
      refId: communityId,
      communityId,
    };
  }

  if (payload.event === 'poll') {
    const { data: poll } = await sb
      .from('community_polls')
      .select(
        'question,community_id,community:communities!community_polls_community_id_fkey(name)',
      )
      .eq('id', (payload as { poll_id: string }).poll_id)
      .single();
    if (!poll) return null;
    const members = await communityMemberIds(sb, String(poll.community_id));
    return {
      userIds: members,
      kind: 'community',
      title: `New poll in ${String(poll.community?.name ?? 'your community')}`,
      body: String(poll.question ?? '').slice(0, 180),
      data: { route: 'poll', id: (payload as { poll_id: string }).poll_id },
      refId: (payload as { poll_id: string }).poll_id,
      communityId: String(poll.community_id),
    };
  }

  if (payload.event === 'comment_report') {
    const { data: report } = await sb
      .from('comment_reports')
      .select(
        'reason,post_id,community_id,comment:post_comments!comment_reports_comment_id_fkey(body),community:communities!comment_reports_community_id_fkey(name)',
      )
      .eq('id', (payload as { report_id: string }).report_id)
      .single();
    if (!report) return null;
    const admins = await communityMemberIds(
      sb,
      String(report.community_id),
      ['owner', 'admin'],
    );
    const snippet = String(report.comment?.body ?? '').slice(0, 140);
    const reason = String(report.reason ?? '').trim();
    return {
      userIds: admins,
      kind: 'community',
      title: `Comment reported in ${String(report.community?.name ?? 'your community')}`,
      body: reason ? `${reason}: ${snippet}` : snippet || 'A comment was reported.',
      data: { route: 'post', id: String(report.post_id) },
      refId: String(report.post_id),
      communityId: String(report.community_id),
    };
  }

  if (payload.event === 'mention') {
    const { data: mention } = await sb
      .from('mentions')
      .select(
        'mentioned_user_id,conversation_id,post_id,comment_id,announcement_id,actor:profiles!mentions_mentioned_by_fkey(full_name),comment:post_comments!mentions_comment_id_fkey(body),post:posts!mentions_post_id_fkey(text),announcement:announcements!mentions_announcement_id_fkey(title),convo:conversations!mentions_conversation_id_fkey(title)',
      )
      .eq('id', (payload as { mention_id: string }).mention_id)
      .single();
    if (!mention) return null;
    const actor = String(mention.actor?.full_name ?? 'Someone');
    if (mention.conversation_id) {
      const group = String(mention.convo?.title || 'group');
      return {
        userIds: [String(mention.mentioned_user_id)],
        kind: 'chat',
        title: `${actor} mentioned you`,
        body: `You were mentioned in ${group}.`,
        data: { route: 'chat', id: String(mention.conversation_id) },
        refId: String(mention.conversation_id),
        communityId: null,
      };
    }
    if (mention.announcement_id) {
      const title = String(mention.announcement?.title ?? '').slice(0, 140);
      return {
        userIds: [String(mention.mentioned_user_id)],
        kind: 'community',
        title: `${actor} mentioned you`,
        body: title
          ? `You were mentioned in "${title}".`
          : 'You were mentioned in an announcement.',
        data: { route: 'update' },
        refId: String(mention.announcement_id),
        communityId: null,
      };
    }
    const snippet = String(
      mention.comment?.body ?? mention.post?.text ?? '',
    ).slice(0, 140);
    return {
      userIds: [String(mention.mentioned_user_id)],
      kind: 'community',
      title: `${actor} mentioned you`,
      body: snippet || 'You were mentioned in a post.',
      data: { route: 'post', id: String(mention.post_id) },
      refId: String(mention.post_id),
      communityId: null,
    };
  }

  const { data: task } = await sb
    .from('community_tasks')
    .select('title,community_id,assignee_id')
    .eq('id', (payload as { task_id: string }).task_id)
    .single();
  if (!task || !task.assignee_id) return null;
  return {
    userIds: [String(task.assignee_id)],
    kind: 'tasks',
    title: 'New task assigned',
    body: String(task.title ?? '').slice(0, 180),
    data: { route: 'community', id: String(task.community_id) },
    refId: (payload as { task_id: string }).task_id,
    communityId: String(task.community_id),
  };
}

async function finalize(
  sb: Db,
  notice: Notice,
  event: string,
): Promise<Ticket[]> {
  const unique = [...new Set(notice.userIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const { data: prefs } = await sb
    .from('notification_prefs')
    .select(`user_id,${notice.kind}`)
    .in('user_id', unique);
  const off = new Set(
    ((prefs as { user_id: string; [k: string]: unknown }[]) ?? [])
      .filter((p) => p[notice.kind] === false)
      .map((p) => String(p.user_id)),
  );
  const allowed = unique.filter((id) => !off.has(id));
  if (allowed.length === 0) return [];
  try {
    await sb.from('notifications').insert(
      allowed.map((user_id) => ({
        user_id,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        route: notice.data.route,
        ref_id: notice.refId,
        community_id: notice.communityId,
      })),
    );
  } catch (err) {
    console.error('notification rows failed', err);
  }
  // WhatsApp-style delivery: one stack per conversation (threadId on
  // iOS; collapseId+tag keep only the latest on Android), the MAX chat
  // channel for chats/calls, high priority so closed phones still pop,
  // and a short TTL so stale call pushes never surface late.
  if (!PUSH_EVENTS.has(event)) return [];
  const thread = notice.data.id
    ? `${notice.data.route}-${notice.data.id}`
    : notice.communityId
      ? `${notice.data.route}-${notice.communityId}`
      : notice.data.route;
  const replaceable =
    event === 'message' || event === 'mention' || event === 'call';
  const tokens = await tokensFor(sb, allowed);
  // Per-type numbers: the thread count suffixes stacked message pushes,
  // the total drives the app badge, and the full breakdown rides in
  // data for the on-device enricher.
  const counts = await unreadCounts(
    sb,
    tokens.map((t) => t.userId),
    notice.data.route,
    notice.refId,
  );
  const showThreadCount =
    event === 'message' && notice.data.route === 'chat';
  return tokens.map(({ token, userId }) => {
    const slot = counts.get(userId) ?? { thread: 0, total: 0, kinds: {} };
    return {
      to: token,
      title:
        showThreadCount && slot.thread > 1
          ? `${notice.title} (${slot.thread})`
          : notice.title,
      body: notice.body,
      data: {
        ...notice.data,
        unreadCount: slot.thread,
        totalUnread: slot.total,
        counts: slot.kinds,
      },
      channelId: notice.kind === 'chat' ? 'chat' : 'default',
      priority: 'high' as const,
      badge: slot.total,
      threadId: thread,
      ...(replaceable ? { collapseId: thread, tag: thread } : {}),
      ...(event === 'call' ? { ttl: 60 } : {}),
      ...(event === 'message' ||
      (event === 'mention' && notice.data.route === 'chat')
        ? { categoryId: 'chat-reply' }
        : {}),
      ...(event === 'message' ? { _contentAvailable: true } : {}),
    };
  });
}

async function sendAll(tickets: Ticket[]): Promise<void> {
  for (let i = 0; i < tickets.length; i += 100) {
    const chunk = tickets.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          chunk.map((t) => ({ ...t, sound: 'default' })),
        ),
      });
      if (!res.ok) console.error('expo push failed', res.status);
    } catch (err) {
      console.error('expo push error', err);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  const secret = Deno.env.get('FANOUT_SECRET') ?? '';
  if (!secret || req.headers.get('x-fanout-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  let payload: FanoutEvent;
  try {
    payload = (await req.json()) as FanoutEvent;
  } catch {
    return new Response('bad json', { status: 400 });
  }
  try {
    const notice = await buildNotice(sb, payload);
    if (!notice) return Response.json({ sent: 0 });
    const tickets = await finalize(sb, notice, payload.event);
    await sendAll(tickets);
    return Response.json({ sent: tickets.length });
  } catch (err) {
    console.error(err);
    return new Response('fanout failed', { status: 500 });
  }
});
