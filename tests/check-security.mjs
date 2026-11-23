// Security regression guards: member-scoped event reads, SecureStore
// auth sessions, and owner-only push tokens.
// Run: node tests/check-security.mjs
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

function mustNotContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

const SCOPE_MIGRATION = 'supabase/migrations/2026112101_event_read_scope.sql';
const TOKEN_MIGRATION = 'supabase/migrations/2026112102_push_tokens.sql';

// ── Fix 1: events + RSVPs stay inside the community ───────────────────
mustExist(SCOPE_MIGRATION);
mustContain(
  SCOPE_MIGRATION,
  'drop policy if exists "signed-in read events"',
  'the cross-community event read must be revoked',
);
mustContain(
  SCOPE_MIGRATION,
  'drop policy if exists "signed-in read rsvps"',
  'the cross-community RSVP read must be revoked',
);
mustContain(
  SCOPE_MIGRATION,
  'Members can read community rsvps',
  'members still need a scoped RSVP read for counts',
);
mustContain(
  SCOPE_MIGRATION,
  'is_community_member',
  'RSVP reads must follow membership',
);

// ── Fix 2: sessions encrypted at rest ─────────────────────────────────
mustExist('lib/secureStorage.ts');
mustContain(
  'lib/secureStorage.ts',
  'expo-secure-store',
  'auth sessions must live in the OS keychain',
);
mustContain(
  'lib/secureStorage.ts',
  '.count',
  'session blobs must be chunked for SecureStore limits',
);
mustContain(
  'lib/secureStorage.ts',
  'safeKey',
  'Supabase keys contain hyphens, which SecureStore rejects unencoded',
);
mustNotContain(
  'lib/secureStorage.ts',
  '${key}:',
  'colons are illegal in SecureStore keys and break login',
);
mustNotContain(
  'lib/secureStorage.ts',
  '${safe}:',
  'colons are illegal in SecureStore keys and break login',
);
mustContain(
  'lib/secureStorage.ts',
  'AsyncStorage',
  'older plaintext sessions must migrate, not strand users',
);
mustContain(
  'lib/supabase.ts',
  'secureAuthStorage',
  'the client must use the keychain adapter on native',
);
mustNotContain(
  'lib/supabase.ts',
  'storage: AsyncStorage',
  'plaintext must not be the session store again',
);

// ── Fix 3: push tokens are owner-only ─────────────────────────────────
mustExist(TOKEN_MIGRATION);
mustContain(
  TOKEN_MIGRATION,
  'create table if not exists public.push_tokens',
  'tokens need their own owner-only table',
);
mustContain(
  TOKEN_MIGRATION,
  'drop column if exists push_token',
  'the community-readable token column must go',
);
mustContain(
  'lib/push.ts',
  "from('push_tokens')",
  'token registration must write the owner-only table',
);
mustNotContain(
  'lib/push.ts',
  'push_token:',
  'the old profiles column must stay unused',
);
mustNotContain(
  'lib/push.ts',
  "'push_token'",
  'the old profiles column must stay unused',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "from('push_tokens')",
  'fanout must read tokens from the new table',
);

// ── Suite wiring ──────────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-security',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Security gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Security guards pass.');
