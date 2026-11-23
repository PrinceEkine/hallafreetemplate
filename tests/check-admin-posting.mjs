// Posting gates: announcements stay admin-only, homepage posts are open to
// every community member, and admin promotion must be gated to community
// admins. Create screens must post into the already selected community
// instead of showing a community picker.
// Run: npm test
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
};

// 1. The announce button is admin-only; the post button is member-open.
check(
  'app/(tabs)/update.tsx gates the announce button on admin',
  read('app/(tabs)/update.tsx').includes('isCommunityAdmin'),
);
check(
  'app/(tabs)/feed.tsx opens the post button to members',
  read('app/(tabs)/feed.tsx').includes('isCommunityMember'),
);

// 2a. Announcements: admin-only + selected community (no picker).
{
  const file = 'app/announce/new.tsx';
  const content = read(file);
  check(`${file} enforces admin`, content.includes('isCommunityAdmin'));
  check(
    `${file} tells non-admins it is admin-only`,
    /only community admins/i.test(content),
  );
  check(
    `${file} posts into the selected community`,
    content.includes('resolveSelectedCommunityId'),
  );
  check(`${file} has no community picker`, !content.includes('options.map'));
}
check(
  'app/announce/new.tsx carries pictures',
  read('app/announce/new.tsx').includes('uploadToBucket'),
);

// 2b. Posts: any member + selected community (no picker).
{
  const file = 'app/post/new.tsx';
  const content = read(file);
  check(
    `${file} enforces membership`,
    content.includes('isCommunityMember'),
  );
  check(
    `${file} posts into the selected community`,
    content.includes('resolveSelectedCommunityId'),
  );
  check(`${file} has no community picker`, !content.includes('options.map'));
}
check(
  'app/post/new.tsx still supports pictures',
  read('app/post/new.tsx').includes('uploadToBucket'),
);

// 3. Only admins can promote/demote other members.
check(
  'lib/communityContent.ts exposes setMemberRole',
  /export async function setMemberRole/.test(read('lib/communityContent.ts')),
);
check(
  'lib/communityContent.ts gates setMemberRole on admin',
  read('lib/communityContent.ts').includes('Only admins can change member roles.'),
);
check(
  'app/community/directory.tsx offers admin promotion',
  read('app/community/directory.tsx').includes('setMemberRole'),
);

// 4. Database lets members post and constrains self joins to role member.
const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');
check(
  'a migration makes post inserts member-open',
  /create policy "Members can create posts"\s+on public\.posts for insert[\s\S]*?is_community_member\(community_id\)/.test(
    migrations,
  ),
);
check(
  'the admin-only post-insert policy is removed',
  migrations.includes('drop policy if exists "Admins can create posts"'),
);
check(
  'self joins are constrained to role member',
  /community_members[\s\S]*?role = 'member'/.test(migrations),
);

if (failures.length > 0) {
  console.error(`Posting gate gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Posting gates pass.');
