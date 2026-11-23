// Post text + push-scope guards: photo posts may carry empty text (the
// app still requires text OR a picture); phone pushes go out only for
// chat, announcements, mentions, and calls while every event still
// writes in-app notification rows.
// Run: node tests/check-post-push-calls.mjs
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

// ── Photo posts need no caption ────────────────────────────────
const TEXT_MIGRATION = 'supabase/migrations/2026112203_post_text_optional.sql';
mustExist(TEXT_MIGRATION);
mustContain(
  TEXT_MIGRATION,
  'between 0 and 2000',
  'the posts text check must allow empty captions',
);
mustContain(
  'app/post/new.tsx',
  'Write something or attach a photo, video or file first.',
  'new posts still require text or an attachment',
);
mustContain(
  'app/post/edit.tsx',
  'Write something or keep a picture first.',
  'edited posts still require text or a picture',
);

// ── Phone pushes: chat, announcements, mentions, calls ────────
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'PUSH_EVENTS',
  'the fanout must split phone pushes from in-app rows',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "'mention',",
  'tagged notifications must reach the phone',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "'call',",
  'calls must reach the phone',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'PUSH_EVENTS.has(event)',
  'only allowlisted events may build push tickets',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "from('notifications').insert",
  'every event must still write in-app rows',
);
mustContain(
  'supabase/migrations/2026111407_call_signals.sql',
  "'event', 'call'",
  'chat calls need a fanout trigger',
);
mustContain(
  'supabase/migrations/2026111901_meeting_video.sql',
  "'event', 'call'",
  'meeting rooms need a fanout trigger',
);

// ── Rich pushes: on-device text + inline reply ───────────────
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'chat-reply',
  'message pushes need the reply category',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  '_contentAvailable',
  'background enrichment needs a wake hint',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'message_id: payload.message_id',
  'enrichment needs the exact message to decrypt',
);
mustContain(
  'lib/richPush.ts',
  'OPHIXE_RICH_PUSH',
  'a background task must upgrade generic pushes',
);
mustContain(
  'lib/richPush.ts',
  'sendPushReply',
  'tray replies need a sealed send path',
);
mustContain(
  'lib/chat.ts',
  'decryptPushBody',
  'enrichment needs single-message decrypt',
);
mustContain(
  'app/_layout.tsx',
  "actionId === 'reply'",
  'tray replies must send into the thread',
);

// ── Suite wiring ───────────────────────────────────────────────
mustContain(
  'package.json',
  'check-post-push-calls',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Post-push-calls gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Post-push-calls guards pass.');
