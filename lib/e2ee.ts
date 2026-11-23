import './prng';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * End-to-end encryption for direct messages and group chats.
 * X25519 key exchange + XSalsa20-Poly1305 (NaCl box).
 *
 * DMs seal one envelope for the peer, stored in messages.body.
 * Groups fan out: the sender's own envelope goes in messages.body and one
 * sealed envelope per member goes in message_envelopes, so the server never
 * sees new group plaintext. Members without a published key get no envelope
 * and see a placeholder until a later message includes them. Sender keys
 * remain the future optimization for very large groups.
 */

const B64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
  if (clean.length % 4 !== 0) throw new Error('Bad base64 length.');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const w = clean[i] === '=' ? -1 : B64.indexOf(clean[i]);
    const x = clean[i + 1] === '=' ? -1 : B64.indexOf(clean[i + 1]);
    const y = clean[i + 2] === '=' ? -1 : B64.indexOf(clean[i + 2]);
    const z = clean[i + 3] === '=' ? -1 : B64.indexOf(clean[i + 3]);
    if (w < 0 || x < 0 || (clean[i + 2] !== '=' && y < 0)) {
      throw new Error('Bad base64 data.');
    }
    const n = (w << 18) | (x << 12) | (Math.max(0, y) << 6) | Math.max(0, z);
    out.push((n >> 16) & 255);
    if (clean[i + 2] !== '=') out.push((n >> 8) & 255);
    if (clean[i + 3] !== '=') out.push(n & 255);
  }
  return new Uint8Array(out);
}

const SECRET_STORE_KEY = 'halla_e2ee_secret_v1';

async function loadSecret(): Promise<Uint8Array | null> {
  const raw = await SecureStore.getItemAsync(SECRET_STORE_KEY);
  if (raw) return fromBase64(raw);
  return null;
}

async function saveSecret(secret: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(SECRET_STORE_KEY, toBase64(secret));
}

/**
 * Forget the device chat key entirely (account deletion). The published
 * public key dies with the profile row server-side; this clears the
 * secret from secure storage and memory so nothing can decrypt for us.
 */
export async function clearMyKeypair(): Promise<void> {
  cached = null;
  webEphemeral = null;
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(SECRET_STORE_KEY).catch(() => {});
}

export type Keypair = { publicKey: string; secretKey: Uint8Array };

let cached: Keypair | null = null;
let webEphemeral: Keypair | null = null;

function ephemeralWebKeypair(): Keypair {
  if (!webEphemeral) {
    const secret = nacl.box.keyPair().secretKey;
    const pub = nacl.box.keyPair.fromSecretKey(secret).publicKey;
    webEphemeral = { publicKey: toBase64(pub), secretKey: secret };
  }
  return webEphemeral;
}

export async function getMyKeypair(): Promise<Keypair> {
  if (cached) return cached;
  // Web has no secure enclave: use a memory-only key for this session
  // rather than persisting the secret where any script can read it.
  if (Platform.OS === 'web') {
    cached = ephemeralWebKeypair();
    void publishMyKey(cached.publicKey);
    return cached;
  }
  let secret: Uint8Array | null;
  try {
    secret = await loadSecret();
  } catch {
    throw new Error('Secure storage is unavailable, so encryption is disabled.');
  }
  if (!secret || secret.length !== nacl.box.secretKeyLength) {
    secret = nacl.box.keyPair().secretKey;
    try {
      await saveSecret(secret);
    } catch {
      throw new Error(
        'Secure storage is unavailable, so encryption is disabled.',
      );
    }
  }
  const pub = nacl.box.keyPair.fromSecretKey(secret).publicKey;
  cached = { publicKey: toBase64(pub), secretKey: secret };
  void publishMyKey(cached.publicKey);
  return cached;
}

async function publishMyKey(publicKey: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase
      .from('profiles')
      .update({ public_key: publicKey })
      .eq('id', user.id);
    if (error) return false;
    // Read back: proves the column exists and the write actually landed,
    // instead of silently leaving the peer unable to decrypt our messages.
    const { data, error: readError } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', user.id)
      .single();
    if (readError) return false;
    return (
      (data as { public_key: string | null } | null)?.public_key === publicKey
    );
  } catch {
    return false;
  }
}

