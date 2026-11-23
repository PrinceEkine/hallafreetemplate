// Supabase Edge Function: agora-token
// Mints a short-lived Agora RTC token for a conversation or meeting-room
// call. Channels are `ophixe_<32-hex>` (chat) or `ophixe_room_<uuid>`
// (meeting room); the caller must belong to the conversation/community.
// Needs AGORA_APP_ID + AGORA_APP_CERTIFICATE (Functions > Secrets).
// Deploy: supabase functions deploy agora-token
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RtcRole, RtcTokenBuilder } from 'https://esm.sh/agora-token@2';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2147483647 + 1;
}

function uuidToHex(id: string): string | null {
  const hex = id.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(hex) ? hex.toLowerCase() : null;
}

serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing auth.' }, 401);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sign in first.' }, 401);
    const { channel } = (await req.json()) as { channel?: unknown };
    if (
      typeof channel !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(channel)
    ) {
      return json({ error: 'Invalid channel.' }, 400);
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    if (channel.startsWith('ophixe_room_')) {
      const roomId = channel.slice('ophixe_room_'.length);
      if (!uuidToHex(roomId)) return json({ error: 'Invalid channel.' }, 400);
      const { data: room } = await admin
        .from('community_meetings')
        .select('community_id')
        .eq('id', roomId)
        .single();
      if (!room?.community_id) return json({ error: 'Room not found.' }, 404);
      const { data: member } = await admin
        .from('community_members')
        .select('user_id')
        .eq('community_id', room.community_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();
      if (!member) return json({ error: 'Join the community first.' }, 403);
      // Specified room: only invited members (and community admins) join.
      const { data: invited } = await admin
        .from('meeting_members')
        .select('user_id')
        .eq('meeting_id', roomId)
        .limit(2000);
      const invitedIds = ((invited as { user_id: string }[]) ?? []).map((r) =>
        String(r.user_id),
      );
      if (invitedIds.length > 0 && !invitedIds.includes(user.id)) {
        const { data: mship } = await admin
          .from('community_members')
          .select('role')
          .eq('community_id', room.community_id)
          .eq('user_id', user.id)
          .single();
        const role = String((mship as { role?: string } | null)?.role ?? '');
        if (role !== 'owner' && role !== 'admin') {
          return json({ error: 'This room is private.' }, 403);
        }
      }
    } else if (channel.startsWith('ophixe_')) {
      const hex = channel.slice('ophixe_'.length);
      if (!/^[0-9a-f]{32}$/i.test(hex)) {
        return json({ error: 'Invalid channel.' }, 400);
      }
      const convoId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const { data: part } = await admin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', convoId)
        .eq('user_id', user.id)
        .single();
      if (!part) return json({ error: 'You are not in this chat.' }, 403);
    } else {
      return json({ error: 'Invalid channel.' }, 400);
    }
    const appId = Deno.env.get('AGORA_APP_ID');
    const certificate = Deno.env.get('AGORA_APP_CERTIFICATE');
    if (!appId || !certificate) {
      return json({ error: 'Calling is not configured.' }, 500);
    }
    const uid = fnv1a(user.id);
    const expiresIn = 7200;
    const expireTs = Math.floor(Date.now() / 1000) + expiresIn;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      expireTs,
    );
    return json({ token, uid, appId, channel, expiresIn });
  } catch (e) {
    console.error('agora-token failed', e);
    return json({ error: 'Could not start the call.' }, 500);
  }
});
