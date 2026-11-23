// Chat/feed batch guards: the composer lands exactly on the keyboard,
// home search sits above the filter row, posts share into private chats
// over the encrypted path, videos preview inline, and the folder input
// prompts for a name.
// Run: node tests/check-chat-feed-batch.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

function mustContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  if (!read(file).includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

// ── Composer exactly on the keyboard ─────────────────────────────────
mustContain(
  'lib/keyboard.ts',
  'height - shrunk',
  'a partial resize must pad only the uncovered remainder',
);

// ── Search above the filter row ──────────────────────────────────────
{
  const feed = read('app/(tabs)/feed.tsx');
  const searchAt = feed.indexOf('styles.searchRow');
  const chipsAt = feed.indexOf('styles.chips');
  if (searchAt === -1 || chipsAt === -1 || searchAt > chipsAt) {
    failures.push(
      'app/(tabs)/feed.tsx must render the search row above the filter row',
    );
  }
}

// ── Share post into private chat ─────────────────────────────────────
mustContain(
  'app/(tabs)/feed.tsx',
  'Send to chat',
  'posts offer a private-chat share action',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'openShareSheet',
  'sharing picks a chat first',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'Shared from Home',
  'shared posts carry their source',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'encryptForPeer',
  'shares travel the encrypted DM path',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'getDmPeerInfo',
  'shares need the peer key first',
);

// ── Inline video previews ────────────────────────────────────────────
mustContain(
  'components/MediaBubble.tsx',
  'VideoPreview',
  'videos preview their first frame in the chat',
);
mustContain(
  'components/MediaBubble.tsx',
  'muted',
  'previews never play sound on their own',
);

// ── Folder name prompt ───────────────────────────────────────────────
mustContain(
  'app/community/files.tsx',
  'Enter a name for the folder',
  'the folder input must prompt for a name',
);

// ── Suite wiring ─────────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-chat-feed-batch',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Chat/feed-batch gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat/feed-batch guards pass.');
