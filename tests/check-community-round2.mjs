// Guards community round 2: admin post edits, announcement pictures,
// @mention autocomplete + tagging, dropdown (not popup) menus, readable
// post errors, decrypted chat previews, envelope backfill, exit grace,
// fingerprint login, banner without shadow, and carousel peek.
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
const MIGRATION = 'supabase/migrations/2026111511_community_round2.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(MIGRATION, 'Admins can edit posts', 'admin post edits need an update policy');
  mustContain(MIGRATION, 'Authors and admins can add post media', 'admin picture edits need an insert policy');
  mustContain(MIGRATION, 'post media owner delete', 'picture removal needs a storage delete policy');
  mustContain(MIGRATION, 'announcement_media', 'announcement pictures need a table');
  mustContain(MIGRATION, 'announcement_id', 'announcement tags need a mention column');
  mustContain(MIGRATION, 'backfill_group_envelopes', 'keyless-era messages need a backfill RPC');
}

// ── Media sync ─────────────────────────────────────────────────────────
mustContain('lib/content.ts', 'addPostMedia', 'post edits add pictures');
mustContain('lib/content.ts', 'removePostMedia', 'post edits remove pictures');
mustContain('lib/content.ts', 'addAnnouncementMedia', 'announcements store pictures');
mustContain('lib/content.ts', 'removeAnnouncementMedia', 'announcement edits remove pictures');
mustContain('app/post/edit.tsx', 'handleRemoveKept', 'post editing must allow picture removal');
mustContain('app/announce/edit.tsx', 'handleRemoveKept', 'announcement editing must allow picture removal');

// ── Dropdown menus (not popups) ────────────────────────────────────────
mustExist('components/DropdownMenu.tsx');
for (const file of [
  'app/(tabs)/feed.tsx',
  'app/(tabs)/update.tsx',
  'app/post/[id].tsx',
  'app/announce/[id].tsx',
]) {
  mustContain(file, 'DropdownMenu', `${file} must use the dropdown menu`);
  mustContain(file, 'menuItems', `${file} must build dropdown items`);
}

// ── @mention autocomplete + tagging ────────────────────────────────────
mustExist('components/MentionInput.tsx');
for (const file of [
  'app/post/new.tsx',
  'app/post/edit.tsx',
  'app/announce/new.tsx',
  'app/announce/edit.tsx',
]) {
  mustContain(file, 'MentionInput', `${file} must offer @ tagging`);
}
mustContain('app/post/new.tsx', 'createMentions', 'new posts must notify tagged users');
mustContain('app/announce/new.tsx', 'announcementId', 'new announcements must tag by announcement');
mustContain('lib/mentions.ts', 'clearOwnMentions', 'edits must re-tag cleanly');
mustContain('supabase/functions/push-fanout/index.ts', 'announcement_id', 'tag notifications must cover announcements');

// ── Readable post errors ───────────────────────────────────────────────
mustContain('lib/supabase.ts', 'dbMessage', 'database errors need a readable extractor');
mustContain('lib/supabase.ts', 'isRlsError', 'blocked writes need RLS detection');
mustContain('app/post/new.tsx', 'dbMessage', 'post failures must show the real cause');
mustContain('app/post/new.tsx', 'member posting', 'member-posting blocks must name the fix');

// ── Decrypted previews + backfill ──────────────────────────────────────
mustContain('lib/chat.ts', 'resolvePreviews', 'chat lists must open the latest message locally');
mustContain('app/(tabs)/chat.tsx', 'resolvePreviews', 'the DM list must show plaintext previews');
mustContain('app/community/[id].tsx', 'resolvePreviews', 'group rows must show plaintext previews');
mustContain('lib/chat.ts', 'backfillOwnEnvelopes', 'senders must heal keyless-era messages');
mustContain('app/chat/[id].tsx', 'backfillOwnEnvelopes', 'opening a group must trigger the backfill');

// ── Banner + carousel ──────────────────────────────────────────────────
mustNotContain('components/EventBanner.tsx', 'rgba(0,0,0,0.45)', 'the banner photo must carry no shadow');
mustContain('components/EventBanner.tsx', 'caption', 'banner words must render below the photo');
mustContain('components/PhotoCarousel.tsx', 'snapToInterval', 'the carousel must peek the next photo');

// ── Fingerprint login ──────────────────────────────────────────────────
mustExist('lib/biometrics.ts');
mustContain('lib/biometrics.ts', 'unlockWithBiometric', 'login needs a biometric unlock path');
mustContain('app/(auth)/login.tsx', 'unlockWithBiometric', 'the login screen must offer biometrics');
mustContain('app/(auth)/login.tsx', 'fingerprint', 'the login screen must name fingerprint login');

// ── Suite wiring ───────────────────────────────────────────────────────
mustContain('package.json', 'check-community-round2', 'the round-2 check must run in npm test');

if (failures.length > 0) {
  console.error(`Community round-2 gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Community round-2 guards pass.');
