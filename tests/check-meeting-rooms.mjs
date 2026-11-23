// Meeting video-room guards: rooms open a live video call, admins invite
// members from a searchable list, invitees get an incoming-call popup
// anywhere in the app, and the call screen rings 1-1 calls while groups
// wait for others.
// Run: node tests/check-meeting-rooms.mjs
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

const MIGRATION = 'supabase/migrations/2026111901_meeting_video.sql';

// ── Backend ──────────────────────────────────────────────────────────
mustExist(MIGRATION);
mustContain(MIGRATION, 'meeting_members', 'invited members per room');
mustContain(
  MIGRATION,
  'supabase_realtime',
  'call rows must stream for the live popup',
);
mustContain(MIGRATION, 'purge_stale_events', 'stale-event cleanup');
mustContain('supabase/functions/push-fanout/index.ts', "sig.scope === 'room'", 'room calls fan out a push');
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "route: 'meeting'",
  'meeting pushes deep-link to the room call',
);

// ── Call + meeting APIs ──────────────────────────────────────────────
mustContain('lib/calls.ts', 'channelForRoom', 'room channel names');
mustContain('lib/calls.ts', 'startRoomSignal', 'open-or-join room rows');
mustContain('lib/calls.ts', 'endRoomSignal', 'end meeting for everyone');
mustContain(
  'lib/calls.ts',
  'subscribeToAllCallSignals',
  'one global listener for the popup and LIVE badges',
);
mustContain('lib/communityContent.ts', 'getMeeting', 'room detail lookup');
mustContain(
  'lib/communityContent.ts',
  'listMeetingMembers',
  'invited member lookup',
);
mustContain(
  'lib/communityContent.ts',
  'setMeetingMembers',
  'admin invite editing',
);

// ── Meetings screen ──────────────────────────────────────────────────
mustContain(
  'app/community/actions.tsx',
  "scope: 'room'",
  'OPEN must enter the video room, not just the chat',
);
mustContain(
  'app/community/actions.tsx',
  'startRoomSignal',
  'opening starts or joins the live row',
);
mustContain(
  'app/community/actions.tsx',
  'Search members',
  'admin invite picker must be searchable',
);
mustContain(
  'app/community/actions.tsx',
  'pickerList',
  'admin invite picker must scroll',
);
mustContain('app/community/actions.tsx', 'LIVE', 'live rooms show a badge');
mustContain(
  'app/community/actions.tsx',
  'endRoomSignal',
  'admin/starter can end the meeting',
);

// ── Global incoming-call popup ───────────────────────────────────────
mustExist('components/IncomingCallOverlay.tsx');
mustContain(
  'components/IncomingCallOverlay.tsx',
  'subscribeToAllCallSignals',
  'the popup listens everywhere',
);
mustContain(
  'components/IncomingCallOverlay.tsx',
  'Join',
  'invitees can join from the popup',
);
mustContain(
  'app/_layout.tsx',
  '<IncomingCallOverlay />',
  'the popup mounts at the root',
);
mustContain(
  'app/_layout.tsx',
  "'meeting'",
  'meeting pushes route to the room call',
);

// ── Call screen: room mode + ring labels ─────────────────────────────
mustContain(
  'app/call/[id].tsx',
  "scope === 'room'",
  'the call screen supports meeting rooms',
);
mustContain(
  'app/call/[id].tsx',
  'channelForRoom',
  'rooms join their own channel',
);
mustContain('app/call/[id].tsx', 'Calling…', '1-1 starter sees Calling');
mustContain('app/call/[id].tsx', 'Ringing…', '1-1 joiner sees Ringing');
mustContain(
  'app/call/[id].tsx',
  'Waiting for others…',
  'groups and rooms wait for others',
);
mustContain(
  'app/call/[id].tsx',
  'Leave',
  'leaving a room must not sound like ending it',
);

// ── Missed calls land in the chat ────────────────────────────────────
mustContain('lib/chat.ts', 'logMissedCall', 'missed-call chat API');
mustContain(
  'lib/chat.ts',
  'Missed video call',
  'missed video calls say so',
);
mustContain(
  'lib/chat.ts',
  'Missed voice call',
  'missed voice calls say so',
);
mustContain(
  'app/call/[id].tsx',
  'logMissedCall',
  'the call screen logs unanswered 1-1 calls',
);
mustContain(
  'app/call/[id].tsx',
  'hadPeersRef',
  'answered calls must not log as missed',
);

// ── Suite wiring ─────────────────────────────────────────────────────
mustExist('lib/permissions.ts');
mustContain(
  'lib/permissions.ts',
  'ensureMicPermission',
  'calls must hold the microphone before the engine starts',
);
mustContain(
  'lib/permissions.ts',
  'requestCameraPermissionsAsync',
  'video calls must hold the camera before the engine starts',
);
mustContain(
  'lib/permissions.ts',
  'ensureCallPermissions',
  'meeting entry runs one permission gate',
);
mustContain(
  'app/call/[id].tsx',
  'ensureCallPermissions',
  'the call screen gates on the permission check',
);
mustContain(
  'app/call/[id].tsx',
  "wantVideo && status === 'Connected'",
  'video surfaces render once joined; camera-off keeps remote video up',
);
mustContain(
  'app/chat/[id].tsx',
  'ensureMediaLibrary',
  'gallery attach checks gallery access first',
);
mustContain(
  'app/chat/wallpaper.tsx',
  'ensureMediaLibrary',
  'wallpaper photo checks gallery access first',
);
mustContain(
  'package.json',
  'check-meeting-rooms',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Meeting-room gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Meeting-room guards pass.');
