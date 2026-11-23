// Background-mode guards: calls survive minimizing via the keepalive
// service, closed-app delivery rides on high-priority push, and the
// account screen links to the battery screen that gates it all.
// Run: node tests/check-background.mjs
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

mustExist('lib/background.ts');
mustContain(
  'lib/background.ts',
  'IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
  'users need a path to unrestricted background',
);
mustContain(
  'components/ProfileScreen.tsx',
  'RUN IN BACKGROUND',
  'the account screen must surface background mode',
);
mustContain(
  'modules/call-keepalive/android/src/main/java/com/ophixe/callkeepalive/CallKeepaliveService.kt',
  'FOREGROUND_SERVICE_TYPE_MICROPHONE',
  'minimized calls need a mic-type foreground service',
);
mustContain(
  'app.json',
  'remote-notification',
  'iOS needs background push delivery',
);
mustContain(
  'lib/push.ts',
  'AndroidImportance.MAX',
  'chat and call pushes must pop on closed phones',
);
mustContain(
  'lib/richPush.ts',
  'registerTaskAsync',
  'background pushes need enrichment registered',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "ttl: 60",
  'stale call pushes must never surface late',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-background',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Background gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Background guards pass.');
