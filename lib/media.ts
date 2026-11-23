import './prng';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import nacl from 'tweetnacl';
import { autoSaveChatMedia } from './deviceMedia';
import { fromBase64, toBase64 } from './e2ee';
import { supabase } from './supabase';
import { signedUrl } from './uploads';

/**
 * Encrypted chat attachments (photos, videos, documents) for DMs and groups.
 * Same guarantee as voice notes: files are sealed with a per-message
 * secretbox key, the chat-media bucket holds only ciphertext, and the key
 * travels inside the chat's normal E2EE envelope. Devices keep decrypted
 * copies under the app's document directory so attachments stay available
 * offline after the first open.
 */

export type MediaKind = 'image' | 'video' | 'file' | 'audio';

export type MediaDescriptor = {
  kind: MediaKind;
  path: string;
  key: string;
  name: string;
  mime: string;
  size: number;
  seconds?: number;
  /** WhatsApp-style caption, written at send time in the preview. */
  caption?: string;
};

export const MAX_CHAT_MEDIA_BYTES = 25 * 1024 * 1024;

/** Documents (including APKs) get headroom: packages run large. */
export const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;

export function mediaDescriptor(
  kind: MediaKind,
  path: string,
  keyB64: string,
  name: string,
  mime: string,
  size: number,
  seconds?: number,
  caption?: string,
): string {
  const descriptor: MediaDescriptor = {
    kind,
    path,
    key: keyB64,
    name,
    mime,
    size,
    ...(seconds !== undefined ? { seconds } : {}),
    ...(caption ? { caption } : {}),
  };
  return JSON.stringify(descriptor);
}

export function parseMediaDescriptor(text: string): MediaDescriptor | null {
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as Partial<MediaDescriptor> | null;
    if (
      (parsed?.kind === 'image' ||
        parsed?.kind === 'video' ||
        parsed?.kind === 'file' ||
        parsed?.kind === 'audio') &&
      typeof parsed.path === 'string' &&
      typeof parsed.key === 'string' &&
      typeof parsed.name === 'string'
    ) {
      return {
        kind: parsed.kind,
        path: parsed.path,
        key: parsed.key,
        name: parsed.name,
        mime: typeof parsed.mime === 'string' ? parsed.mime : 'application/octet-stream',
        size: typeof parsed.size === 'number' ? parsed.size : 0,
        ...(typeof parsed.seconds === 'number'
          ? { seconds: parsed.seconds }
          : {}),
        ...(typeof parsed.caption === 'string' && parsed.caption
          ? { caption: parsed.caption }
          : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Human label for quotes and previews; plain text passes through. */
export function mediaLabel(text: string): string {
  const descriptor = parseMediaDescriptor(text);
  if (!descriptor) return text;
  if (descriptor.caption) return descriptor.caption;
  if (descriptor.kind === 'image') return 'Photo';
  if (descriptor.kind === 'video') return 'Video';
  if (descriptor.kind === 'audio') return 'Audio';
  return descriptor.name || 'Document';
}

/**
 * Storage failures in plain language. The common one is a backend that has
 * not applied the chat-media migration yet ("Bucket not found") — the user
 * cannot fix that from the app, so the message says who can.
 */
export function friendlyMediaError(
  err: unknown,
  fallback = 'Could not send.',
): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/bucket not found/i.test(message)) {
    return "Attachments aren't set up on the server yet. Ask your admin to update the backend, then try again.";
  }
  if (
    /row-level security|violates.*policy|not allowed|permission denied|unauthorized/i.test(
      message,
    )
  ) {
    return "You don't have access to send files in this chat.";
  }
  if (/network request failed|fetch failed|timeout|offline/i.test(message)) {
    return 'You are offline. Reconnect to send photos, videos, and files.';
  }
  return message || fallback;
}

export function formatBytes(size: number): string {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function kindForMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export async function sealMediaFile(
  uri: string,
  maxBytes: number = MAX_CHAT_MEDIA_BYTES,
): Promise<{ cipher: Uint8Array; keyB64: string; size: number }> {
  const bytes = await new File(uri).bytes();
  if (bytes.byteLength === 0) {
    throw new Error('Could not read that file. Pick it again.');
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `That file is larger than ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    );
  }
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(bytes, nonce, key);
  const cipher = new Uint8Array(nonce.length + box.length);
  cipher.set(nonce);
  cipher.set(box, nonce.length);
  return { cipher, keyB64: toBase64(key), size: bytes.byteLength };
}

export async function uploadMediaFile(
  conversationId: string,
  cipher: Uint8Array,
  kind: MediaKind,
): Promise<string> {
  // Kinded folders keep storage browsable by type; the RLS policies only
  // ever match the leading conversation segment, and older flat paths
  // ({convo}/{uuid}.bin) keep resolving by exact path.
  const path = `${conversationId}/${kind}/${Crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, cipher, { contentType: 'application/octet-stream' });
  if (error) throw error;
  return path;
}

/**
 * Re-home sealed bytes for a forward: the ciphertext moves unchanged to the
 * target conversation's folder (storage RLS is per-folder), so the same key
 * keeps working and nothing is ever decrypted server-side. Returns the new
 * path for a fresh descriptor.
 */
export async function copyCipherBytes(
  bucket: 'chat-media' | 'voice-notes',
  srcPath: string,
  conversationId: string,
  kind?: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(srcPath);
  if (error || !data) throw error ?? new Error('Could not open file.');
  const bytes = new Uint8Array(await data.arrayBuffer());
  const dst = kind
    ? `${conversationId}/${kind}/${Crypto.randomUUID()}.bin`
    : `${conversationId}/${Crypto.randomUUID()}.bin`;
  const { error: upError } = await supabase.storage
    .from(bucket)
    .upload(dst, bytes, { contentType: 'application/octet-stream' });
  if (upError) throw upError;
  return dst;
}

const mediaCache = new Map<string, string>();

function mediaDir(): Directory {
  // Document directory (not cache): decrypted attachments survive offline.
  const dir = new Directory(Paths.document, 'chat-media');
  try {
    dir.create();
  } catch {
    // Already exists.
  }
  return dir;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
}

/** Decrypt to on-device storage (cached) and return a local uri. */
export async function fetchMediaFile(
  descriptor: MediaDescriptor,
  cacheKey: string,
): Promise<string> {
  const hit = mediaCache.get(descriptor.path);
  if (hit) {
    void autoSaveChatMedia(
      hit,
      descriptor.kind,
      descriptor.name,
      descriptor.mime,
      cacheKey,
    );
    return hit;
  }
  const local = new File(mediaDir(), `${cacheKey}-${safeName(descriptor.name)}`);
  if (local.exists) {
    mediaCache.set(descriptor.path, local.uri);
    void autoSaveChatMedia(
      local.uri,
      descriptor.kind,
      descriptor.name,
      descriptor.mime,
      cacheKey,
    );
    return local.uri;
  }
  const signed = await signedUrl('chat-media', descriptor.path);
  const response = await fetch(signed);
  const cipher = new Uint8Array(await response.arrayBuffer());
  const nonce = cipher.slice(0, nacl.secretbox.nonceLength);
  const box = cipher.slice(nacl.secretbox.nonceLength);
  const plain = nacl.secretbox.open(box, nonce, fromBase64(descriptor.key));
  if (!plain) throw new Error('Could not decrypt this attachment.');
  local.write(plain);
  mediaCache.set(descriptor.path, local.uri);
  void autoSaveChatMedia(
    local.uri,
    descriptor.kind,
    descriptor.name,
    descriptor.mime,
    cacheKey,
  );
  return local.uri;
}
