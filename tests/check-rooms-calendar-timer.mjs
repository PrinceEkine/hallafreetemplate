// Rooms/calendar/timer/ringtone guards: meeting rooms split into general
// (empty invite list, whole community) vs specified (invited members only,
// admins always), call notifications stay inside the room, the events
// down-button opens a full month calendar, disappearing timers are
// 1h/24h/7d/30d in a dropdown with per-message expiry, missed calls read
// per-side (Call not answered vs Missed), calls ring, video calls use a
// featured grid, and ending ends for everyone.
// Run: node tests/check-rooms-calendar-timer.mjs
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

// ── Meeting rooms: general vs specified ──────────────────────────
mustContain(
  'app/community/actions.tsx',
  'canJoinRoom',
  'rooms must gate joining on the invite list',
);
mustContain(
  'app/community/actions.tsx',
  'GENERAL',
  'rooms with no invites must read as general',
);
mustContain(
  'app/community/actions.tsx',
  'PRIVATE',
  'outsiders must see specified rooms as private, not joinable',
);
mustContain(
  'app/community/actions.tsx',
  'inRoom',
  'the list must know which rooms the viewer was added to',
);
mustContain(
  'app/community/actions.tsx',
  'Leave the list empty for a general room',
  'admins must learn that empty means community-wide',
);
mustContain(
  'components/IncomingCallOverlay.tsx',
  'isCommunityMember',
  'general rooms must ring every active community member',
);
mustContain(
  'components/IncomingCallOverlay.tsx',
  'General room: ring every active community member.',
  'the popup must treat empty invite lists as community-wide',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'General room: the whole community is in the room.',
  'pushes for general rooms must reach the community, not nobody',
);
mustContain(
  'supabase/functions/agora-token/index.ts',
  'This room is private.',
  'the token server must refuse outsiders of specified rooms',
);

// ── Events: full month calendar below ────────────────────────────
mustContain(
  'app/(tabs)/events.tsx',
  'monthCard',
  'the down button must open a month card below the strip',
);
mustContain(
  'app/(tabs)/events.tsx',
  'moveMonth',
  'the month card must page between months',
);
mustContain(
  'app/(tabs)/events.tsx',
  'renderGridDay',
  'the month card must render tappable day cells',
);
mustLack(
  'app/(tabs)/events.tsx',
  'expandedWeeks',
  'the strip must not unfold into extra week rows anymore',
);

// ── Disappearing timers: 1h/24h/7d/30d dropdown ──────────────────
mustContain(
  'lib/safety.ts',
  'DISAPPEAR_OPTIONS',
  'one shared timer menu for thread and profile',
);
mustContain(
  'lib/safety.ts',
  'disappearLabel',
  'one shared timer label',
);
mustContain(
  'lib/safety.ts',
  '2592000',
  'the menu must offer 30 days',
);
mustExist('components/DisappearPicker.tsx');
mustContain(
  'components/DisappearPicker.tsx',
  'DISAPPEAR_OPTIONS',
  'the dropdown must render the shared menu',
);
mustContain(
  'app/member/[id].tsx',
  'DisappearPicker',
  'the profile must use the dropdown, not an alert popup',
);
mustLack(
  'app/member/[id].tsx',
  'applyProfileDisappear(7776000)',
  'the 90-day popup option must be gone from the profile',
);
mustContain(
  'app/chat/[id].tsx',
  'title="1 hour"',
  'the thread menu must offer 1 hour',
);
mustContain(
  'app/chat/[id].tsx',
  'title="30 days"',
  'the thread menu must offer 30 days',
);
mustLack(
  'app/chat/[id].tsx',
  'title="90 days"',
  'the 90-day row must be gone from the thread menu',
);
const TIMER_MIGRATION =
  'supabase/migrations/2026112106_disappear_timer_options.sql';
mustExist(TIMER_MIGRATION);
mustContain(
  TIMER_MIGRATION,
  'set_disappear_seconds',
  'the server must accept the new durations',
);
mustContain(TIMER_MIGRATION, '2592000', '30 days must pass the whitelist');

