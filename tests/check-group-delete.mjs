// Guards admin-only community group deletion (Teams long-press > Delete).
// Deletion runs through a definer RPC that verifies community adminship
// server-side; the client only exposes the affordance to admins.
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

const MIGRATION = 'supabase/migrations/2026111501_delete_group.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'delete_group_chat',
    'the RPC must exist for group deletion',
  );
  mustContain(
    MIGRATION,
    'is_community_admin',
    'deletion must verify community adminship server-side',
  );
  mustContain(
    MIGRATION,
    'to authenticated',
    'the RPC must be executable by signed-in users',
  );
}

mustContain(
  'lib/chat.ts',
  'deleteGroupChat',
  'the app needs a deleteGroupChat wrapper',
);
mustContain(
  'lib/chat.ts',
  'delete_group_chat',
  'the wrapper must call the delete_group_chat RPC',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'onLongPress',
  'groups must expose delete via long-press',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'deleteGroupChat',
  'the Teams screen must call deleteGroupChat',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'Delete group',
  'deletion must ask for confirmation first',
);
mustContain(
  'app/(tabs)/teams.tsx',
  'authenticateAsync',
  'deletion must pass the device lock first',
);

if (failures.length > 0) {
  console.error(`Group delete gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Group delete guards pass.');
