// Batch B + work-email guards: picker-only dates, multi-assign tasks,
// search in every module, member profile edits, rules, contact email,
// media uploads, group profiles, sideways feed, minimizable rooms,
// WhatsApp-style calls, LinkedIn work-email join.
// Run: node tests/check-batch-b.mjs
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

// -- Picker-only dates ----------------------------------------------------
mustLack(
  'app/community/task-new.tsx',
  'TYPE THE DATE',
  'due dates pick from a calendar, never typed',
);
mustContain(
  'app/forms/new.tsx',
  'PICK DATE',
  'form dates pick from a calendar button',
);
mustLack(
  'app/forms/new.tsx',
  'maskDateInput',
  'no typed date masks remain in forms',
);

// -- Multi-assign tasks -----------------------------------------------------
const TASK_MIGRATION = 'supabase/migrations/2026112211_task_assignees.sql';
mustExist(TASK_MIGRATION);
mustContain(
  TASK_MIGRATION,
  'create table if not exists public.task_assignees',
  'extra assignees need their own table',
);
mustContain(
  'lib/communityContent.ts',
  'assigneeIds: string[]',
  'tasks carry every assignee',
);
mustContain(
  'app/community/task-assign.tsx',
  'setPendingAssignees',
  'the directory hands back a list',
);
mustContain(
  'app/community/task-new.tsx',
  'assignee_ids',
  'new tasks save every assignee',
);

// -- Search in every module ----------------------------------------------------
const SEARCHES = [
  ['app/community/actions.tsx', 'Search meetings'],
  ['app/community/task.tsx', 'Search tasks'],
  ['app/forms/index.tsx', 'Search forms'],
  ['app/community/media.tsx', 'Search media'],
  ['app/community/files.tsx', 'Search files'],
  ['app/community/approval.tsx', 'Search requests'],
  ['app/community/polls.tsx', 'Search polls'],
  ['app/community/project.tsx', 'Search projects'],
  ['app/community/contact.tsx', 'Search contacts'],
];
for (const [file, placeholder] of SEARCHES) {
  mustContain(file, placeholder, `${file} needs list search`);
}

// -- Community fields --------------------------------------------------------------
const FIELDS_MIGRATION = 'supabase/migrations/2026112212_community_fields.sql';
mustExist(FIELDS_MIGRATION);
mustContain(
  FIELDS_MIGRATION,
  'add column if not exists email text',
  'communities need a contact email',
);
mustContain(
  FIELDS_MIGRATION,
  'add column if not exists rules text',
  'communities need rules',
);
mustContain(
  'lib/communityContent.ts',
  'update_community_profile',
  'members save About and Website through a guarded RPC',
);
mustContain(
  'app/community/edit.tsx',
  'Members can refresh the About and Website.',
  'members get a limited edit form',
);
mustContain(
  'app/community/edit.tsx',
  'COMMUNITY RULES (OPTIONAL, 1000 MAX)',
  'admins type rules with a visible cap',
);
mustContain(
  'app/community/[id].tsx',
  'COMMUNITY RULES',
  'rules show on the community profile',
);
mustContain(
  'app/community/contact.tsx',
  'Send us an email',
  'contact opens the mail app with the community address',
);
mustLack(
  'app/community/contact.tsx',
  'Invite someone',
  'the old invite button is replaced',
);

// -- Media uploads ------------------------------------------------------------------
mustContain(
  'app/community/media.tsx',
  'Upload photo or video',
  'admins upload straight to the gallery',
);
mustContain(
  'app/community/media.tsx',
  'DESCRIPTION (OPTIONAL)',
  'uploads carry a description',
);

// -- Group profiles -------------------------------------------------------------------
const GROUP_MIGRATION = 'supabase/migrations/2026112213_group_profile.sql';
mustExist(GROUP_MIGRATION);
mustContain(
  GROUP_MIGRATION,
  'group-avatars',
  'group icons need their own bucket',
);
mustContain(
  'lib/chat.ts',
  'setGroupProfile',
  'icon and about save through one helper',
);
mustContain(
  'app/group/[id].tsx',
  'CHANGE ICON',
  'admins can change the group icon',
);
mustContain(
  'app/group/[id].tsx',
  'ADD ABOUT',
  'groups gain an about line',
);

// -- Upwards-scrolling feed ---------------------------------------------------------------
mustContain(
  'app/(tabs)/feed.tsx',
  'contentContainerStyle={styles.list}',
  'home scrolls upwards as one vertical list',
);
mustLack(
  'app/(tabs)/feed.tsx',
  'pagingEnabled',
  'home must not page sideways',
);

// -- Minimizable rooms --------------------------------------------------------------------
mustExist('lib/minimizedCall.ts');
mustExist('components/MinimizedCallBar.tsx');
mustContain(
  'app/call/[id].tsx',
  'Minimize meeting',
  'rooms minimize from the call screen',
);
mustContain(
  'app/call/[id].tsx',
  'isMinimizedRoom(id)',
  'minimized rooms skip teardown on unmount',
);
mustContain(
  'app/_layout.tsx',
  'MinimizedCallBar',
  'the floating bar lives at the root',
);
mustContain(
  'app/call/[id].tsx',
  'reattach',
  'returning must rebind instead of joining twice',
);
mustContain(
  'app/call/[id].tsx',
  'joinRc !== -17',
  'a rejected duplicate join must not fail the call',
);

// -- WhatsApp-style calls -------------------------------------------------------------------
mustContain(
  'app/call/[id].tsx',
  'topMid',
  'the call header balances title and minimize',
);
mustContain(
  'app/call/[id].tsx',
  'width: 64',
  'call controls grow to finger-friendly size',
);

// -- Work-email join ----------------------------------------------------------------------------
const EMAIL_MIGRATION = 'supabase/migrations/2026112214_work_email_join.sql';
mustExist(EMAIL_MIGRATION);
mustContain(
  EMAIL_MIGRATION,
  'join_verified_community',
  'verified staff join through a guarded RPC',
);
mustContain(
  'lib/communityContent.ts',
  'findCommunityByEmailDomain',
  'work emails resolve to their community',
);
mustExist('app/community/join-email.tsx');
mustContain(
  'app/community/join-email.tsx',
  'Verify & join',
  'the code step joins directly',
);
mustContain(
  'app/community/edit.tsx',
  'WORK EMAIL DOMAIN (OPTIONAL)',
  'admins approve the staff domain',
);
mustContain(
  'app/community/join.tsx',
  'Join with a work email',
  'the join screen links the email path',
);

// -- Search spacing + admin toggle + offline latch -------------------------------
mustContain(
  'app/community/polls.tsx',
  'paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8',
  'poll search must clear the header',
);
mustContain(
  'app/community/files.tsx',
  'paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8',
  'file search must clear the header',
);
mustContain(
  'app/community/approval.tsx',
  'paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8',
  'request search must clear the header',
);
mustContain(
  'app/community/directory.tsx',
  'REMOVE ADMIN',
  'the admin toggle must name its action',
);
mustContain(
  'app/community/directory.tsx',
  'MAKE ADMIN',
  'granting rights must name its action',
);
mustContain(
  'lib/net.ts',
  'reportNetworkSuccess',
  'successful requests must clear the offline flag',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-batch-b',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Batch-B gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Batch-B guards pass.');
