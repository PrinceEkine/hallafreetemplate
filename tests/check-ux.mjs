// Guards the core-journey UX pass: shared search + empty states, visible
// filter chips (the funnel marks the filter row), guided empty states with
// next-step actions, and the discover/join cross-links.
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

// ── Shared search + empty states on every core list ──────────────────
for (const file of [
  'app/(tabs)/feed.tsx',
  'app/(tabs)/update.tsx',
  'app/(tabs)/chat.tsx',
  'app/(tabs)/teams.tsx',
]) {
  mustContain(file, 'SearchField', `${file} must use the shared search field`);
  mustContain(file, 'EmptyState', `${file} must guide its empty states`);
}

// ── Visible filters (funnel stays as the filter-row marker) ──────────
for (const file of ['app/(tabs)/feed.tsx', 'app/(tabs)/teams.tsx']) {
  mustContain(file, 'funnel-outline', `${file} must keep the filter marker`);
  mustContain(
    file,
    'chipActive',
    `${file} must show tappable filter options`,
  );
}

// ── Newest-first ordering ────────────────────────────────────────────
mustContain(
  'lib/format.ts',
  'newestFirst',
  'feed-style lists share one newest-first sort',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'newestFirst(value.posts)',
  'home feed renders newest posts first',
);
mustContain(
  'app/(tabs)/update.tsx',
  'newestFirst(',
  'announcements render newest first',
);

// ── Guided next steps ────────────────────────────────────────────────
mustContain(
  'app/(tabs)/feed.tsx',
  'Discover communities',
  'an empty feed must point at joining',
);
mustContain(
  'app/(tabs)/chat.tsx',
  'Start a chat',
  'an empty chat list must offer a first chat',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'Create a group',
  'an empty teams list must offer creation',
);
mustContain(
  'app/(tabs)/update.tsx',
  'New announcement',
  'an empty announcements list must offer creation',
);
mustContain(
  'app/community/discover.tsx',
  'Join with invite code',
  'discover must surface the private-community path',
);
mustContain(
  'app/community/discover.tsx',
  'OfflineBanner',
  'discover must explain offline state',
);
mustContain(
  'app/community/join.tsx',
  'Browse public communities',
  'join must offer the public path',
);
mustContain(
  'app/community/join.tsx',
  "You're in",
  'a completed join must say so plainly',
);

// ── Back goes home from hub pages ────────────────────────────────────
for (const file of [
  'app/community/directory.tsx',
  'app/community/actions.tsx',
  'app/community/task.tsx',
  'app/community/media.tsx',
  'app/community/files.tsx',
  'app/community/approval.tsx',
  'app/community/project.tsx',
  'app/community/contact.tsx',
  'app/community/polls.tsx',
  'app/community/[id].tsx',
]) {
  mustContain(file, 'backTo="/feed"', `${file} back must land on home`);
}
mustContain(
  'components/ScreenHeader.tsx',
  'canGoBack',
  'the header must never back into a dead end',
);

// ── Suite wiring ─────────────────────────────────────────────────────
mustContain('package.json', 'check-ux', 'the UX check must run in npm test');

if (failures.length > 0) {
  console.error(`UX gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('UX guards pass.');
