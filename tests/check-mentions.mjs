// Guards @mentions in post comments and group chats: tagging a member by
// name notifies them in-app and by push. Detection runs on plaintext at
// send time because chat bodies stay encrypted.
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

const MIGRATION = 'supabase/migrations/2026111508_mentions.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'mentions',
    'mentions must persist for fanout',
  );
  mustContain(
    MIGRATION,
    'trg_mention_fanout',
    'mentions must fan out notifications',
  );
}

mustExist('lib/mentions.ts');
mustContain(
  'lib/mentions.ts',
  'resolveMentions',
  'mention tokens must resolve to member ids',
);
mustContain(
  'lib/mentions.ts',
  'createMentions',
  'resolved mentions must be stored',
);
mustContain(
  'app/post/[id].tsx',
  'resolveMentions',
  'comments must detect mentions',
);
mustContain(
  'app/chat/[id].tsx',
  'resolveMentions',
  'group chat must detect mentions',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "'mention'",
  'fanout must notify mentioned members',
);

if (failures.length > 0) {
  console.error(`Mention gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Mention guards pass.');
