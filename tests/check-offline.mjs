// Guards offline-first behaviour: the net layer (cache, outbox, load
// handling), the offline banner + handlers, the friendly notifications page,
// and cache-first reads on the core lists.
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

// ── Net layer ────────────────────────────────────────────────────────
mustExist('lib/net.ts');
mustContain('lib/net.ts', 'resolveWithCache', 'lists must read cache-first');
mustContain('lib/net.ts', 'runOrQueue', 'writes must queue while offline');
mustContain('lib/net.ts', 'enqueueMutation', 'the outbox must persist writes');
mustContain('lib/net.ts', 'flushMutations', 'the outbox must replay itself');
mustContain(
  'lib/net.ts',
  'registerMutationHandler',
  'replay must be wired without import cycles',
);
mustContain('lib/net.ts', 'MAX_CONCURRENT_REQUESTS', 'load must be capped');
mustContain('lib/net.ts', 'withRetry', 'reads must back off, not hammer');
mustContain('lib/net.ts', 'useOnline', 'screens must react to connectivity');
mustContain(
  'lib/net.ts',
  'clearOfflineData',
  'sign-out must drop saved copies and queued writes',
);
mustContain('lib/net.ts', 'CACHE_TTL', 'freshness windows must be explicit');

// ── Handlers + banner ────────────────────────────────────────────────
mustExist('lib/offlineHandlers.ts');
mustContain(
  'lib/offlineHandlers.ts',
  'registerOfflineHandlers',
  'the root layout must wire replay handlers once',
);
mustContain(
  'lib/offlineHandlers.ts',
  'send-group-message',
  'queued group sends must replay',
);
mustExist('components/OfflineBanner.tsx');
mustContain(
  'components/OfflineBanner.tsx',
  'usePendingCount',
  'the banner must show the outbox size',
);

// ── Notifications page ───────────────────────────────────────────────
mustContain(
  'app/notifications.tsx',
  'OfflineBanner',
  'notifications must explain offline state',
);
mustContain(
  'app/notifications.tsx',
  'resolveWithCache',
  'notifications must render from the saved copy',
);
mustContain(
  'app/notifications.tsx',
  'Yesterday',
  'notifications must group by day',
);
mustContain(
  'app/notifications.tsx',
  'Search notifications',
  'notifications must be searchable',
);
mustContain(
  'app/notifications.tsx',
  "runOrQueue('notification-read'",
  'opening a notification must work offline',
);

// ── Core lists ───────────────────────────────────────────────────────
for (const file of [
  'app/(tabs)/feed.tsx',
  'app/(tabs)/update.tsx',
  'app/(tabs)/chat.tsx',
]) {
  mustContain(file, 'resolveWithCache', `${file} must read cache-first`);
  mustContain(file, 'OfflineBanner', `${file} must show offline status`);
}
mustContain(
  'app/(tabs)/feed.tsx',
  "'like-set'",
  'likes must queue while offline',
);
mustContain(
  'app/chat/[id].tsx',
  'pending:',
  'the thread must show queued messages',
);
mustContain(
  'app/chat/[id].tsx',
  "'send-message'",
  'DM sends must queue while offline',
);
mustContain(
  'app/chat/[id].tsx',
  'writeCache(`messages:',
  'the thread must save what is on screen',
);
mustContain(
  'lib/communities.ts',
  "readCache<MyCommunity[]>('my-communities')",
  'community scoping must survive offline',
);

// ── Community + detail screens hold offline ────────────────────────
for (const file of [
  'app/community/[id].tsx',
  'app/community/directory.tsx',
  'app/community/media.tsx',
  'app/community/files.tsx',
  'app/community/actions.tsx',
  'app/community/contact.tsx',
  'app/community/polls.tsx',
  'app/community/project.tsx',
  'app/community/task.tsx',
  'app/community/approval.tsx',
  'app/member/[id].tsx',
  'app/post/[id].tsx',
  'app/event/[id].tsx',
  'app/group/[id].tsx',
  'app/wallet/index.tsx',
]) {
  mustContain(file, 'resolveWithCache', `${file} must read cache-first`);
  mustContain(file, 'OfflineBanner', `${file} must show offline status`);
}
for (const file of [
  'app/(tabs)/teams.tsx',
  'app/(tabs)/events.tsx',
  'app/(tabs)/update.tsx',
  'app/member/[id].tsx',
  'app/post/[id].tsx',
  'app/event/[id].tsx',
]) {
  mustContain(
    file,
    'useFocusEffect',
    `${file} must refresh when revisited`,
  );
}
mustContain(
  'app/(tabs)/events.tsx',
  'OfflineBanner',
  'events must show offline status',
);
mustContain(
  'app/post/[id].tsx',
  'invalidateCache(`post:',
  'deleted posts must not resurrect from cache',
);
mustContain(
  'app/member/[id].tsx',
  'invalidateCache(`member:',
  'deleted profiles must not resurrect from cache',
);

// ── Root wiring ──────────────────────────────────────────────────────
mustContain(
  'app/_layout.tsx',
  'startConnectivityMonitor',
  'the app must track connectivity',
);
mustContain(
  'app/_layout.tsx',
  'registerOfflineHandlers',
  'the app must register replay handlers',
);

// ── Suite wiring ─────────────────────────────────────────────────────
mustContain('package.json', 'check-offline', 'the offline check must run in npm test');

if (failures.length > 0) {
  console.error(`Offline gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Offline guards pass.');
