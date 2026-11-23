import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as MediaLibrary from 'expo-media-library';
import { supabase } from './supabase';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type PickedAsset = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
}

export async function uploadToBucket(
  bucket: string,
  scope: string,
  file: PickedAsset,
  maxBytes: number,
): Promise<{ path: string; size: number; mime: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const source = new File(file.uri);
  if (!source.exists) throw new Error(`Could not read ${file.name}.`);
  const size = file.size ?? source.size ?? 0;
  if (!size) {
    throw new Error(
      `Could not determine the file size of ${file.name}. Pick it again.`,
    );
  }
  if (size > maxBytes) {
    throw new Error(
      `${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    );
  }
  const bytes = await source.bytes();
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `${file.name} is larger than ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    );
  }
  const path = `${scope}/${user.id}/${Crypto.randomUUID()}_${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: file.mimeType ?? 'application/octet-stream',
    });
  if (error) throw error;
  return { path, size, mime: file.mimeType ?? 'application/octet-stream' };
}

export function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function signedUrl(
  bucket: string,
  path: string,
  seconds = 900,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, seconds);
  if (error || !data) throw error ?? new Error('Could not open file.');
  return data.signedUrl;
}

export async function openWithSignedUrl(
  bucket: string,
  path: string,
): Promise<void> {
  await Linking.openURL(await signedUrl(bucket, path));
}

export async function saveRemoteToGallery(
  url: string,
  name: string,
): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Allow photo access to download.');
  }
  const dir = new Directory(Paths.cache, 'ophixe-media');
  dir.create();
  const file = await File.downloadFileAsync(
    url,
    new File(dir, safeName(name)),
  );
  await MediaLibrary.createAssetAsync(file.uri);
}

export async function removeFromBucket(
  bucket: string,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

function mentionsColumn(message: string): boolean {
  return /column|schema|PGRST204|PGRST205/i.test(message);
}

export async function uploadMyAvatar(asset: PickedAsset): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { path } = await uploadToBucket('avatars', 'profile', asset, MAX_IMAGE_BYTES);
  bustAvatarCache();
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: path })
      .eq('id', user.id);
    if (error) throw error;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!mentionsColumn(message)) {
      await removeFromBucket('avatars', path).catch(() => {});
      throw err;
    }
    // Column missing: the file is stored; the app shows it from local cache.
    const { default: AsyncStorage } = await import(
      '@react-native-async-storage/async-storage'
    );
    await AsyncStorage.setItem(`@ophixe:avatar:${user.id}`, path).catch(
      () => {},
    );
  }
  return publicUrl('avatars', path);
}

export async function uploadCommunityLogo(
  communityId: string,
  asset: PickedAsset,
): Promise<string> {
  const { path } = await uploadToBucket(
    'avatars',
    `community-logos/${communityId}`,
    asset,
    MAX_IMAGE_BYTES,
  );
  return path;
}

let avatarCache: { at: number; userId: string; url: string | null } | null =
  null;
const AVATAR_CACHE_TTL_MS = 60000;

export function bustAvatarCache(): void {
  avatarCache = null;
}

export async function getMyAvatarUrl(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (
    avatarCache &&
    avatarCache.userId === user.id &&
    Date.now() - avatarCache.at < AVATAR_CACHE_TTL_MS
  ) {
    return avatarCache.url;
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();
    if (!error && data) {
      const path = (data as { avatar_url: string | null }).avatar_url;
      if (path) {
        const url = publicUrl('avatars', path);
        avatarCache = { at: Date.now(), userId: user.id, url };
        return url;
      }
    }
  } catch {
    // Fall through to the local copy.
  }
  try {
    const { default: AsyncStorage } = await import(
      '@react-native-async-storage/async-storage'
    );
    const path =
      (await AsyncStorage.getItem(`@ophixe:avatar:${user.id}`)) ??
      (await AsyncStorage.getItem(`@halla:avatar:${user.id}`));
    const url = path ? publicUrl('avatars', path) : null;
    avatarCache = { at: Date.now(), userId: user.id, url };
    return url;
  } catch {
    return null;
  }
}
