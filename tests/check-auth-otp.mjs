// Guards email-OTP auth: account verification and password recovery must
// work by typing the 6-digit code from the email, not only by tapping a
// link. The link flows stay (see check-high-fixes); OTP is added alongside.
// Run: npm test
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

mustContain(
  'lib/supabase.ts',
  'verifyEmailOtp',
  'both OTP screens must share one email-code helper',
);
mustContain(
  'app/(auth)/confirm-email.tsx',
  'verifyEmailOtp',
  'account verification must accept the emailed code',
);
mustContain(
  'app/(auth)/confirm-email.tsx',
  "'signup'",
  'account verification must verify the code as a signup OTP',
);
mustContain(
  'app/(auth)/confirm-email.tsx',
  '6-digit',
  'the verify screen must tell the user to type the code',
);
mustContain(
  'app/(auth)/forgot.tsx',
  "pathname: '/reset-password'",
  'forgot password must lead into the code + new-password screen',
);
mustContain(
  'app/(auth)/reset-password.tsx',
  'verifyEmailOtp',
  'password recovery must accept the emailed code',
);
mustContain(
  'app/(auth)/reset-password.tsx',
  "'recovery'",
  'password recovery must verify the code as a recovery OTP',
);

if (failures.length > 0) {
  console.error(`Auth OTP gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Auth OTP guards pass.');
