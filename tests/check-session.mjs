// Guards session persistence (stay logged in) and profile navigation.
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

mustExist('lib/session.ts');
mustExist('components/ProfileScreen.tsx');
mustExist('app/profile/index.tsx');
mustExist('app/member/[id].tsx');
mustContain(
  'app/index.tsx',
  'getBootstrapSession',
  'launch must restore the stored session',
);
mustContain(
  'app/index.tsx',
  "router.replace('/feed')",
  'signed-in users must skip welcome',
);
mustContain(
  'app/(auth)/login.tsx',
  "router.replace('/feed')",
  'signed-in users must not see login',
);
mustContain(
  'app/(auth)/signup.tsx',
  "router.replace('/feed')",
  'signed-in users must not see signup',
);
if (
  readFileSync(join(ROOT, 'app/(tabs)/_layout.tsx'), 'utf8').includes(
    'name="profile"',
  )
) {
  failures.push(
    'app/(tabs)/_layout.tsx must not contain name="profile" (profile lives behind the header avatar, not the bottom nav)',
  );
}
mustContain(
  'components/AppHeader.tsx',
  "router.push('/profile')",
  'header avatar must link to profile',
);
mustContain(
  'components/ScreenHeader.tsx',
  "router.push('/profile')",
  'header avatar must link to profile',
);
mustContain(
  'components/ProfileScreen.tsx',
  'getSession',
  'profile must gate on the restored session, not a network user fetch',
);

if (failures.length > 0) {
  console.error(`Session/profile gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Session and profile guards pass.');
