// Guards community exit ownership transfer: when the owner exits and active
// members remain, ownership moves to another admin (else the longest-standing
// member) instead of blocking or deleting. Delete happens only when the last
// active member exits.
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

const MIGRATION = 'supabase/migrations/2026111502_community_exit_transfer.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'exit_community',
    'the RPC must exist for community exit',
  );
  mustContain(
    MIGRATION,
    "'transferred'",
    'owner exit with members left must return transferred',
  );
  mustContain(
    MIGRATION,
    'set owner_id',
    'owner exit must hand owner_id to a successor',
  );
  mustContain(
    MIGRATION,
    "role = 'admin'",
    'the successor search must prefer another admin',
  );
  mustContain(
    MIGRATION,
    "'deleted'",
    'the last member out must still delete the community',
  );
  mustContain(
    MIGRATION,
    'to authenticated',
    'the RPC must be executable by signed-in users',
  );
}

mustContain(
  'lib/communityContent.ts',
  "'transferred'",
  'the exitCommunity wrapper must accept the transferred result',
);
mustContain(
  'components/DrawerMenu.tsx',
  'transferred',
  'drawer exit must handle the ownership-transferred result',
);
mustContain(
  'app/community/[id].tsx',
  'transferred',
  'the community screen must handle the ownership-transferred result',
);

const GRACE_MIGRATION = 'supabase/migrations/2026111511_community_round2.sql';
mustExist(GRACE_MIGRATION);
if (existsSync(join(ROOT, GRACE_MIGRATION))) {
  mustContain(
    GRACE_MIGRATION,
    "'scheduled'",
    'the last member out must schedule deletion instead of deleting',
  );
  mustContain(
    GRACE_MIGRATION,
    'scheduled_delete_at',
    'the grace window needs a timestamp',
  );
  mustContain(
    GRACE_MIGRATION,
    'purge_expired_communities',
    'expired communities need a purge path',
  );
  mustContain(
    GRACE_MIGRATION,
    'cancel_scheduled_delete',
    'a rejoin must cancel the scheduled deletion',
  );
}
mustContain(
  'lib/communityContent.ts',
  "'scheduled'",
  'the exitCommunity wrapper must accept the scheduled result',
);
mustContain(
  'app/community/[id].tsx',
  'scheduled',
  'the community screen must explain the 24-hour grace',
);
mustContain(
  'components/DrawerMenu.tsx',
  'scheduled',
  'drawer exit must handle the scheduled result',
);
mustContain(
  'app/community/[id].tsx',
  'Export info',
  'members need an info export before the grace expires',
);

if (failures.length > 0) {
  console.error(`Community exit gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Community exit guards pass.');
