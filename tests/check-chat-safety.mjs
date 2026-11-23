// Chat safety guards: DM + group 3-dot menus without emoji (contact info,
// in-chat search, chat theme, mute, disappearing messages, report, block),
// backed by user blocks, user reports, and expiring messages.
// Run: node tests/check-chat-safety.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

function mustContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  if (!read(file).includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

function mustNotContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) return;
  if (read(file).includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

// ── Migration ──────────────────────────────────────────────────────
mustExist('supabase/migrations/2026111801_chat_safety.sql');
mustContain(
  'supabase/migrations/2026111801_chat_safety.sql',
  'user_blocks',
  'blocking needs a server-side record',
);
mustContain(
  'supabase/migrations/2026111801_chat_safety.sql',
  'dm_has_block',
  'the server must refuse sends into a blocked DM',
);
mustContain(
  'supabase/migrations/2026111801_chat_safety.sql',
  'disappear_seconds',
  'conversations carry the timer',
);
mustContain(
  'supabase/migrations/2026111801_chat_safety.sql',
  'purge_expired_messages',
  'expired messages are deleted server-side',
);
mustContain(
  'supabase/migrations/2026111801_chat_safety.sql',
  'reported_user_id',
  'reports cover people, not just posts',
);

// ── Safety library ─────────────────────────────────────────────────
mustExist('lib/safety.ts');
mustContain('lib/safety.ts', 'blockUser', 'block API');
mustContain('lib/safety.ts', 'unblockUser', 'unblock API');
mustContain('lib/safety.ts', 'isBlockedByMe', 'blocked-state lookup');
mustContain(
  'lib/safety.ts',
  'setDisappearSeconds',
  'timer setter API',
);
mustContain(
  'lib/safety.ts',
  'getDisappearSeconds',
  'timer lookup API',
);
mustContain('lib/safety.ts', 'reportUser', 'user report API');

// ── Thread menus (no emoji) ────────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'View contact',
  'DM menu opens the peer profile',
);
mustContain(
  'app/chat/[id].tsx',
  'Search in chat',
  'threads offer message search',
);
mustContain(
  'app/chat/[id].tsx',
  'Chat theme',
  'threads link the wallpaper picker',
);
mustContain(
  'app/chat/[id].tsx',
  'Mute notifications',
  'mute toggle for DMs and groups',
);
mustContain(
  'app/chat/[id].tsx',
  'Disappearing messages',
  'timer entry in both menus',
);
mustContain('app/chat/[id].tsx', 'Report', 'DM menu reports the peer');
mustContain('app/chat/[id].tsx', 'Block', 'DM menu blocks the peer');
mustContain('app/chat/[id].tsx', 'Unblock', 'blocked state reverses');
for (const emoji of ['👥', '➕', '🔔', '🔕', '🚪', '🗑']) {
  mustNotContain(
    'app/chat/[id].tsx',
    emoji,
    'menus use icons, not emoji',
  );
}

// ── Suite wiring ───────────────────────────────────────────────────
mustContain('package.json', 'check-chat-safety', 'the check must run in npm test');

if (failures.length > 0) {
  console.error(`Chat-safety gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat-safety guards pass.');
