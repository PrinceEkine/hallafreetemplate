// Calls batch guards: WhatsApp-style thread header with admin-only
// group call icons; in-thread banner silences once joined; the call
// screen resolves true media from the signal, heals labels, ends
// unanswered calls after 45s, shows voice avatars, fullscreen
// switchable video, mute badges, and a single-sharer lock; background
// calls stay alive via the keepalive service; missed/answered entries
// read red/green everywhere.
// Run: node tests/check-call-screen.mjs
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

// ── WhatsApp-style thread header ───────────────────────────────
mustContain(
  'components/ScreenHeader.tsx',
  'ChatTitleCluster',
  'chat threads need picture-plus-name headers',
);
mustContain(
  'app/chat/[id].tsx',
  'title={title}',
  'the thread name must not be clipped short',
);

// ── Admin-only group calls ─────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  '!isGroup || iAmAdmin',
  'group call icons stay admin-only',
);
mustContain(
  'app/chat/[id].tsx',
  'Only admins can start calls in this group.',
  'group call starts need a server-side-shaped guard with words',
);

// ── Banner silence + starter ringtone ──────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'silencedCall',
  'joining must silence the banner behind the call screen',
);
mustContain(
  'app/call/[id].tsx',
  'amStarter',
  'only the starter hears ringback',
);

// ── True media, labels, timeout ────────────────────────────────
mustContain(
  'app/call/[id].tsx',
  'setCallMedia(signal.media)',
  'the live signal corrects push taps missing media',
);
mustContain(
  'app/call/[id].tsx',
  "setWaitingLabel(starter ? 'Calling…' : 'Ringing…')",
  'late signals must heal stuck waiting labels',
);
mustContain(
  'app/call/[id].tsx',
  '45000',
  'unanswered calls must end by themselves',
);
mustContain(
  'app/call/[id].tsx',
  'peerAvatarUrl',
  'voice calls show the peer picture',
);
mustContain(
  'app/call/[id].tsx',
  'cycleFeed',
  'fullscreen video must switch feeds on tap',
);
mustContain(
  'app/call/[id].tsx',
  'otherSharer',
  'one screen-sharer at a time with a name',
);
mustContain(
  'app/call/[id].tsx',
  'publishScreenCaptureVideo',
  'sharing must publish the screen track or nobody sees it',
);
mustContain(
  'app/call/[id].tsx',
  'MUTED',
  'muted feeds need a visible badge',
);

// ── Presence + answered tracking ───────────────────────────────
const PRESENCE_MIGRATION = 'supabase/migrations/2026112205_call_presence.sql';
mustExist(PRESENCE_MIGRATION);
mustContain(
  PRESENCE_MIGRATION,
  'call_presence_single_sharer',
  'the sharer lock needs a database guarantee',
);
mustContain(
  'lib/calls.ts',
  'subscribeToCallPresence',
  'mute and share flags need a live feed',
);
mustContain(
  'lib/calls.ts',
  'markCallAnswered',
  'joined calls must record answered history',
);
const ANSWERED_MIGRATION = 'supabase/migrations/2026112204_call_answered.sql';
mustExist(ANSWERED_MIGRATION);
mustContain(
  'lib/chat.ts',
  'logAnsweredCall',
  'answered calls need a logged entry with duration',
);
mustContain(
  'lib/chat.ts',
  'callLabelTone',
  'call entries need one red/green tone mapper',
);

// ── Background keepalive ───────────────────────────────────────
mustExist('modules/call-keepalive/expo-module.config.json');
mustExist(
  'modules/call-keepalive/android/src/main/java/com/ophixe/callkeepalive/CallKeepaliveService.kt',
);
mustExist('lib/callKeepalive.ts');
mustContain(
  'app/call/[id].tsx',
  'startCallKeepalive',
  'minimized calls must hold audio via the service',
);
mustContain(
  'app.json',
  'UIBackgroundModes',
  'iOS needs background audio for minimized calls',
);

// ── Suite wiring ───────────────────────────────────────────────
mustContain(
  'package.json',
  'check-call-screen',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Call-screen gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Call-screen guards pass.');
