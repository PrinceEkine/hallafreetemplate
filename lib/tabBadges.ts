import AsyncStorage from '@react-native-async-storage/async-storage';
import { listConversations } from './chat';
import { listMyCommunities } from './communities';
import { getSelectedCommunityId } from './selectedCommunity';
import { supabase } from './supabase';

export type TabBadgeCounts = {
  chat: number;
  teams: number;
  feed: number;
  update: number;
  events: number;
};

export type BadgeTab = keyof TabBadgeCounts;

const SEEN_PREFIX = '@ophixe:tab_seen:';

async function lastSeen(tab: BadgeTab): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_PREFIX + tab);
    const at = raw ? Number(raw) : NaN;
    // First run counts nothing: badges only accrue from here.
    if (!Number.isFinite(at)) {
      const now = Date.now();
      await AsyncStorage.setItem(SEEN_PREFIX + tab, String(now)).catch(
        () => {},
      );
      return now;
    }
    return at;
  } catch {
    return Date.now();
  }
}

/** Tapping a tab marks everything there read: its badge clears. */
export async function markTabSeen(tab: BadgeTab): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_PREFIX + tab, String(Date.now()));
  } catch {
    // A missed write just shows the badge again.
  }
}

async function countSince(
  table: 'posts' | 'announcements' | 'events',
  communityIds: string[],
  sinceMs: number,
): Promise<number> {
  if (communityIds.length === 0) return 0;
  try {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in('community_id', communityIds)
      .gt('created_at', new Date(sinceMs).toISOString());
    if (error || typeof count !== 'number') return 0;
    return count;
  } catch {
    return 0;
  }
}

/**
 * Unread numbers behind each tab icon: live read states for chats and
 * teams, new-since-visit counts for home, announcements, and events.
 * Scoped to the selected community, or every community when none is.
 */
export async function getTabBadgeCounts(): Promise<TabBadgeCounts> {
  const empty: TabBadgeCounts = {
    chat: 0,
    teams: 0,
    feed: 0,
    update: 0,
    events: 0,
  };
  try {
    const [
      convos,
      mine,
      selected,
      seenChat,
      seenTeams,
      seenFeed,
      seenUpdate,
      seenEvents,
    ] = await Promise.all([
      listConversations().catch((): never[] => []),
      listMyCommunities().catch((): never[] => []),
      Promise.resolve(getSelectedCommunityId()),
      lastSeen('chat'),
      lastSeen('teams'),
      lastSeen('feed'),
      lastSeen('update'),
      lastSeen('events'),
    ]);
    const conversations = convos as {
      is_group: boolean;
      unread: boolean;
      at: string | null;
    }[];
    const communities = mine as { id: string }[];
    const scope = selected
      ? [selected]
      : communities.map((c) => String(c.id));
    const [feed, update, events] = await Promise.all([
      countSince('posts', scope, seenFeed),
      countSince('announcements', scope, seenUpdate),
      countSince('events', scope, seenEvents),
    ]);
    // Chats count unread threads newer than the last tab visit, so a
    // tap clears the number until a genuinely new message lands.
    const fresh = (at: string | null, seen: number) =>
      !!at && new Date(at).getTime() > seen;
    return {
      chat: conversations.filter(
        (c) => !c.is_group && c.unread && fresh(c.at, seenChat),
      ).length,
      teams: conversations.filter(
        (c) => c.is_group && c.unread && fresh(c.at, seenTeams),
      ).length,
      feed,
      update,
      events,
    };
  } catch {
    return empty;
  }
}
