// Offline-first + smart fetching for Ophixe.
//
// One small module behind three behaviours the app needs on flaky networks:
//
// 1. Stop fetching every time: screens read through resolveWithCache(), which
//    serves a saved copy while it is fresh (TTL) and only hits Supabase when
//    the copy is stale, missing, or the user pulls to refresh.
// 2. Stay usable offline/low-network: connectivity is tracked, reads fall back
//    to the saved copy, and writes go through runOrQueue() into a persisted
//    mutation queue that flushes itself when the network returns.
// 3. Client-side load handling (the Supabase-shaped answer to "load
//    balancing", since there is no custom server to balance across):
//    schedule() dedupes identical in-flight requests and caps concurrency so
//    a screen mount storm never fires dozens of queries at once, and
//    withRetry() backs off on network failures instead of hammering.
//
// Reads may use withRetry; writes must NOT (a retried write can apply twice).
// Writes use runOrQueue() so each mutation is attempted once per flush and
// retried later only as a queued item.
//
// This module is dependency-light on purpose: it must never import the data
// helpers (chat, communityContent, ...) because they import it back through
// the screens. Mutation handlers are registered from lib/offlineHandlers.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/** Freshness per list. Within the TTL a screen mount costs zero requests. */
export const CACHE_TTL = {
  feed: 60_000,
  announcements: 60_000,
  conversations: 30_000,
  messages: 20_000,
  notifications: 60_000,
  communities: 120_000,
  events: 60_000,
} as const;

// ── Connectivity ─────────────────────────────────────────────────────────

let online = true;
const onlineListeners = new Set<() => void>();

function emitOnline(): void {
  for (const listener of onlineListeners) listener();
}

export function subscribeOnline(listener: () => void): () => void {
  onlineListeners.add(listener);
  return () => {
    onlineListeners.delete(listener);
  };
}

export function isOnline(): boolean {
  return online;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => online, () => online);
}

function setOnline(value: boolean): void {
  if (value === online) return;
  online = value;
  emitOnline();
  // Coming back online flushes whatever the user did while away.
  if (value) void flushMutations();
}

/** A request just failed on the network: mark us offline and re-probe soon. */
export function reportNetworkFailure(): void {
  if (!online) return;
  setOnline(false);
  void probeSoon();
}

/**
 * A request just succeeded: we are definitively online. Without this,
 * one slow episode latches the offline banner until a fast probe —
 * which may never come on a slow-but-working link.
 */
export function reportNetworkSuccess(): void {
  setOnline(true);
}

let probeTimer: ReturnType<typeof setTimeout> | null = null;

function probeSoon(delayMs = 8000): void {
  if (probeTimer) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void probeConnectivity();
  }, delayMs);
}

/**
 * Cheap liveness check against the Supabase Auth health endpoint. Any HTTP
 * response (even an error status) proves the network path works; only a
 * thrown fetch (DNS, timeout, airplane mode) means offline.
 */
export async function probeConnectivity(): Promise<boolean> {
  if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder')) {
    setOnline(true);
    return true;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    setOnline(true);
    return true;
  } catch {
    setOnline(false);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

let monitorStarted = false;

/** Periodic + foreground re-probes. Call once from the root layout. */
export function startConnectivityMonitor(): () => void {
  probeConnectivity().catch(() => {});
  if (monitorStarted) return () => {};
  monitorStarted = true;
  const interval = setInterval(() => {
    probeConnectivity().catch(() => {});
  }, 30_000);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') probeConnectivity().catch(() => {});
  });
  return () => {
    clearInterval(interval);
    subscription.remove();
    monitorStarted = false;
  };
}

/** True for transport failures worth queuing/retrying (not app/auth errors). */
export function isNetworkError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 500) return true;
  if (err instanceof TypeError) return true;
  const message =
    err instanceof Error
      ? err.message
      : String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return /network request failed|fetch failed|failed to fetch|network error|timeout|timed out|abort|econn|esocket|enotfound|eai_again|502|503|504/i.test(
    message,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Client-side load handling: dedupe + cap + backoff ────────────────────

/** Max simultaneous Supabase requests from this device. */
export const MAX_CONCURRENT_REQUESTS = 4;

let activeRequests = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeRequests += 1;
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = waiters.shift();
  if (next) next();
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Run fn under the concurrency cap, coalescing identical in-flight keys so
 * N mounts asking for the same list share one request. Reads only.
 */
export function schedule<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const run = (async (): Promise<T> => {
    await acquireSlot();
    try {
      return await fn();
    } finally {
      inflight.delete(key);
      releaseSlot();
    }
  })();
  inflight.set(key, run);
  return run;
}

