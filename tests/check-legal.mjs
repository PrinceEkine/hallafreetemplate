// Legal guards: Terms of Use + Privacy Policy ship in-app and on the
// website, signups consent before creating an account, every post-auth
// route funnels holdouts through the acceptance screen, and acceptance
// is stamped on the profile for proof.
// Run: node tests/check-legal.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function read(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
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

// ── Documents exist in-app and on the web ───────────────────────
for (const file of [
  'lib/legal.ts',
  'components/LegalDoc.tsx',
  'app/legal/terms.tsx',
  'app/legal/privacy.tsx',
  'app/legal/accept.tsx',
  'website/terms.html',
  'website/privacy.html',
]) {
  mustExist(file);
}
mustContain(
  'lib/legal.ts',
  'TERMS_SECTIONS',
  'the terms text lives in one source',
);
mustContain(
  'lib/legal.ts',
  'PRIVACY_SECTIONS',
  'the privacy text lives in one source',
);
mustContain(
  'lib/legal.ts',
  'LEGAL_VERSION',
  'acceptance is versioned so updates can re-ask',
);
mustContain(
  'website/terms.html',
  'Limitation of liability',
  'the public terms carry the liability cap',
);
mustContain(
  'website/privacy.html',
  'Who sees your data',
  'the public policy discloses colleague visibility',
);
mustContain(
  'website/index.html',
  'terms.html',
  'the landing page links the terms',
);
mustContain(
  'website/index.html',
  'privacy.html',
  'the landing page links the policy',
);

// ── Consent at signup ───────────────────────────────────────────
mustContain(
  'app/(auth)/signup.tsx',
  'I agree to the',
  'signup shows a consent checkbox',
);
mustContain(
  'app/(auth)/signup.tsx',
  '/legal/terms',
  'the checkbox links the terms',
);
mustContain(
  'app/(auth)/signup.tsx',
  'recordLegalAcceptance',
  'a fresh signup stamps acceptance on the profile',
);
mustContain(
  'app/(auth)/login.tsx',
  '/legal/privacy',
  'login links the policy',
);

// ── Every post-auth route funnels through acceptance ─────────────
for (const file of [
  'app/index.tsx',
  'app/(auth)/login.tsx',
  'app/(auth)/signup.tsx',
  'app/(auth)/confirm-email.tsx',
  'app/(auth)/verify.tsx',
]) {
  mustContain(
    file,
    'shouldShowLegalAccept',
    `${file} must route holdouts to the accept screen`,
  );
}
mustContain(
  'app/legal/accept.tsx',
  'recordLegalAcceptance',
  'the accept screen stamps acceptance',
);

// ── Backend + always-available copies ───────────────────────────
const MIGRATION = 'supabase/migrations/2026112104_legal_acceptance.sql';
mustExist(MIGRATION);
mustContain(
  MIGRATION,
  'accepted_terms_version',
  'profiles record which legal version was accepted',
);
mustContain(
  'components/ProfileScreen.tsx',
  'LEGAL',
  'my account links both documents',
);

// ── Account deletion (in-app) ───────────────────────────────────
const DELETE_MIGRATION = 'supabase/migrations/2026112105_account_delete.sql';
mustExist(DELETE_MIGRATION);
mustContain(
  DELETE_MIGRATION,
  'delete_my_account',
  'account deletion needs a server-side wipe',
);
mustContain(
  DELETE_MIGRATION,
  'auth.users',
  'the wipe removes the auth user itself',
);
mustContain(
  DELETE_MIGRATION,
  'storage.objects',
  'the wipe revokes the deleted files',
);
mustContain(
  DELETE_MIGRATION,
  'Users can delete own post media',
  'users must truly delete their public post photos first',
);
mustContain(
  DELETE_MIGRATION,
  'deletion_feedback',
  'leaving reasons are kept anonymously for learning',
);
mustContain(
  DELETE_MIGRATION,
  'p_reason',
  'the wipe requires a reason',
);
mustContain(
  'lib/account.ts',
  'confirmPassword',
  'deletion re-checks the account password',
);
mustContain(
  'app/profile/delete.tsx',
  'WHY ARE YOU LEAVING?',
  'deletion asks for a reason first',
);
mustContain(
  'app/profile/delete.tsx',
  'YOUR PASSWORD',
  'deletion asks for the password before wiping',
);
mustExist('lib/account.ts');
mustContain(
  'lib/account.ts',
  'deleteMyAccount',
  'deletion needs one library entry point',
);
mustContain(
  'lib/e2ee.ts',
  'clearMyKeypair',
  'deletion must wipe the device chat key',
);
mustExist('app/profile/delete.tsx');
mustContain(
  'app/profile/delete.tsx',
  'DELETE',
  'deletion requires typing DELETE to confirm',
);
mustContain(
  'components/ProfileScreen.tsx',
  '/profile/delete',
  'my account exposes the danger zone',
);
mustContain(
  'lib/legal.ts',
  'Delete account',
  'the policy names the in-app deletion path',
);
mustContain(
  'website/privacy.html',
  'Delete account',
  'the public policy names the in-app deletion path',
);

// ── Suite wiring ────────────────────────────────────────────────
mustContain('package.json', 'check-legal', 'the check must run in npm test');

if (failures.length > 0) {
  console.error(`Legal gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Legal guards pass.');
