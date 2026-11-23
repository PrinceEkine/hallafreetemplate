// Chat-plus guards: edit/delete, encrypted media, calls, wallpaper, admin
// tags, always-on notifications, quick nav, form renames, instant startup.
// Run: node tests/check-chat-plus.mjs
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

// ── Edit/delete ──────────────────────────────────────────────────────
mustExist('supabase/migrations/2026111701_chat_plus.sql');
mustContain(
  'supabase/migrations/2026111701_chat_plus.sql',
  'edited_at',
  'edits need a marker column',
);
mustContain(
  'supabase/migrations/2026111701_chat_plus.sql',
  'deleted_at',
  'soft deletes need a tombstone column',
);
mustContain(
  'supabase/migrations/2026111701_chat_plus.sql',
  'already seen',
  'the server must reject edits after the message was seen',
);
mustContain(
  'supabase/migrations/2026111701_chat_plus.sql',
  'chat-media',
  'attachments need a private bucket',
);
mustContain(
  'lib/chat.ts',
  'export async function editMessage',
  'DM edit API',
);
mustContain(
  'lib/chat.ts',
  'export async function editGroupMessage',
  'group edit API',
);
mustContain(
  'lib/chat.ts',
  'export async function deleteMessage',
  'delete API',
);
mustContain(
  'lib/chat.ts',
  'onUpdate',
  'edits/deletes must stream over realtime',
);
mustContain(
  'app/chat/[id].tsx',
  'seenByAnyone',
  'the Edit action must hide once the chat was seen',
);
mustContain(
  'app/chat/[id].tsx',
  'This message was deleted.',
  'deleted messages render a tombstone',
);
mustContain(
  'app/chat/[id].tsx',
  'edited',
  'edited messages show a marker',
);

// ── Media ────────────────────────────────────────────────────────────
mustExist('lib/media.ts');
mustExist('components/MediaBubble.tsx');
mustContain('lib/media.ts', 'parseMediaDescriptor', 'media descriptors');
mustContain('lib/media.ts', 'chat-media', 'media bucket name');
mustContain(
  'app/chat/[id].tsx',
  'MediaBubble',
  'threads render photo/video/file bubbles',
);
mustContain(
  'app/chat/[id].tsx',
  'pickPhotoVideo',
  'photo/video attach path',
);
mustContain(
  'app/chat/[id].tsx',
  'pickDocument',
  'document attach path',
);

// ── Swipe reply ──────────────────────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'Swipeable',
  'swipe-right-to-reply wrapper',
);
mustContain(
  'app/chat/[id].tsx',
  'PanResponder',
  'swipe gesture tracking',
);

// ── Calling + screen share ───────────────────────────────────────────
mustExist('lib/calls.ts');
mustExist('app/call/[id].tsx');
mustContain('lib/calls.ts', 'startCallSignal', 'call signaling');
mustContain('lib/calls.ts', 'agora-token', 'token fetch');
mustContain(
  'app/call/[id].tsx',
  'startScreenCapture',
  'Android screen sharing',
);
mustContain(
  'app/chat/[id].tsx',
  'handleStartCall',
  'voice/video call buttons',
);
mustContain(
  'app/chat/[id].tsx',
  'Incoming',
  'incoming-call banner',
);

// ── Wallpaper ────────────────────────────────────────────────────────
mustExist('lib/wallpaper.ts');
mustExist('app/chat/wallpaper.tsx');
mustExist('assets/chat/default-wallpaper.png');
mustContain(
  'lib/wallpaper.ts',
  'default-wallpaper',
  'the app default wallpaper asset',
);
mustContain(
  'app/chat/[id].tsx',
  'DEFAULT_WALLPAPER',
  'threads render the chosen wallpaper',
);
mustContain(
  'lib/wallpaper.ts',
  'builtinSource',
  'built-in patterns resolve by id',
);
mustContain(
  'app/chat/wallpaper.tsx',
  'BUILTIN_WALLPAPERS',
  'the picker lists pattern wallpapers',
);

// ── Admin tags ───────────────────────────────────────────────────────
mustContain('lib/chat.ts', 'getGroupAdminIds', 'admin id lookup');
mustContain('components/premium.tsx', 'AdminTag', 'A badge component');
mustContain(
  'app/group/[id].tsx',
  'AdminTag',
  'group info shows admin badges',
);
mustContain(
  'app/chat/[id].tsx',
  'AdminTag',
  'threads tag admin senders',
);

// ── Notifications ────────────────────────────────────────────────────
mustContain(
  'lib/push.ts',
  'configureNotifications',
  'foreground presentation + channels',
);
mustContain(
  'lib/push.ts',
  'setNotificationHandler',
  'banners must show while the app is open',
);
mustContain(
  'app/_layout.tsx',
  'configureNotifications()',
  'notification setup runs at startup',
);

// ── Group 3-dot menu ─────────────────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'ellipsis-vertical',
  'group threads need a 3-dot overflow button',
);
mustContain(
  'app/chat/[id].tsx',
  'handleDeleteGroup',
  'delete group from the thread reuses the admin RPC',
);
mustContain(
  'app/chat/[id].tsx',
  'openAddSheet',
  'add members from the thread',
);
mustContain(
  'app/chat/[id].tsx',
  'Delete group',
  'delete label in the group menu',
);

// ── Quick nav ────────────────────────────────────────────────────────
mustExist('components/QuickNav.tsx');
mustContain(
  'components/QuickNav.tsx',
  "'Chat'",
  'one-tap chat destination',
);
mustContain(
  'app/_layout.tsx',
  '<QuickNav />',
  'the bar renders under inner screens',
);

// ── Form renames ─────────────────────────────────────────────────────
mustExist('supabase/migrations/2026111702_form_types.sql');
mustContain('lib/forms.ts', 'leave_request', 'leave request type');
mustContain('lib/forms.ts', 'staff_report', 'report staff type');
mustContain(
  'lib/forms.ts',
  'Sexual harassment',
  'report reasons include harassment',
);

// ── Instant startup ──────────────────────────────────────────────────
mustContain(
  'lib/session.ts',
  'getCachedPhone',
  'bootstrap routes from cache',
);
mustContain(
  'app/index.tsx',
  'getCachedPhone',
  'startup must not block on the network',
);
mustContain(
  'app/(tabs)/events.tsx',
  'resolveWithCache',
  'events render the saved copy first',
);

if (failures.length > 0) {
  console.error(`Chat-plus gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat-plus guards pass.');
