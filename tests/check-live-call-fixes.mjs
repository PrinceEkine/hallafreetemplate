// Live-call repair guards: the realtime layer never delivered hang-ups
// (filtered DELETEs need replica identity FULL; presence was never
// published), ending awaited the network, swipe-reply called a stale
// closure, rooms hid camera/share on voice rows, and a failed share
// kept the single-sharer lock.
// Run: node tests/check-live-call-fixes.mjs
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

// -- Realtime repair migration -----------------------------------
const MIGRATION = 'supabase/migrations/2026112208_call_realtime.sql';
mustExist(MIGRATION);
mustContain(
  MIGRATION,
  'alter table public.call_signals replica identity full',
  'filtered DELETE subscriptions need full old rows',
);
mustContain(
  MIGRATION,
  'add table public.call_presence',
  'presence flags must reach subscribers',
);

// -- Instant end ---------------------------------------------------
mustContain(
  'app/call/[id].tsx',
  'withTimeout(endCallSignal(refId), 8000)',
  'ending must never wait on the network unbounded',
);
mustContain(
  'app/call/[id].tsx',
  'void remoteEndRef.current()',
  'a confirmed-gone row must exit the call screen',
);
mustContain(
  'app/call/[id].tsx',
  'onConnectionStateChanged',
  'dropped media must show instead of freezing silently',
);

// -- Voice rooms keep camera/share ---------------------------------
mustContain(
  'app/call/[id].tsx',
  'canVideo',
  'rooms must offer camera and share on audio-first rows',
);
mustContain(
  'app/call/[id].tsx',
  "if (!next) setCallMedia('video')",
  'turning the camera on must upgrade a voice room',
);
mustContain(
  'app/call/[id].tsx',
  'VideoSourceCameraPrimary',
  'the local tile needs the v4 source type or it renders black',
);

// -- Failed shares release the lock --------------------------------
mustContain(
  'app/call/[id].tsx',
  'throw captureErr',
  'a failed capture must surface after releasing the lock',
);
mustContain(
  'app/call/[id].tsx',
  'Could not start screen capture (engine error',
  'capture return codes must surface, not pass silently',
);
mustContain(
  'app/call/[id].tsx',
  'Could not publish the screen (engine error',
  'a dead publish switch must surface, not fake sharing',
);
mustContain(
  'app/call/[id].tsx',
  'connectingVeil',
  'the preview surface must mount before the join lands',
);
mustContain(
  'modules/call-keepalive/android/src/main/AndroidManifest.xml',
  'FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'screen capture needs its foreground-service type',
);

// -- Swipe-reply targets the current row ----------------------------
mustContain(
  'app/chat/[id].tsx',
  'replyRef.current = onReply',
  'recycled rows must not reply to a stale message',
);
mustContain(
  'app/chat/[id].tsx',
  'if (g.dx > 48) replyRef.current()',
  'the swipe release must call through the ref',
);

// -- Poll fallbacks when realtime drops ------------------------------
mustContain(
  'app/chat/[id].tsx',
  '}, [liveCall, id, demo]);',
  'a stuck call banner must re-check its row',
);
mustContain(
  'components/IncomingCallOverlay.tsx',
  'getRoomCall(refId)',
  'a cancelled meeting must stop ringing by itself',
);

// -- One-sided video + lag -------------------------------------------
mustContain(
  'app/call/[id].tsx',
  'muteLocalVideoStream(!video || videoOffRef.current)',
  'mute flags persist on the engine and must reset every call',
);
mustContain(
  'app/call/[id].tsx',
  'setVideoEncoderConfiguration',
  '360p keeps video smooth on poor networks',
);
mustContain(
  'app/call/[id].tsx',
  'joinRc',
  'a failed channel join must show instead of idling',
);
mustContain(
  'app/call/[id].tsx',
  'unregisterEventHandler',
  'stale engine handlers must not survive the call screen',
);

// -- Meeting invites + pay toggle --------------------------------------
mustContain(
  'app/community/actions.tsx',
  'sheetError',
  'invite save failures must show inside the sheet',
);
mustContain(
  'components/DrawerMenu.tsx',
  'modulesLoaded',
  'disabled rows must never flash before settings load',
);
mustContain(
  'app/community/[id].tsx',
  'setModules(prev)',
  'a toggle whose save fails must revert instead of lying',
);

// -- WhatsApp-style voice grid --------------------------------------------------
mustContain(
  'app/call/[id].tsx',
  'VoiceTile',
  'voice calls show every participant in tiles',
);
mustContain(
  'app/call/[id].tsx',
  'enableAudioVolumeIndication',
  'speaking tiles must highlight',
);
mustContain(
  'app/call/[id].tsx',
  'controlsPill',
  'voice controls sit in a bottom pill',
);
mustContain(
  'lib/calls.ts',
  'avatarUrl',
  'presence must carry avatars for voice tiles',
);

// -- Global incoming-call popup + push counts -------------------------------
mustContain(
  'components/IncomingCallOverlay.tsx',
  "kicker: 'INCOMING CALL'",
  'chat calls must ring anywhere in-app, not just in-thread',
);
mustContain(
  'components/IncomingCallOverlay.tsx',
  'getOpenConversation',
  'the popup must not double-ring the open thread',
);
mustContain(
  'lib/richPush.ts',
  'totalUnread',
  'enriched pushes must carry the badge count',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'unreadCounts',
  'pushes must count unread per recipient',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'badge: slot.total',
  'the app badge must show total unread',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-live-call-fixes',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Live-call gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Live-call guards pass.');
