import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import {
  EncodingType,
  StorageAccessFramework,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

/**
 * "Ophixe Media" on the device: chat photos and videos land in a gallery
 * album of that name; chat documents land in a device folder of that name
 * (Android Downloads via the storage picker, app folder elsewhere).
 * Plaintext by design — the user asked for visible on-device copies — so
 * saved items leave chat encryption (Photos/cloud backup can see them).
 */

export const OPHIXE_ALBUM = 'Ophixe Media';
export const OPHIXE_DOCS_FOLDER = 'Ophixe Media';

const AUTOSAVE_KEY = '@ophixe:media_autosave';
const SAVED_KEY = '@ophixe:media_saved';
const DOCS_DIR_KEY = '@ophixe:docs_dir';
const SAVED_CAP = 2000;

export async function getAutoSaveEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AUTOSAVE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export async function setAutoSaveEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0');
  } catch {
    // Preference write failure keeps the previous behaviour.
  }
}

let savedKeys: Set<string> | null = null;

async function loadSavedKeys(): Promise<Set<string>> {
  if (savedKeys) return savedKeys;
  savedKeys = new Set();
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(list)) {
      for (const key of list) savedKeys.add(String(key));
    }
  } catch {
    // Corrupt store: re-save everything once.
  }
  return savedKeys;
}

export async function isAlreadySaved(key: string): Promise<boolean> {
  return (await loadSavedKeys()).has(key);
}

async function markSaved(key: string): Promise<void> {
  const set = await loadSavedKeys();
  set.add(key);
  try {
    const trimmed = [...set].slice(-SAVED_CAP);
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(trimmed));
  } catch {
    // Memory still dedups this session.
  }
}

/** Session-only skip: denied/unsupported stops nagging until relaunch. */
const sessionSkip = new Set<string>();

export type SaveStatus =
  | 'saved'
  | 'denied'
  | 'unsupported'
  | 'failed'
  | 'skipped';

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
}

/**
 * Copy a decrypted photo/video into the gallery album. Write-only
 * permission: never reads the user's library.
 */
export async function saveImageOrVideoToAlbum(
  localUri: string,
): Promise<SaveStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (perm.status !== 'granted') return 'denied';
    const asset = await MediaLibrary.createAssetAsync(localUri);
    const album = await MediaLibrary.getAlbumAsync(OPHIXE_ALBUM).catch(
      () => null,
    );
    if (!album) {
      await MediaLibrary.createAlbumAsync(OPHIXE_ALBUM, asset, false);
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }
    return 'saved';
  } catch {
    return 'failed';
  }
}

function docsFolder(): Directory {
  const dir = new Directory(Paths.document, OPHIXE_DOCS_FOLDER);
  try {
    dir.create();
  } catch {
    // Already exists.
  }
  return dir;
}

/**
 * Copy a decrypted document into the app's Ophixe Media folder (always
 * available offline). Idempotent per message: re-saving returns the
 * existing copy.
 */
export async function saveDocToDeviceFolder(
  localUri: string,
  name: string,
  key: string,
): Promise<string> {
  const short = String(key).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const dest = new File(docsFolder(), `${short}_${safeName(name)}`);
  if (dest.exists) return dest.uri;
  dest.write(await new File(localUri).bytes());
  return dest.uri;
}

/** Persisted Android Downloads folder uri, once the user picks it. */
export async function getDocsDirUri(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(DOCS_DIR_KEY)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Android: let the user pick the visible Ophixe Media docs folder (once).
 * Starts in Downloads; the grant persists across launches. iOS and web
 * have no shared folders: docs stay in-app with open/share instead.
 */
export async function chooseDocsDir(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const start = StorageAccessFramework.getUriForDirectoryInRoot('Download');
    const res =
      await StorageAccessFramework.requestDirectoryPermissionsAsync(start);
    if (!res.granted || !res.directoryUri) return null;
    await AsyncStorage.setItem(DOCS_DIR_KEY, res.directoryUri).catch(() => {});
    return res.directoryUri;
  } catch {
    return null;
  }
}

async function uniqueDocName(dirUri: string, name: string): Promise<string> {
  const clean = safeName(name);
  let existing: string[] = [];
  try {
    existing = await StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    return clean;
  }
  const taken = new Set(existing.map((u) => String(u).split('/').pop() ?? ''));
  if (!taken.has(clean)) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  for (let n = 2; n < 100; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${Date.now()}_${clean}`;
}

/**
 * Copy a decrypted document into the user's picked Downloads folder.
 * Returns null when unavailable (not Android, no folder picked yet, or a
 * write failure) so the caller falls back to the app folder.
 */
export async function saveDocToSharedFolder(
  localUri: string,
  name: string,
  mime: string,
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const dirUri = await getDocsDirUri();
    if (!dirUri) return null;
    const fileName = await uniqueDocName(dirUri, name);
    const fileUri = await StorageAccessFramework.createFileAsync(
      dirUri,
      fileName,
      mime || 'application/octet-stream',
    );
    const base64 = await readAsStringAsync(localUri, {
      encoding: EncodingType.Base64,
    });
    await writeAsStringAsync(fileUri, base64, {
      encoding: EncodingType.Base64,
    });
    return fileUri;
  } catch {
    return null;
  }
}

export type ChatMediaKind = 'image' | 'video' | 'file' | 'audio';

async function storeChatMedia(
  localUri: string,
  kind: ChatMediaKind,
  name: string,
  mime: string,
  messageId: string,
): Promise<SaveStatus> {
  if (kind === 'file') {
    // Visible shared folder when the user picked one, else the app folder
    // (still on-device and offline). Either counts as saved.
    const shared = await saveDocToSharedFolder(localUri, name, mime);
    if (shared) {
      await markSaved(messageId);
      return 'saved';
    }
    try {
      await saveDocToDeviceFolder(localUri, name, messageId);
      await markSaved(messageId);
      return 'saved';
    } catch {
      return 'failed';
    }
  }
  const status = await saveImageOrVideoToAlbum(localUri);
  if (status === 'saved') await markSaved(messageId);
  else sessionSkip.add(messageId);
  return status;
}

/**
 * Background auto-save after a chat attachment decrypts. Voice notes and
 * audio stay in-app; everything else follows the auto-save toggle.
 * Never throws: failures stay silent and retry on the next open.
 */
export async function autoSaveChatMedia(
  localUri: string,
  kind: ChatMediaKind,
  name: string,
  mime: string,
  messageId: string,
): Promise<SaveStatus> {
  if (kind === 'audio') return 'skipped';
  if (sessionSkip.has(messageId)) return 'skipped';
  try {
    if (!(await getAutoSaveEnabled())) return 'skipped';
    if (await isAlreadySaved(messageId)) return 'skipped';
    return await storeChatMedia(localUri, kind, name, mime, messageId);
  } catch {
    return 'failed';
  }
}

/**
 * Explicit per-item save (viewer SAVE button). Bypasses the auto-save
 * toggle — the user asked — but keeps dedup.
 */
export async function saveChatMediaNow(
  localUri: string,
  kind: ChatMediaKind,
  name: string,
  mime: string,
  messageId: string,
): Promise<SaveStatus> {
  if (kind === 'audio') return 'unsupported';
  try {
    if (await isAlreadySaved(messageId)) return 'saved';
    sessionSkip.delete(messageId);
    return await storeChatMedia(localUri, kind, name, mime, messageId);
  } catch {
    return 'failed';
  }
}
