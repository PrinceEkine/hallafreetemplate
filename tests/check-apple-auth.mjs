// Apple sign-in guards: native button on login + signup (iOS only),
// Supabase idToken exchange, setup doc for the owner-side steps.
// Run: node tests/check-apple-auth.mjs
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

mustContain(
  'package.json',
  'expo-apple-authentication',
  'the native Apple module must be installed',
);
mustContain(
  'app.json',
  'expo-apple-authentication',
  'the entitlement plugin must ship in builds',
);
mustExist('components/AppleButton.tsx');
mustContain(
  'lib/supabase.ts',
  'signInWithApple',
  'Apple credentials must exchange for a session',
);
mustContain(
  'lib/supabase.ts',
  'isAppleAuthAvailable',
  'the button must hide where Apple is unavailable',
);
mustContain(
  'app/(auth)/login.tsx',
  'Sign in with Apple',
  'login needs the Apple button',
);
mustContain(
  'app/(auth)/signup.tsx',
  'Sign up with Apple',
  'signup needs the Apple button',
);
mustContain(
  'app/(auth)/signup.tsx',
  'recordLegalAcceptance',
  'Apple signup must record legal consent like Google',
);
mustExist('docs/APPLE_AUTH_SETUP.md');
mustContain(
  'docs/APPLE_AUTH_SETUP.md',
  'eatxkfopyljdomzbhzym.supabase.co/auth/v1/callback',
  'the doc must name the exact return URL',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-apple-auth',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Apple-auth gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Apple-auth guards pass.');
