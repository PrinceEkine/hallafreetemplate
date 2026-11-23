// Guards the group profile: tapping a group title opens its info screen
// with icon, notification mute, and member list. Muting stops message
// notifications for that conversation.
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

const MIGRATION = 'supabase/migrations/2026111509_group_mute.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'muted',
    'participants must store the mute flag',
  );
}

mustExist('app/group/[id].tsx');
mustContain(
  'lib/chat.ts',
  'getGroupProfile',
  'the app needs a group profile reader',
);
mustContain(
  'lib/chat.ts',
  'setConversationMuted',
  'the app needs a mute writer',
);
mustContain(
  'app/chat/[id].tsx',
  '/group/[id]',
  'tapping the group title must open its profile',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "'muted', false",
  'fanout must skip muted members',
);

if (failures.length > 0) {
  console.error(`Group profile gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Group profile guards pass.');