/**
 * Slow-network backstop: on a flaky link requests usually hang instead of
 * failing, and supabase-js sets no timeout of its own. Anything slower
 * than this falls back (stale cache for reads, outbox for writes) instead
 * of spinning forever.
 */
export const NETWORK_TIMEOUT_MS = 15_000;

/**
 * Reject with a network-shaped error when promise is slower than ms. The
 * rejection matches isNetworkError() so every existing fallback treats a
 * stall exactly like a transport failure. The underlying work keeps
 * running: a late read still warms the cache for the next mount.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = NETWORK_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const gate = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Network request timed out')),
      ms,
    );
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), gate]);
}

/**
 * Read-side retry with exponential backoff + jitter. Only network failures
 * retry; auth/validation/RLS errors throw immediately. Never wrap writes.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 400;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isNetworkError(err) || attempt >= retries) throw err;
      reportNetworkFailure();
      const delay = baseMs * 2 ** attempt + Math.random() * 200;
      attempt += 1;
      await sleep(delay);
    }
  }
}

// ── Persistent read cache ────────────────────────────────────────────────

const CACHE_PREFIX = 'ophixe:cache:v1:';

type CacheRow<T> = { at: number; data: T };

export async function readCache<T>(
  key: string,
): Promise<CacheRow<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRow<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const row: CacheRow<T> = { at: Date.now(), data };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(row));
  } catch {
    // Quota or storage failure must never break the screen.
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // Best-effort only.
  }
}

export type CacheSource = 'cache-fresh' | 'network' | 'cache-stale' | 'none';

/**
 * The standard list read: fresh-enough cache wins with zero requests,
 * otherwise one deduped network fetch refreshes the cache, and any network
 * failure falls back to the saved copy. Pull-to-refresh passes force: true.
 */
export async function resolveWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlMs: number; force?: boolean; retries?: number },
): Promise<{ value: T | null; source: CacheSource; cachedAt: number | null }> {
  const cached = await readCache<T>(key);
  const fresh =
    !!cached && Date.now() - cached.at < opts.ttlMs && !opts.force;
  if (fresh && cached) {
    return { value: cached.data, source: 'cache-fresh', cachedAt: cached.at };
  }
  if (!isOnline()) {
    return cached
      ? { value: cached.data, source: 'cache-stale', cachedAt: cached.at }
      : { value: null, source: 'none', cachedAt: null };
  }
  try {
    // The timeout bounds the whole attempt (retries included): a stalled
    // fetch resolves to the saved copy instead of hanging the screen.
    const value = await withTimeout(
      schedule(`fetch:${key}`, () =>
        withRetry(fetcher, { retries: opts.retries ?? 1 }),
      ),
    );
    reportNetworkSuccess();
    await writeCache(key, value);
    return { value, source: 'network', cachedAt: Date.now() };
  } catch (err) {
    if (isNetworkError(err)) reportNetworkFailure();
    return cached
      ? { value: cached.data, source: 'cache-stale', cachedAt: cached.at }
      : { value: null, source: 'none', cachedAt: null };
  }
}

// ── Offline mutation queue (WhatsApp-style outbox) ───────────────────────

export type MutationType =
  | 'notification-read'
  | 'notifications-read-all'
  | 'mark-read'
  | 'like-set'
  | 'comment'
  | 'send-message'
  | 'send-group-message';

export type QueuedMutation = {
  id: string;
  type: MutationType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
};

export type MutationHandler = (
  payload: Record<string, unknown>,
) => Promise<void>;

const QUEUE_KEY = 'ophixe:mutation-queue:v1';
const MAX_ATTEMPTS = 5;

const handlers = new Map<MutationType, MutationHandler>();

export function registerMutationHandler(
  type: MutationType,
  handler: MutationHandler,
): void {
  handlers.set(type, handler);
}

let queueSnapshot: QueuedMutation[] = [];
let queueLoaded = false;
const queueListeners = new Set<() => void>();

function emitQueue(): void {
  for (const listener of queueListeners) listener();
}

export function subscribeQueue(listener: () => void): () => void {
  void loadQueue();
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

export function getQueueSnapshot(): QueuedMutation[] {
  return queueSnapshot;
}

export function getPendingCount(): number {
  return queueSnapshot.length;
}

export function usePendingCount(): number {
  const items = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getQueueSnapshot,
  );
  return items.length;
}

