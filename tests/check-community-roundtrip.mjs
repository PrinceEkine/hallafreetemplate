// Guards the community roundtrip: member posting, empty groups with later
// adds, photo carousels, post/announcement menus (admin edit/delete, staff
// copy/share/report), edited flags, admins-only announcements, and
// directory QR + name/phone add-member search.
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

function mustNotContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

// ── Schema ─────────────────────────────────────────────────────────────
const MIGRATION = 'supabase/migrations/2026111510_community_roundtrip.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'Members can create posts',
    'any community member must be able to post',
  );
  mustContain(
    MIGRATION,
    'create or replace function public.create_group',
    'group creation must be redefined for empty groups',
  );
  mustNotContain(
    MIGRATION,
    'Add at least one person',
    'admins must be able to create a group with no users',
  );
  mustContain(MIGRATION, 'updated_at', 'edited flags need a column');
  mustContain(
    MIGRATION,
    'admins_only',
    'announcements need the admins-only flag',
  );
  mustContain(
    MIGRATION,
    'content_reports',
    'staff reports need a table',
  );
  mustContain(
    MIGRATION,
    'admin_add_member_by_id',
    'name-search adds need a by-id RPC',
  );
  mustContain(
    MIGRATION,
    'search_users_to_add',
    'directory search needs a scoped lookup RPC',
  );
}

// ── Content library ────────────────────────────────────────────────────
mustExist('lib/content.ts');
mustContain('lib/content.ts', 'editPost', 'posts must be editable');
mustContain('lib/content.ts', 'deletePost', 'posts must be deletable');
mustContain(
  'lib/content.ts',
  'editAnnouncement',
  'announcements must be editable',
);
mustContain(
  'lib/content.ts',
  'deleteAnnouncement',
  'announcements must be deletable',
);
mustContain(
  'lib/content.ts',
  'reportContent',
  'staff must be able to report posts and announcements',
);
mustContain('lib/content.ts', 'isEdited', 'edited flags need one rule');

// ── Edit screens ───────────────────────────────────────────────────────
mustExist('app/post/edit.tsx');
mustExist('app/announce/edit.tsx');

// ── 3-dot menus ────────────────────────────────────────────────────────
mustContain(
  'app/(tabs)/feed.tsx',
  'openPostMenu',
  'feed posts need the admin/staff menu',
);
mustContain(
  'app/post/[id].tsx',
  'menuItems',
  'post detail needs the admin/staff menu',
);
mustContain(
  'app/(tabs)/update.tsx',
  'openMenu',
  'announcements need the admin/staff menu',
);
mustContain(
  'app/announce/[id].tsx',
  'menuItems',
  'announcement detail needs the admin/staff menu',
);

// ── Carousels + edited flags ───────────────────────────────────────────
mustExist('components/PhotoCarousel.tsx');
mustContain(
  'app/(tabs)/feed.tsx',
  'PhotoCarousel',
  'multi-photo posts must use a carousel, not a grid',
);
mustContain(
  'app/post/[id].tsx',
  'PhotoCarousel',
  'post detail must use the same carousel',
);
mustContain(
  'app/(tabs)/feed.tsx',
  'edited',
  'edited posts must be marked',
);
mustContain(
  'app/(tabs)/update.tsx',
  'EDITED',
  'edited announcements must be marked',
);

// ── Admins-only announcements ──────────────────────────────────────────
mustContain(
  'app/announce/new.tsx',
  'VISIBLE TO ADMINS ONLY',
  'new announcements need the admins-only toggle',
);
mustContain(
  'app/announce/edit.tsx',
  'VISIBLE TO ADMINS ONLY',
  'editing must keep the admins-only toggle',
);
mustContain(
  'app/(tabs)/update.tsx',
  'ADMINS ONLY',
  'admins-only announcements must be tagged',
);

// ── Groups: member fetch + empty create + later adds ───────────────────
mustContain(
  'app/chat/group-new.tsx',
  'listCommunityMembers',
  'group creation must fetch the community roster directly',
);
mustContain(
  'app/group/[id].tsx',
  'addGroupMembers',
  'admins must add members to a group later',
);
mustContain(
  'lib/chat.ts',
  'addGroupMembers',
  'group member adds need library support',
);

// ── Events: rename + order + short dash ────────────────────────────────
mustContain(
  'app/(tabs)/events.tsx',
  'TO DO LIST',
  'Personal must read as To Do List',
);
mustContain(
  'app/(tabs)/events.tsx',
  'tabDash',
  'the tab indicator must be a short dash',
);

// ── Directory: QR + email/phone invites ────────────────────────────────
mustContain(
  'app/community/directory.tsx',
  'handleInviteByEmail',
  'admins invite by email address',
);
mustContain(
  'app/community/directory.tsx',
  'Show QR code',
  'adding members needs the QR code',
);
mustContain(
  'app/community/directory.tsx',
  'handleInviteByPhone',
  'admins invite by phone number',
);

// ── Suite wiring ───────────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-community-roundtrip',
  'the roundtrip check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Community roundtrip gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Community roundtrip guards pass.');