export type Envelope = { v: 1; n: string; c: string };

export function parseEnvelope(body: string): Envelope | null {
  if (!body.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(body) as Partial<Envelope> | null;
    if (
      parsed?.v === 1 &&
      typeof parsed.n === 'string' &&
      typeof parsed.c === 'string'
    ) {
      return { v: 1, n: parsed.n, c: parsed.c };
    }
    return null;
  } catch {
    return null;
  }
}

export async function encryptForPeer(
  plaintext: string,
  peerPublicKey: string,
): Promise<string> {
  const mine = await getMyKeypair();
  const shared = nacl.box.before(fromBase64(peerPublicKey), mine.secretKey);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const cipher = nacl.box.after(
    new TextEncoder().encode(plaintext),
    nonce,
    shared,
  );
  const envelope: Envelope = {
    v: 1,
    n: toBase64(nonce),
    c: toBase64(cipher),
  };
  return JSON.stringify(envelope);
}

export async function decryptFromPeer(
  envelope: Envelope,
  peerPublicKey: string,
): Promise<string | null> {
  try {
    const mine = await getMyKeypair();
    const shared = nacl.box.before(fromBase64(peerPublicKey), mine.secretKey);
    const plain = nacl.box.open.after(
      fromBase64(envelope.c),
      fromBase64(envelope.n),
      shared,
    );
    if (!plain) return null;
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

let verifiedKey: string | null = null;
let setupFlight: Promise<{
  ok: boolean;
  reason: 'key-unavailable' | 'key-not-published' | null;
}> | null = null;

/**
 * One-shot encryption setup, safe to call on launch and sign-in: creates
 * the device keypair (if needed) and verifies our public key is published
 * so chat partners can decrypt our messages. Never throws; concurrent
 * callers share one attempt.
 */
export async function setupEncryption(): Promise<{
  ok: boolean;
  reason: 'key-unavailable' | 'key-not-published' | null;
}> {
  if (!setupFlight) {
    setupFlight = (async () => {
      try {
        const mine = await getMyKeypair();
        if (verifiedKey === mine.publicKey) {
          return { ok: true, reason: null };
        }
        const published = await publishMyKey(mine.publicKey);
        if (!published) return { ok: false, reason: 'key-not-published' };
        verifiedKey = mine.publicKey;
        return { ok: true, reason: null };
      } catch {
        return { ok: false, reason: 'key-unavailable' };
      } finally {
        setupFlight = null;
      }
    })();
  }
  return setupFlight;
}

/** Publish our public key and wait for it to land, so recipients of our
 *  next message can already decrypt when it arrives. */
export async function ensureKeyPublished(): Promise<void> {
  const res = await setupEncryption();
  if (!res.ok) {
    throw new Error(
      res.reason === 'key-unavailable'
        ? 'Could not set up encryption on this device.'
        : 'Could not publish your chat key. Check your connection and try again.',
    );
  }
}

export type GroupFanout = {
  /** Self envelope: the sender reads the message back from messages.body. */
  selfEnvelope: string;
  /** One sealed envelope per member that has a published key. */
  envelopes: { recipientId: string; envelope: string }[];
  /** Members without a key: they see a placeholder for this message. */
  missing: number;
};

export async function encryptForGroup(
  plaintext: string,
  recipients: { userId: string; publicKey: string | null }[],
  myUserId: string,
): Promise<GroupFanout> {
  const mine = await getMyKeypair();
  const selfEnvelope = await encryptForPeer(plaintext, mine.publicKey);
  const envelopes: { recipientId: string; envelope: string }[] = [];
  let missing = 0;
  for (const r of recipients) {
    if (r.userId === myUserId) continue;
    if (!r.publicKey) {
      missing += 1;
      continue;
    }
    envelopes.push({
      recipientId: r.userId,
      envelope: await encryptForPeer(plaintext, r.publicKey),
    });
  }
  return { selfEnvelope, envelopes, missing };
}
