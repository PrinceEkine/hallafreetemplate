// LinkedIn-pattern invite guards: admins invite by name from the
// directory, the invitee accepts from Notifications and joins
// directly. No instant add-by-name remains.
// Run: node tests/check-community-invites.mjs
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

function mustLack(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

// -- Invite storage + accept RPC --------------------------------------
const MIGRATION = 'supabase/migrations/2026112209_member_invites.sql';
mustExist(MIGRATION);
mustContain(
  MIGRATION,
  'create table if not exists public.member_invites',
  'invites need their own table',
);
mustContain(
  MIGRATION,
  'member_invites_pending_once',
  'one pending invite per person per community',
);
mustContain(
  MIGRATION,
  'accept_community_invite',
  'accepting must run through a guarded RPC',
);
mustContain(
  MIGRATION,
  'Admins can send invite notices',
  'admins must be able to write the invite notification',
);

// -- Library --------------------------------------------------------------
mustContain(
  'lib/communityContent.ts',
  'sendCommunityInvite',
  'directory invites go through one sender',
);
mustContain(
  'lib/communityContent.ts',
  'acceptCommunityInvite',
  'accepting joins the community directly',
);
mustContain(
  'lib/communityContent.ts',
  'declineCommunityInvite',
  'invitees can decline',
);
mustContain(
  'lib/communityContent.ts',
  'listMyPendingInvites',
  'notification cards need pending state',
);
mustContain(
  'lib/communityContent.ts',
  'findInviteUserByEmail',
  'email invites resolve registered users',
);
mustContain(
  'lib/communityContent.ts',
  'findInviteUserByPhone',
  'phone invites resolve registered users',
);
mustContain(
  'supabase/migrations/2026112215_invite_lookup.sql',
  'find_invite_user_by_email',
  'email lookup needs a guarded RPC',
);

// -- Directory: invite via email/phone ------------------------------------
mustContain(
  'app/community/directory.tsx',
  'OR INVITE VIA EMAIL',
  'admins invite by email address',
);
mustContain(
  'app/community/directory.tsx',
  'Invite by SMS',
  'admins invite by phone number',
);
mustContain(
  'app/community/directory.tsx',
  'mailto:',
  'email invites open the mail app with the link',
);
mustLack(
  'app/community/directory.tsx',
  'OR INVITE BY NAME',
  'name search is replaced by email/phone',
);
mustLack(
  'app/community/directory.tsx',
  'handleInviteCandidate',
  'no candidate flow remains',
);
mustLack(
  'app/community/directory.tsx',
  'adminAddMemberById',
  'directory must not bypass the invite flow',
);

// -- Notifications: accept inline ----------------------------------------------
mustContain(
  'app/notifications.tsx',
  'community_invite',
  'invite cards route to the community',
);
mustContain(
  'app/notifications.tsx',
  'handleAcceptInvite',
  'invites accept inline like LinkedIn',
);
mustContain(
  'app/notifications.tsx',
  'handleDeclineInvite',
  'invites decline inline',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-community-invites',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Invite gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Invite guards pass.');