async function loadQueue(): Promise<QueuedMutation[]> {
  if (queueLoaded) return queueSnapshot;
  queueLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
    queueSnapshot = Array.isArray(parsed) ? parsed : [];
  } catch {
    queueSnapshot = [];
  }
  return queueSnapshot;
}

async function saveQueue(): Promise<void> {
  emitQueue();
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queueSnapshot));
  } catch {
    // The in-memory queue still works for this session.
  }
}

function payloadKey(type: MutationType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'notification-read':
      return String(payload.id ?? '');
    case 'mark-read':
      return String(payload.conversationId ?? '');
    case 'like-set':
      return String(payload.postId ?? '');
    case 'comment':
      return '';
    case 'send-message':
    case 'send-group-message':
      return String(payload.clientId ?? '');
    case 'notifications-read-all':
      return '*';
  }
}

export async function enqueueMutation(
  type: MutationType,
  payload: Record<string, unknown>,
): Promise<void> {
  await loadQueue();
  const key = payloadKey(type, payload);
  if (type === 'notifications-read-all') {
    // One read-all absorbs every queued single read.
    queueSnapshot = queueSnapshot.filter((m) => m.type !== 'notification-read');
  } else if (type === 'like-set') {
    // Latest intent wins for the same post.
    queueSnapshot = queueSnapshot.filter(
      (m) => !(m.type === 'like-set' && payloadKey(m.type, m.payload) === key),
    );
  } else if (key && type !== 'comment') {
    const dup = queueSnapshot.some(
      (m) => m.type === type && payloadKey(m.type, m.payload) === key,
    );
    if (dup) return;
  }
  queueSnapshot = [
    ...queueSnapshot,
    {
      id: `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      type,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    },
  ];
  await saveQueue();
  if (isOnline()) void flushMutations();
}

let flushing = false;

/**
 * Local session check (no network). The outbox must never flush while signed
 * out: handlers would fail as a different user — or no user — and the items
 * would be dropped as permanent failures. Dynamic import keeps net.ts free
 * of static cycles with the data layer.
 */
async function hasSession(): Promise<boolean> {
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return true;
  }
}

/** FIFO replay of the outbox. Network failures stop the pass; the rest waits. */
export async function flushMutations(): Promise<{
  sent: number;
  pending: number;
}> {
  if (flushing) return { sent: 0, pending: queueSnapshot.length };
  flushing = true;
  if (!(await hasSession())) {
    flushing = false;
    return { sent: 0, pending: queueSnapshot.length };
  }
  try {
    await loadQueue();
    let sent = 0;
    while (queueSnapshot.length > 0) {
      if (!isOnline()) break;
      const [head, ...rest] = queueSnapshot;
      const handler = handlers.get(head.type);
      if (!handler) {
        queueSnapshot = rest;
        continue;
      }
      try {
        await handler(head.payload);
        queueSnapshot = rest;
        sent += 1;
        reportNetworkSuccess();
      } catch (err) {
        if (!isNetworkError(err) || head.attempts + 1 >= MAX_ATTEMPTS) {
          // Permanent failure (or poison pill): drop so one bad item can
          // never wedge everything queued behind it.
          queueSnapshot = rest;
          continue;
        }
        queueSnapshot = [
          { ...head, attempts: head.attempts + 1 },
          ...rest,
        ];
        reportNetworkFailure();
        break;
      }
    }
    await saveQueue();
    return { sent, pending: queueSnapshot.length };
  } finally {
    flushing = false;
  }
}

/**
 * Try the write now; if we are offline (or the transport fails) queue it for
 * later instead of erroring. Non-network failures still throw.
 */
export async function runOrQueue(
  type: MutationType,
  payload: Record<string, unknown>,
  runner: () => Promise<void>,
): Promise<{ queued: boolean }> {
  if (!isOnline()) {
    await enqueueMutation(type, payload);
    return { queued: true };
  }
  try {
    // A stalled write queues like a failed one: the message shows as
    // pending and sends itself when the network recovers.
    await withTimeout(runner());
    reportNetworkSuccess();
    return { queued: false };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    reportNetworkFailure();
    await enqueueMutation(type, payload);
    return { queued: true };
  }
}

// Warm the snapshot so the first render already knows the outbox size.
void loadQueue();

/**
 * Drop every saved copy and queued write. Called on sign-out so the next
 * account never sees the previous account's cached lists or sends its
 * queued writes.
 */
export async function clearOfflineData(): Promise<void> {
  queueSnapshot = [];
  queueLoaded = true;
  emitQueue();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(
      (k) => k.startsWith(CACHE_PREFIX) || k === QUEUE_KEY,
    );
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // Best-effort only.
  }
}
