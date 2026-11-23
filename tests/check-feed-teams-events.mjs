// Teams/feed/events list guards: the Teams rows show the decrypted latest
// message (never the raw redacted label), new posts land on top of Home
// without a manual refresh, post photos render as uniform cropped tiles
// with a fullscreen viewer, and the events calendar down-button opens a
// full month calendar below the strip.
// Run: node tests/check-feed-teams-events.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function read(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

function mustContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  if (!read(file).includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

function mustLack(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  if (read(file).includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

// ── Teams: decrypted latest message ─────────────────────────────
mustContain(
  'lib/chat.ts',
  'export const REDACTED_PREVIEW',
  'screens need the redacted label to map it to a friendly fallback',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'resolvePreviews',
  'team rows must decrypt the latest message like every other chat list',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'REDACTED_PREVIEW',
  'a row that cannot be decrypted must fall back, never show the raw label',
);

// ── Home: new posts on top without a manual refresh ─────────────
mustContain(
  'app/post/new.tsx',
  'invalidateCache(`feed:${communityId}`)',
  'creating a post must bust the feed cache so it lands on top',
);
mustContain(
  'app/post/new.tsx',
  'invalidateCache(`announcements:${communityId}`)',
  'posting as an announcement must bust the announcements cache too',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'useFocusEffect',
  'home must reload when it regains focus so new posts are on top',
);

// ── Post photos: uniform tiles, full viewer ─────────────────────
mustContain(
  'components/PhotoCarousel.tsx',
  'resizeMode="cover"',
  'feed tiles crop to one uniform size',
);
mustContain(
  'components/PhotoCarousel.tsx',
  'resizeMode="contain"',
  'the fullscreen viewer still shows the whole photo uncropped',
);
mustLack(
  'components/PhotoCarousel.tsx',
  'aspectRatio',
  'tiles share one fixed size instead of per-photo sizing',
);

// ── Events: down-button opens a full month calendar below ───
mustContain(
  'app/(tabs)/events.tsx',
  'monthCard',
  'the down button must open a full month calendar below the strip',
);
mustContain(
  'app/(tabs)/events.tsx',
  'moveMonth',
  'the month calendar must page between months',
);
mustLack(
  'app/(tabs)/events.tsx',
  'expandedWeeks',
  'the strip must not unfold into extra week rows anymore',
);

// ── Suite wiring ────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-feed-teams-events',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Feed-teams-events gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Feed-teams-events guards pass.');
