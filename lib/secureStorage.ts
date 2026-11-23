import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth storage backed by the OS keychain (SecureStore) instead of
 * plaintext AsyncStorage, so the refresh token is encrypted at rest.
 *
 * SecureStore values are small (~2KB on some Android builds) while a
 * session blob is larger, so values are chunked across <safe>.0..n with
 * the chunk count in <safe>.count (Supabase's documented LargeSecureStore
 * pattern, with "." separators because ":" is not a legal key character).
 *
 * One-time migration: sessions saved by older builds live in AsyncStorage
 * under the same key. The first read after upgrade moves the value over
 * and deletes the plaintext copy, so nobody is signed out by the switch.
 */

const CHUNK = 2000;

/**
 * SecureStore keys allow only alphanumerics plus "." and "_", but the
 * Supabase session key contains hyphens (sb-<ref>-auth-token). Every key
 * is encoded before use; underscores are escaped first so the encoding
 * can't collide with a literal key.
 */
function safeKey(key: string): string {
  const encoded = key
    .replace(/_/g, '_u_')
    .replace(
      /[^A-Za-z0-9._]/g,
      (ch) => `_x${ch.charCodeAt(0).toString(16)}_`,
    );
  return encoded || 'empty';
}

async function readChunks(key: string): Promise<string | null> {
  const safe = safeKey(key);
  const countRaw = await SecureStore.getItemAsync(`${safe}.count`);
  if (!countRaw) return null;
  const count = Number.parseInt(countRaw, 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    out += (await SecureStore.getItemAsync(`${safe}.${i}`)) ?? '';
  }
  return out;
}

async function writeChunks(key: string, value: string): Promise<void> {
  const safe = safeKey(key);
  const countRaw = await SecureStore.getItemAsync(`${safe}.count`);
  const oldCount = Number.parseInt(countRaw ?? '0', 10);
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK) {
    chunks.push(value.slice(i, i + CHUNK));
  }
  await SecureStore.setItemAsync(`${safe}.count`, String(chunks.length));
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${safe}.${i}`, chunks[i]);
  }
  // Shrink leftovers from a previously longer value.
  if (Number.isFinite(oldCount)) {
    for (let i = chunks.length; i < oldCount; i++) {
      await SecureStore.deleteItemAsync(`${safe}.${i}`).catch(() => {});
    }
  }
}

async function deleteChunks(key: string): Promise<void> {
  const safe = safeKey(key);
  const countRaw = await SecureStore.getItemAsync(`${safe}.count`).catch(
    () => null,
  );
  const count = Number.parseInt(countRaw ?? '0', 10);
  await SecureStore.deleteItemAsync(`${safe}.count`).catch(() => {});
  if (Number.isFinite(count)) {
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${safe}.${i}`).catch(() => {});
    }
  }
}

export const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const vault = await readChunks(key);
    if (vault !== null) return vault;
    // First launch after the switch: adopt the plaintext session once.
    const legacy = await AsyncStorage.getItem(key).catch(() => null);
    if (legacy === null) return null;
    await writeChunks(key, legacy);
    await AsyncStorage.removeItem(key).catch(() => {});
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    await writeChunks(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await deleteChunks(key);
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};
