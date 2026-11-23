# Offline + low-network behaviour

Ophixe is offline-first on its core lists: feed, announcements, chats,
threads, notifications, and the community list. Fresh data wins when the
network is there; saved copies keep the app usable when it is not.

## What the user sees

- **Instant screens.** Lists render from the on-device copy immediately, then
  refresh in the background only when the copy is stale (see TTLs below).
  Opening the same screen twice in a row costs zero requests the second time.
- **Offline banner.** A thin strip under the header says `You are offline —
  showing saved content` with a Retry button, plus how many writes are
  waiting. While the outbox flushes it says `Back online — sending N…`.
- **Queued writes (WhatsApp-style).** These work offline and send themselves
  later: chat messages (text), notification reads, mark-all-read, thread
  read state, likes, and comments. Queued chat rows show `Sending…` until the
  server copy arrives, then swap to the real message without duplicating.
- **Pull to refresh** always forces a live fetch.

Not queued (they need the network to even start): voice notes (file upload),
creating posts/announcements, membership changes, wallet confirmations. Those
show an error and keep the user's input.

## How it works (`lib/net.ts`)

- `resolveWithCache(key, fetcher, { ttlMs, force })` — the standard list
  read. Fresh cache short-circuits, otherwise one network fetch refreshes the
  cache, and any transport failure falls back to the saved copy.
- `runOrQueue(type, payload, runner)` — the standard write. Runs now when
  online; queues into a persisted FIFO outbox when offline. Only transport
  failures queue — auth/validation errors still throw so bad writes surface.
- `flushMutations()` — replays the outbox FIFO on reconnect, app start, and
  sign-in. A permanently failing item is dropped after 5 tries so one poison
  pill can never wedge the queue. Never flushes while signed out.
- `clearOfflineData()` — wipes saved copies + outbox on sign-out so accounts
  never leak into each other.
- Handlers live in `lib/offlineHandlers.ts` (registered once from
  `app/_layout.tsx`) so `lib/net.ts` stays import-cycle free.
- Connectivity: `startConnectivityMonitor()` probes
  `/auth/v1/health` every 30s and on foregrounding; any request failure also
  flips the app offline immediately and schedules a re-probe.

### Freshness (TTL)

| List           | TTL   |
| -------------- | ----- |
| Feed           | 60s   |
| Announcements  | 60s   |
| Conversations  | 30s   |
| Thread         | 20s   |
| Notifications  | 60s   |
| My communities | 120s  |
| Bell badge     | 20s   |

Local deletes invalidate that list's copy; pull-to-refresh bypasses the TTL.

## "Load balancing", Supabase-style

There is no custom server to balance across — the app talks to Supabase
directly — so load handling is client-side, in `lib/net.ts`:

- **Dedupe:** `schedule(key, fn)` coalesces identical in-flight requests, so
  five mounts asking for the same list share one query.
- **Cap:** at most 4 concurrent Supabase requests (`MAX_CONCURRENT_REQUESTS`);
  the rest wait their turn instead of stampeding.
- **Backoff:** `withRetry()` retries transport failures only, with
  exponential backoff + jitter. Writes are never retried inline (a retried
  write can apply twice) — they go through the outbox instead.
- **Less work per screen:** TTL caches, 20–50 row page limits, and the bell's
  20s memo cut the request count before any balancing matters.

If the backend ever outgrows one Supabase project (read replicas, edge
caching), nothing in the app needs to change: `resolveWithCache` and
`schedule` already treat the backend as one endpoint.
