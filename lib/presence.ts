import { AppState } from 'react-native';
import { supabase } from './supabase';

/**
 * Online presence + last seen. The app heartbeats profiles.last_seen
 * while foregrounded (and once when backgrounding, so it reads as the
 * true last moment). Seen within two minutes counts as online.
 */

export const ONLINE_WINDOW_MS = 120_000;
const BEAT_MS = 60_000;

/** One heartbeat: stamp my own row. Never throws. */
export async function beatPresence(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', user.id);
  } catch {
    // Offline or signed out: the last beat still stands.
  }
}

let started = false;
let beatTimer: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;

/**
 * Foreground heartbeat for the whole session. Call once from the root
 * layout; safe to call twice. No-op after sign-out (beat finds no user).
 */
export function startHeartbeat(): void {
  if (started) return;
  started = true;
  void beatPresence();
  beatTimer = setInterval(() => {
    if (AppState.currentState === 'active') void beatPresence();
  }, BEAT_MS);
  appSub = AppState.addEventListener('change', (state) => {
    // Foreground beats immediately; the background beat stamps the true
    // last seen moment on the way out.
    if (state === 'active' || state === 'background') void beatPresence();
  });
}

export function stopHeartbeat(): void {
  started = false;
  if (beatTimer) {
    clearInterval(beatTimer);
    beatTimer = null;
  }
  appSub?.remove();
  appSub = null;
}

/**
 * One member's last heartbeat. Separate best-effort query (never folded
 * into profile selects) so backends without the column keep working.
 */
export async function getPeerLastSeen(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('last_seen')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    const raw = (data as { last_seen?: string | null }).last_seen;
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    return null;
  }
}

/** Live last-seen for one member. Unique topic per subscriber. */
export function subscribeToLastSeen(
  userId: string,
  onSeen: (seenAt: string | null) => void,
): () => void {
  const channel = supabase
    .channel(
      `last-seen:${userId}:${Math.random().toString(36).slice(2, 10)}`,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as { last_seen?: string | null };
        onSeen(
          typeof row?.last_seen === 'string' && row.last_seen
            ? row.last_seen
            : null,
        );
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

function atTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Header-ready presence line: online flag plus human text. */
export function statusText(lastSeen: string | null): {
  text: string;
  online: boolean;
} {
  if (lastSeen) {
    const at = new Date(lastSeen).getTime();
    if (!Number.isNaN(at)) {
      if (Date.now() - at < ONLINE_WINDOW_MS) {
        return { text: 'online', online: true };
      }
      const then = new Date(at);
      const now = new Date();
      const day = (d: Date) =>
        `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (day(then) === day(now)) {
        return { text: `last seen today at ${atTime(then)}`, online: false };
      }
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (day(then) === day(yesterday)) {
        return {
          text: `last seen yesterday at ${atTime(then)}`,
          online: false,
        };
      }
      return {
        text: `last seen ${then.getDate()} ${MONTHS[then.getMonth()]} at ${atTime(then)}`,
        online: false,
      };
    }
  }
  return { text: 'last seen a long time ago', online: false };
}
