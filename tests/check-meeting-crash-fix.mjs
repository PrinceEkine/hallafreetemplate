// Meeting crash + welcome-trap + deletion-detail guards: every realtime
// call-signal subscription opens its own channel topic (Supabase reuses
// one channel object per topic and throws when a second subscriber adds
// postgres_changes callbacks to an already-subscribed one); the welcome
// screen bounces signed-in users home when it regains focus; the delete
// screen shows the server error code/detail/hint instead of a generic
// message; and the server wipe detaches surviving owned storage rows
// before deleting the auth user (storage.objects.owner has no cascade).
// Run: node tests/check-meeting-crash-fix.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustLackFile(file) {
  if (existsSync(join(ROOT, file))) {
    failures.push(`retired file still present: ${file}`);
  }
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

// ── One realtime channel per subscription ──────────────────────
mustContain(
  'lib/calls.ts',
  'openCallChannel',
  'call-signal subscriptions must open uniquely-named channels',
);
mustContain(
  'lib/calls.ts',
  'realtimeChannelSeq',
  'channel names must be unique per subscription',
);
mustContain(
  'lib/calls.ts',
  "openCallChannel('all-call-signals')",
  'the global call listener must not use a fixed shared topic',
);
mustContain(
  'lib/calls.ts',
  'openCallChannel(`room-calls:',
  'room listeners must not use a fixed shared topic',
);
mustContain(
  'lib/calls.ts',
  'openCallChannel(`calls:',
  'chat-call listeners must not use a fixed shared topic',
);
mustLack(
  'lib/calls.ts',
  ".channel('all-call-signals')",
  'a fixed all-call-signals topic crashes the second subscriber',
);
mustLack(
  'lib/calls.ts',
  '.channel(`room-calls:',
  'a fixed room topic crashes the second subscriber',
);
mustLack(
  'lib/calls.ts',
  '.channel(`calls:',
  'a fixed chat-call topic crashes the call screen over its thread',
);

// ── Instrumentation retired ────────────────────────────────────
mustLackFile('components/CrashCatcher.tsx');

// ── Welcome bounces signed-in users home ───────────────────────
mustContain(
  'app/index.tsx',
  'useFocusEffect',
  'welcome must re-check the session when it regains focus',
);
mustContain(
  'app/index.tsx',
  'Bounce them home',
  'a signed-in user backing onto welcome must land home, not signup',
);
mustContain(
  'app/index.tsx',
  'one bootstrap, no race',
  'the focus bounce must wait out the mount bootstrap',
);

// ── Deletion shows the real server error ───────────────────────
mustContain(
  'lib/account.ts',
  'deletionErrorMessage',
  'deletion failures need one formatting entry point',
);
mustContain(
  'lib/account.ts',
  'extra.details',
  'the Postgres detail names the blocking constraint',
);
mustContain(
  'lib/account.ts',
  'extra.hint',
  'the Postgres hint must survive to the screen',
);
mustContain(
  'app/profile/delete.tsx',
  'deletionErrorMessage',
  'the delete screen must show the detailed server error',
);
mustLack(
  'app/profile/delete.tsx',
  "err instanceof Error ? err.message : 'Could not delete.'",
  'the generic deletion fallback hides the fixable cause',
);

// ── Server wipe detaches surviving owned files ─────────────────
const DETACH_MIGRATION =
  'supabase/migrations/2026112201_account_delete_storage_detach.sql';
mustExist(DETACH_MIGRATION);
mustContain(
  DETACH_MIGRATION,
  'delete_my_account',
  'the detach ships as a wipe replacement',
);
mustContain(
  DETACH_MIGRATION,
  'set owner = null',
  'surviving owned rows must detach before the auth user goes',
);

// ── Suite wiring ───────────────────────────────────────────────
mustContain(
  'package.json',
  'check-meeting-crash-fix',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Meeting-crash-fix gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Meeting-crash-fix guards pass.');
