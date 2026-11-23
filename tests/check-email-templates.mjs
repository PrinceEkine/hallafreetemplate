// Guards the branded Supabase Auth emails: every template must show the
// hosted app logo, and the two OTP templates must include both the typed
// code and the tap link (the app accepts either).
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

const LOGO_URL =
  'https://eatxkfopyljdomzbhzym.supabase.co/storage/v1/object/public/avatars/brand/halla-logo.png';

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

const TEMPLATES = [
  'supabase/email-templates/confirm-signup.html',
  'supabase/email-templates/reset-password.html',
  'supabase/email-templates/invite-user.html',
  'supabase/email-templates/change-email.html',
];

for (const file of TEMPLATES) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    continue;
  }
  mustContain(file, LOGO_URL, 'every email must show the hosted app logo');
  mustNotContain(
    file,
    'ophixe-logo.png',
    'the old logo filename does not exist in storage',
  );
}

mustContain(
  'supabase/email-templates/confirm-signup.html',
  '{{ .Token }}',
  'signup verification must show the typed code',
);
mustContain(
  'supabase/email-templates/confirm-signup.html',
  '{{ .ConfirmationURL }}',
  'signup verification must keep the tap link',
);
mustContain(
  'supabase/email-templates/reset-password.html',
  '{{ .Token }}',
  'password recovery must show the typed code',
);
mustContain(
  'supabase/email-templates/reset-password.html',
  '{{ .ConfirmationURL }}',
  'password recovery must keep the tap link',
);
mustContain(
  'supabase/email-templates/invite-user.html',
  '{{ .ConfirmationURL }}',
  'invites are accepted through the link',
);
mustContain(
  'supabase/email-templates/change-email.html',
  '{{ .NewEmail }}',
  'email changes must name the new address',
);

if (failures.length > 0) {
  console.error(`Email template gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Email template guards pass.');
