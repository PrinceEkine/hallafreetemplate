import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { getOrderedCommunities } from './communities';

const KEY = 'ophixe:selectedCommunityId';
const LEGACY_KEY = 'halla:selectedCommunityId';

let current: string | null | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeSelectedCommunity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSelectedCommunityId(): string | null {
  return current ?? null;
}

export function setSelectedCommunityId(id: string | null): void {
  current = id;
  emit();
  AsyncStorage.setItem(KEY, id ?? '').catch(() => {});
}

async function loadStored(): Promise<string | null> {
  if (current !== undefined) return current;
  try {
    const raw =
      (await AsyncStorage.getItem(KEY)) ??
      (await AsyncStorage.getItem(LEGACY_KEY));
    current = raw ? raw : null;
    if (current) AsyncStorage.setItem(KEY, current).catch(() => {});
  } catch {
    current = null;
  }
  return current;
}

/**
 * Resolve the community the UI should scope to: the stored selection when
 * the user still belongs to it and has not archived it, otherwise their
 * first visible community (stored for next time), otherwise null (member
 * of nothing yet).
 */
export async function resolveSelectedCommunityId(): Promise<string | null> {
  const [stored, ordered] = await Promise.all([
    loadStored(),
    getOrderedCommunities().catch(() => ({ visible: [], archived: [] })),
  ]);
  const mine = ordered.visible;
  if (stored && mine.some((c) => c.id === stored)) return stored;
  const fallback = mine[0]?.id ?? null;
  if (current !== fallback) {
    current = fallback;
    emit();
    AsyncStorage.setItem(KEY, fallback ?? '').catch(() => {});
  }
  return fallback;
}

export function useSelectedCommunityId(): string | null {
  return useSyncExternalStore(
    subscribeSelectedCommunity,
    getSelectedCommunityId,
    getSelectedCommunityId,
  );
}
