import './prng';
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import nacl from 'tweetnacl';
import { fromBase64, toBase64 } from './e2ee';
import { supabase } from './supabase';
import { signedUrl } from './uploads';

/**
 * Voice notes: recorded with expo-audio, sealed with a per-message
 * secretbox key, stored as ciphertext in the private voice-notes bucket.
 * The key travels inside the chat's normal encrypted envelope, so the
 * server only ever sees ciphertext — same guarantee as text messages.
 */

export type VoiceDescriptor = {
  kind: 'voice';
  path: string;
  seconds: number;
  key: string;
};

export const MAX_VOICE_BYTES = 15 * 1024 * 1024;

export function voiceDescriptor(
  path: string,
  seconds: number,
  keyB64: string,
): string {
  const descriptor: VoiceDescriptor = {
    kind: 'voice',
    path,
    seconds,
    key: keyB64,
  };
  return JSON.stringify(descriptor);
}

export function parseVoiceDescriptor(text: string): VoiceDescriptor | null {
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as Partial<VoiceDescriptor> | null;
    if (
      parsed?.kind === 'voice' &&
      typeof parsed.path === 'string' &&
      typeof parsed.key === 'string' &&
      typeof parsed.seconds === 'number'
    ) {
      return {
        kind: 'voice',
        path: parsed.path,
        seconds: parsed.seconds,
        key: parsed.key,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function formatVoiceDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Human label for quotes and previews; plain text passes through. */
export function voiceLabel(text: string): string {
  const descriptor = parseVoiceDescriptor(text);
  return descriptor
    ? `Voice note • ${formatVoiceDuration(descriptor.seconds)}`
    : text;
}

export async function ensureMicPermission(): Promise<boolean> {
  const { status, granted } =
    await AudioModule.requestRecordingPermissionsAsync();
  return granted || status === 'granted';
}

export async function primeAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });
}

export async function sealVoiceFile(
  uri: string,
): Promise<{ cipher: Uint8Array; keyB64: string }> {
  const bytes = await new File(uri).bytes();
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(bytes, nonce, key);
  const cipher = new Uint8Array(nonce.length + box.length);
  cipher.set(nonce);
  cipher.set(box, nonce.length);
  if (cipher.byteLength > MAX_VOICE_BYTES) {
    throw new Error('That voice note is too long. Keep it shorter.');
  }
  return { cipher, keyB64: toBase64(key) };
}

export async function uploadVoiceFile(
  conversationId: string,
  cipher: Uint8Array,
): Promise<string> {
  const path = `${conversationId}/${Crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage
    .from('voice-notes')
    .upload(path, cipher, { contentType: 'application/octet-stream' });
  if (error) throw error;
  return path;
}

const fileCache = new Map<string, string>();

export async function fetchVoiceFile(
  descriptor: VoiceDescriptor,
  cacheKey: string,
): Promise<string> {
  const hit = fileCache.get(descriptor.path);
  if (hit) return hit;
  const signed = await signedUrl('voice-notes', descriptor.path);
  const response = await fetch(signed);
  const cipher = new Uint8Array(await response.arrayBuffer());
  const nonce = cipher.slice(0, nacl.secretbox.nonceLength);
  const box = cipher.slice(nacl.secretbox.nonceLength);
  const plain = nacl.secretbox.open(box, nonce, fromBase64(descriptor.key));
  if (!plain) throw new Error('Could not decrypt this voice note.');
  const dir = new Directory(Paths.cache, 'voice');
  dir.create();
  const out = new File(dir, `${cacheKey}.m4a`);
  out.write(plain);
  fileCache.set(descriptor.path, out.uri);
  return out.uri;
}

type VoiceListener = (playingId: string | null) => void;

const listeners = new Set<VoiceListener>();
let currentId: string | null = null;

export function subscribeVoicePlay(listener: VoiceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlayingVoiceId(): string | null {
  return currentId;
}

export function announceVoicePlay(id: string | null): void {
  currentId = id;
  for (const listener of listeners) listener(id);
}
