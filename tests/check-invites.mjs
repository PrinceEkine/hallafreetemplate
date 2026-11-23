// Guards invite-via-link: admins share a public link, which opens the app
// and auto-joins when installed, or falls back to the Play Store.
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

mustExist('lib/invites.ts');
mustContain(
  'lib/invites.ts',
  'inviteLink',
  'invite links must come from one builder',
);
mustContain(
  'lib/invites.ts',
  'parseInviteUrl',
  'deep links must parse back to a code',
);
mustExist('docs/join.html');
mustContain(
  'docs/join.html',
  'play.google.com',
  'the landing page must fall back to the Play Store',
);
mustContain(
  'docs/join.html',
  'ophixe://join',
  'the landing page must try the app first',
);
mustContain(
  'app/_layout.tsx',
  'routeFromInviteUrl',
  'the app must route invite deep links',
);
mustContain(
  'app/community/join.tsx',
  'codeParam',
  'the join screen must accept a link code',
);
mustContain(
  'app/community/[id].tsx',
  'SHARE INVITE LINK',
  'admins must share the invite link',
);
mustContain(
  'app/community/[id].tsx',
  'SHOW INVITE QR',
  'admins must display the invite QR',
);
mustContain(
  'lib/invites.ts',
  'parseScannedInvite',
  'scanned QR payloads must parse back to a code',
);
mustExist('app/community/scan.tsx');
mustContain(
  'app/community/scan.tsx',
  'CameraView',
  'the scan screen must use the camera',
);
mustContain(
  'app/community/join.tsx',
  'Scan QR instead',
  'joining must offer the scanner',
);

if (failures.length > 0) {
  console.error(`Invite gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Invite guards pass.');
