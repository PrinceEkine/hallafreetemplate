// Guards persistent community polls: admin-only creation, one vote per
// member, results history in the side nav, and new-poll notifications.
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

const MIGRATION = 'supabase/migrations/2026111503_polls.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'community_polls',
    'the polls table must exist',
  );
  mustContain(
    MIGRATION,
    'poll_votes',
    'votes must persist per member',
  );
  mustContain(
    MIGRATION,
    'is_community_admin',
    'poll creation must verify adminship server-side',
  );
  mustContain(
    MIGRATION,
    'trg_poll_fanout',
    'new polls must fan out notifications',
  );
}

mustContain(
  'lib/communityContent.ts',
  'listPolls',
  'the app needs a listPolls reader',
);
mustContain(
  'lib/communityContent.ts',
  'createPoll',
  'the app needs a createPoll writer',
);
mustContain(
  'lib/communityContent.ts',
  'votePoll',
  'the app needs a votePoll writer',
);
mustContain(
  'lib/communityContent.ts',
  'closePoll',
  'admins need to close polls',
);
mustContain(
  'lib/communityModules.ts',
  "'/community/polls'",
  'polls must be a side-nav module',
);
mustContain(
  'components/DrawerMenu.tsx',
  '/community/polls',
  'the drawer must link to polls',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "'poll'",
  'fanout must notify members of new polls',
);
mustContain(
  'app/notifications.tsx',
  "'poll'",
  'tapping a poll notification must open the poll',
);
mustExist('app/community/polls.tsx');
mustExist('app/community/poll/[id].tsx');

if (failures.length > 0) {
  console.error(`Poll gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Poll guards pass.');
