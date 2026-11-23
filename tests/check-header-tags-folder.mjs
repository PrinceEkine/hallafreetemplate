// Chat header avatar + custom member tags + folder name guards: thread
// headers show the peer picture beside the name (initial fallback);
// admins set a free-word tag per member shown on the profile and the
// directory; the new-folder card labels its name input.
// Run: node tests/check-header-tags-folder.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

// ── Chat header avatar ─────────────────────────────────────────
mustContain(
  'components/ScreenHeader.tsx',
  'ChatTitleCluster',
  'headers must render a picture beside a full-width name',
);
mustContain(
  'components/ScreenHeader.tsx',
  'headAvatarUrl',
  'headers need a photo prop for chat threads',
);
mustContain(
  'lib/chat.ts',
  'peerAvatar',
  'DM peer info must carry the avatar for the thread header',
);
mustContain(
  'app/chat/[id].tsx',
  'headAvatarUrl={peerAvatar}',
  'the thread header must show the peer picture',
);

// ── Custom member tags ─────────────────────────────────────────
const TAG_MIGRATION = 'supabase/migrations/2026112202_member_tag.sql';
mustExist(TAG_MIGRATION);
mustContain(
  TAG_MIGRATION,
  'add column if not exists tag',
  'memberships need a custom tag column',
);
mustContain(
  'lib/communityContent.ts',
  'setMemberTag',
  'tag writes need one admin-gated entry point',
);
mustContain(
  'lib/communityContent.ts',
  'Member tags need the latest database update',
  'stale backends must explain instead of failing raw',
);
mustContain(
  'app/member/[id].tsx',
  'ADD MEMBER TAG',
  'admins need a tag editor on the member profile',
);
mustContain(
  'app/member/[id].tsx',
  'Enter a tag name',
  'the tag editor must prompt for the word',
);
mustContain(
  'app/community/directory.tsx',
  'item.tag',
  'directory rows must show the custom tag',
);

// ── Folder name prompt ─────────────────────────────────────────
mustContain(
  'app/community/files.tsx',
  'FOLDER NAME',
  'folder creation must label its name input',
);
mustContain(
  'app/community/files.tsx',
  'Enter a name for the folder',
  'the name input must prompt for the folder name',
);

// ── Suite wiring ───────────────────────────────────────────────
mustContain(
  'package.json',
  'check-header-tags-folder',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Header-tags-folder gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Header-tags-folder guards pass.');