// ── Expiry is per message, never retroactive ─────────────────────
const EXPIRY_MIGRATION = 'supabase/migrations/2026112107_message_expiry.sql';
mustExist(EXPIRY_MIGRATION);
mustContain(
  EXPIRY_MIGRATION,
  'expires_at',
  'messages must carry their own expiry stamp',
);
mustContain(
  EXPIRY_MIGRATION,
  'trg_set_message_expiry',
  'sends must stamp the timer active at send time',
);
mustContain(
  EXPIRY_MIGRATION,
  'purge_expired_messages',
  'the purge must follow per-message expiry, not the live timer',
);
mustContain(
  'lib/chat.ts',
  'expires_at',
  'messages must load their expiry stamp',
);
mustContain(
  'app/chat/[id].tsx',
  '!m.expires_at',
  'the thread must hide by stamp, never by the live timer',
);

// ── Missed calls read per side ───────────────────────────────────
mustContain(
  'lib/chat.ts',
  'missedCallDisplay',
  'missed-call wording needs one per-side mapper',
);
mustContain(
  'lib/chat.ts',
  'Call not answered',
  'the unanswered caller must read Call not answered',
);
mustContain(
  'app/chat/[id].tsx',
  'missedCallDisplay',
  'the thread must render the per-side wording',
);

// ── Ringtones ────────────────────────────────────────────────────
mustExist('lib/ringtone.ts');
mustContain(
  'lib/ringtone.ts',
  'ensureRingtoneUri',
  'the ringtone must be synthesized on-device',
);
mustContain('lib/ringtone.ts', 'useRingtone', 'screens need a ring hook');
mustContain(
  'components/IncomingCallOverlay.tsx',
  'useRingtone',
  'meeting popups must ring',
);
mustContain(
  'app/chat/[id].tsx',
  'useRingtone',
  'incoming chat calls must ring in the thread',
);
mustContain(
  'app/call/[id].tsx',
  'useRingtone',
  'the call screen must ring while waiting for an answer',
);

// ── Fullscreen video + true end-for-both ──────────────────────────
mustContain(
  'app/call/[id].tsx',
  'videoStage',
  'video calls need a fullscreen video stage',
);
mustContain(
  'app/call/[id].tsx',
  'cycleFeed',
  'tapping the fullscreen video must switch feeds',
);
mustContain(
  'app/call/[id].tsx',
  'Tap to switch',
  'the switch gesture must be discoverable',
);
mustContain(
  'app/call/[id].tsx',
  'remoteEnd',
  'the other side hanging up must end here too',
);
mustContain(
  'app/call/[id].tsx',
  "setStatus('Ended')",
  'a remotely ended call must show Ended before exiting',
);
mustContain(
  'app/call/[id].tsx',
  'subscribeToCallSignals',
  'the call screen must watch the live row',
);

// ── Permissions: ask up front, explain when denied ───────────────
mustContain(
  'app/community/actions.tsx',
  'ensureCallPermissions',
  'the rooms list must request mic/camera/notifications on entry',
);
mustContain(
  'app/community/actions.tsx',
  'GRANT ACCESS',
  'denied hardware must offer a one-tap re-request',
);
mustContain(
  'app/community/media.tsx',
  'ensureMediaLibrary',
  'gallery downloads must hold storage access first',
);
mustContain(
  'app/chat/[id].tsx',
  'ensureMediaLibrary',
  'gallery reads must go through the storage gate',
);

// ── Crash instrumentation retired ──────────────────────────────
// The meeting crash was the shared realtime channel topic (fixed in
// lib/calls.ts with one channel per subscription), so the temporary
// CrashCatcher screens and the global fatal-error reporter are gone.
mustLack(
  'app/community/actions.tsx',
  'CrashCatcher',
  'the temporary meeting crash screen was removed with the real fix',
);
mustLack(
  'app/call/[id].tsx',
  'CrashCatcher',
  'the temporary call crash screen was removed with the real fix',
);
mustLack(
  'app/_layout.tsx',
  'setGlobalHandler',
  'the temporary fatal-error reporter was removed with the real fix',
);
mustLack(
  'app/_layout.tsx',
  'ErrorUtils',
  'no ErrorUtils reference may remain in the root layout',
);

// ── Suite wiring ─────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-rooms-calendar-timer',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Rooms-calendar-timer gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Rooms-calendar-timer guards pass.');
