import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type CachedUser = { id: string; email: string; name: string };
export type CachedCommunity = { id: string; name: string };

const PROFILE_KEY = '@ophixe:cached_profile';
const COMMUNITIES_KEY = '@ophixe:cached_communities';
const PHONE_KEY = '@ophixe:cached_phone';
const LEGACY_KEYS: Record<string, string> = {
  [PROFILE_KEY]: '@halla:cached_profile',
  [COMMUNITIES_KEY]: '@halla:cached_communities',
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw =
      (await AsyncStorage.getItem(key)) ??
      (await AsyncStorage.getItem(LEGACY_KEYS[key] ?? ''));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Stored session, resolved from the device cache. Null when logged out. */
export async function getBootstrapSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export type AuthChange = {
  event: string;
  signedIn: boolean;
};

export function onAuthChange(cb: (change: AuthChange) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb({ event, signedIn: !!session });
  });
  return () => data.subscription.unsubscribe();
}

/** Safe default for post-sign-in routing: real sign-ins only, never INITIAL_SESSION. */
export function onSignIn(cb: () => void): () => void {
  return onAuthChange((change) => {
    if (change.event === 'SIGNED_IN' && change.signedIn) cb();
  });
}

let bootstrapDone = false;

export function setBootstrapDone(done: boolean): void {
  bootstrapDone = done;
}

export function isBootstrapDone(): boolean {
  return bootstrapDone;
}

export type PendingRoute = {
  pathname: string;
  params?: Record<string, string>;
};

let pendingRoute: PendingRoute | null = null;

export function setPendingRoute(route: PendingRoute): void {
  pendingRoute = route;
}

export function takePendingRoute(): PendingRoute | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}

export async function getCachedProfile(): Promise<CachedUser | null> {
  return readJson<CachedUser>(PROFILE_KEY);
}

export async function setCachedProfile(user: CachedUser): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(user));
  } catch {
    // Cache is best-effort.
  }
}

export async function getCachedCommunities(): Promise<CachedCommunity[]> {
  return (await readJson<CachedCommunity[]>(COMMUNITIES_KEY)) ?? [];
}

export async function setCachedCommunities(
  list: CachedCommunity[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(COMMUNITIES_KEY, JSON.stringify(list));
  } catch {
    // Cache is best-effort.
  }
}

export async function clearAppCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([PROFILE_KEY, COMMUNITIES_KEY, PHONE_KEY]);
  } catch {
    // Cache is best-effort.
  }
}

/** Last known phone, so startup never blocks on the network to route. */
export async function getCachedPhone(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PHONE_KEY);
  } catch {
    return null;
  }
}

export async function setCachedPhone(phone: string | null): Promise<void> {
  try {
    if (phone) {
      await AsyncStorage.setItem(PHONE_KEY, phone);
    } else {
      await AsyncStorage.removeItem(PHONE_KEY);
    }
  } catch {
    // Cache is best-effort.
  }
}

export async function signOutAndClear(): Promise<void> {
  await clearAppCache();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
