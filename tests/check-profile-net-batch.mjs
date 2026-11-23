// Member profile + wallpaper + low-network guards: profiles never name the
// communities someone is in; any viewer sees photo, name, membership tag,
// contacts, disappearing-message setting, create-group shortcut, chat and
// call history, while admins additionally get make/remove admin and the
// support-tag toggle. Chat doodles tile small instead of stretching huge,
// and slow-network reads/writes fall back instead of hanging.
// Run: node tests/check-profile-net-batch.mjs
import { existsSync, readFileSync, statSync } from 'node:fs';
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

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

// Doodle assets stay small: at 1px=1pt tiling, a 1920px canvas renders
// each envelope hundreds of points wide. Shrunk tiles keep them subtle.
function mustBeSlim(file, maxBytes, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const size = statSync(join(ROOT, file)).size;
  if (size > maxBytes) {
    failures.push(`${file} is ${size} bytes (must be under ${maxBytes}): ${why}`);
  }
}

// ── Wallpaper: small tiled doodles ──────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  "? 'cover' : 'repeat'",
  'pattern wallpapers must tile small instead of stretching huge',
);
mustContain(
  'app/chat/wallpaper.tsx',
  'resizeMode="repeat"',
  'the picker must preview patterns at their true tiled scale',
);
for (const art of [
  'assets/chat/default-wallpaper.png',
  'assets/chat/pattern-dark.png',
  'assets/chat/pattern-sage.png',
  'assets/chat/pattern-sky.png',
]) {
  mustBeSlim(art, 300_000, 'doodle tiles must ship shrunk, not full-screen size');
}

// ── Profile: private communities, shared contacts ───────────────
mustLack(
  'app/member/[id].tsx',
  'SHARED COMMUNITIES',
  'profiles must never name the communities someone is in',
);
mustContain(
  'app/member/[id].tsx',
  'Disappearing messages',
  'viewers set the DM timer from the profile',
);
mustContain(
  'app/member/[id].tsx',
  'setDisappearSeconds',
  'the profile timer writes through the same chat setting',
);
mustContain(
  'lib/chat.ts',
  'findDm',
  'the profile needs the existing DM without creating one',
);
mustContain(
  'app/member/[id].tsx',
  "'/chat/group-new'",
  'profiles offer a create-group shortcut',
);
mustContain(
  'app/chat/group-new.tsx',
  'members',
  'group creation accepts a preselected member from the profile',
);
mustContain(
  'app/member/[id].tsx',
  'SUPPORT TAG',
  'admins add or remove the support tag from the profile',
);
mustContain(
  'lib/communityContent.ts',
  'setMemberSupportTag',
  'the tag toggle needs admin-gated library support',
);
mustLack(
  'app/member/[id].tsx',
  'countUserCommunityGroups',
  'the group count is not part of the profile',
);

// ── Profile sharing backend ─────────────────────────────────────
const MIGRATION = 'supabase/migrations/2026112103_profile_contact_sharing.sql';
mustExist(MIGRATION);
mustContain(
  MIGRATION,
  'profile_contacts',
  'contacts must open to shared-community members',
);
mustContain(MIGRATION, 'email', 'profiles need a stored email to show');
mustContain(
  MIGRATION,
  'call_logs',
  'call history must open to shared-community members',
);
mustContain(
  'lib/supabase.ts',
  'syncMyContactEmail',
  'sign-in keeps the stored email fresh',
);
mustContain(
  'app/_layout.tsx',
  'syncMyContactEmail',
  'the email sync runs on sign-in and warm start',
);

// ── Low network: time out, then fall back ───────────────────────
mustContain(
  'lib/net.ts',
  'NETWORK_TIMEOUT_MS',
  'reads and writes share one slow-network backstop',
);
mustContain(
  'lib/net.ts',
  'withTimeout',
  'the backstop needs a reusable timeout helper',
);
mustContain(
  'lib/chat.ts',
  'withTimeout',
  'chat-list previews must not hang the lists on slow networks',
);
mustContain(
  'app/chat/[id].tsx',
  'withTimeout',
  'sends must fall back to known keys instead of hanging',
);

// ── Suite wiring ────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-profile-net-batch',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Profile-net gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Profile-net guards pass.');
