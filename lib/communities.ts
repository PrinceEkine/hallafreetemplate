import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_MODULE_SETTINGS,
  normalizeModuleSettings,
  type ModuleSettings,
} from './communityModules';
import { getCommunityPrefs } from './communityContent';
import { isNetworkError, readCache, writeCache } from './net';
import { setCachedCommunities } from './session';
import { supabase } from './supabase';
import { publicUrl } from './uploads';

export type MyCommunity = {
  id: string;
  name: string;
  logoUrl: string | null;
};

let communityCache: { at: number; userId: string; list: MyCommunity[] } | null =
  null;
const COMMUNITY_CACHE_TTL_MS = 20000;

export function bustCommunityCache(): void {
  communityCache = null;
}

export async function listMyCommunities(): Promise<MyCommunity[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  if (
    communityCache &&
    communityCache.userId === user.id &&
    Date.now() - communityCache.at < COMMUNITY_CACHE_TTL_MS
  ) {
    return communityCache.list;
  }
  try {
    const { data } = await supabase
      .from('community_members')
      .select('communities(id,name,logo_url)')
      .eq('user_id', user.id)
      .eq('status', 'active');
    type Row = {
      communities: { id: string; name: string; logo_url: string | null } | null;
    };
    const list = ((data as unknown as Row[]) ?? [])
      .filter((row) => row.communities !== null)
      .map((row) => ({
        id: String(row.communities!.id),
        name: String(row.communities!.name),
        logoUrl: row.communities!.logo_url
          ? publicUrl('avatars', String(row.communities!.logo_url))
          : null,
      }));
    void setCachedCommunities(list);
    writeCache('my-communities', list).catch(() => {});
    communityCache = { at: Date.now(), userId: user.id, list };
    return list;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    // Offline: every screen scopes through here, so serve the saved list.
    const saved = await readCache<MyCommunity[]>('my-communities');
    const list = saved?.data ?? [];
    void setCachedCommunities(list);
    communityCache = { at: Date.now(), userId: user.id, list };
    return list;
  }
}

export type OrderedCommunity = MyCommunity & {
  pinned: boolean;
  lowPriority: boolean;
  archived: boolean;
};

/** My communities ordered: pinned first, low-priority last, archived out. */
export async function getOrderedCommunities(): Promise<{
  visible: OrderedCommunity[];
  archived: OrderedCommunity[];
}> {
  const [list, prefs] = await Promise.all([
    listMyCommunities(),
    getCommunityPrefs(),
  ]);
  const merged: OrderedCommunity[] = list.map((c) => ({
    ...c,
    pinned: prefs[c.id]?.pinned ?? false,
    lowPriority: prefs[c.id]?.low_priority ?? false,
    archived: prefs[c.id]?.archived ?? false,
  }));
  const rank = (c: OrderedCommunity) =>
    c.pinned ? 0 : c.lowPriority ? 2 : 1;
  merged.sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
  return {
    visible: merged.filter((c) => !c.archived),
    archived: merged.filter((c) => c.archived),
  };
}

const storageKey = (communityId: string) =>
  `@ophixe:community_modules:${communityId}`;
const legacyStorageKey = (communityId: string) =>
  `@halla:community_modules:${communityId}`;

export async function getLocalModuleSettings(
  communityId: string,
): Promise<ModuleSettings | null> {
  try {
    const raw =
      (await AsyncStorage.getItem(storageKey(communityId))) ??
      (await AsyncStorage.getItem(legacyStorageKey(communityId)));
    if (!raw) return null;
    return normalizeModuleSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveLocalModuleSettings(
  communityId: string,
  settings: ModuleSettings,
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(communityId), JSON.stringify(settings));
  } catch {
    // Storage is best-effort; remote save still applies.
  }
}

function mentionsSettingsColumn(message: string): boolean {
  return /settings|column|schema|PGRST204/i.test(message);
}

/** Enabled sidebar sections for a community. Falls back to local, then all-on. */
export async function getCommunityModules(
  communityId: string,
): Promise<ModuleSettings> {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('settings')
      .eq('id', communityId)
      .single();
    if (!error && data) {
      const settings = (data as { settings?: unknown }).settings;
      if (settings && typeof settings === 'object') {
        const record = settings as { modules?: unknown };
        const modules =
          record.modules && typeof record.modules === 'object'
            ? record.modules
            : settings;
        const normalized = normalizeModuleSettings(modules);
        await saveLocalModuleSettings(communityId, normalized);
        return normalized;
      }
    }
  } catch {
    // Fall through to local storage.
  }
  const local = await getLocalModuleSettings(communityId);
  if (local) return local;
  return { ...DEFAULT_MODULE_SETTINGS };
}

export async function saveCommunityModules(
  communityId: string,
  settings: ModuleSettings,
): Promise<void> {
  await saveLocalModuleSettings(communityId, settings);
  try {
    const { data } = await supabase
      .from('communities')
      .select('settings')
      .eq('id', communityId)
      .single();
    const prev = (data as { settings?: unknown } | null)?.settings;
    const merged =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? { ...(prev as Record<string, unknown>), modules: settings }
        : { modules: settings };
    const { error } = await supabase
      .from('communities')
      .update({ settings: merged })
      .eq('id', communityId);
    if (error) throw error;
  } catch {
    // The settings column may not exist yet; local save already applied.
  }
}

export async function createCommunity(input: {
  name: string;
  description: string;
  privacy: string;
  who_can_join: string;
  website: string;
  modules: ModuleSettings;
}): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const base = {
    name: input.name,
    description: input.description,
    privacy: input.privacy,
    who_can_join: input.who_can_join,
    website: input.website,
    owner_id: user.id,
  };
  try {
    const { data, error } = await supabase
      .from('communities')
      .insert({ ...base, settings: { modules: input.modules } })
      .select('id')
      .single();
    if (!error && data) {
      const id = String((data as { id: string }).id);
      await saveLocalModuleSettings(id, input.modules);
      bustCommunityCache();
      return id;
    }
    if (error) {
      const message = String(
        (error as { message?: string }).message ?? error,
      );
      if (!mentionsSettingsColumn(message)) throw error;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!mentionsSettingsColumn(message)) throw err;
  }
  const { data, error } = await supabase
    .from('communities')
    .insert(base)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create community.');
  const id = String((data as { id: string }).id);
  await saveLocalModuleSettings(id, input.modules);
  bustCommunityCache();
  try {
    await supabase
      .from('communities')
      .update({ settings: { modules: input.modules } })
      .eq('id', id);
  } catch {
    // Column may not exist; local save already applied.
  }
  return id;
}
