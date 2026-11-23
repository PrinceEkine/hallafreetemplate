// Chat depth (replies, reactions, receipts) plus push fan-out wiring.
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

mustExist('supabase/functions/push-fanout/index.ts');
mustExist('supabase/migrations/20261108_chat_depth.sql');
mustExist('supabase/migrations/2026110802_push_triggers.sql');
mustExist('scripts/setup-backend.ps1');
mustContain('lib/chat.ts', 'toggleReaction', 'messages must support reactions');
mustContain('lib/chat.ts', 'listReactions', 'reactions must load in bulk');
mustContain('lib/chat.ts', 'getReadStates', 'chats must show read receipts');
mustContain(
  'lib/chat.ts',
  'subscribeToReadStates',
  'receipts must update live',
);
mustContain('lib/chat.ts', 'reply_to', 'messages must support replies');
mustContain(
  'lib/chat.ts',
  'getMessageBodies',
  'reply quotes must resolve parents',
);
mustContain(
  'app/chat/[id].tsx',
  'toggleReaction',
  'chat UI must offer reactions',
);
mustContain('app/chat/[id].tsx', 'setReplyTo', 'chat UI must offer replies');
mustContain(
  'app/chat/[id].tsx',
  'getReadStates',
  'chat UI must load receipts',
);
mustContain('app/chat/[id].tsx', 'Seen', 'chat UI must render receipts');
mustContain(
  'app/_layout.tsx',
  "parsed.route === 'community'",
  'push taps must deep-link communities',
);
mustContain(
  'app/_layout.tsx',
  "parsed.route === 'event'",
  'push taps must deep-link events',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  'exp.host',
  'fan-out must deliver via Expo push',
);
mustContain(
  'supabase/migrations/2026110802_push_triggers.sql',
  'net.http_post',
  'triggers must call the fan-out function',
);
mustContain(
  'scripts/setup-backend.ps1',
  'functions deploy push-fanout',
  'setup must deploy the fan-out function',
);
mustContain(
  'scripts/setup-backend.ps1',
  'app_settings',
  'setup must store the fan-out secret',
);
mustContain(
  'supabase/migrations/2026110803_fanout_config.sql',
  'post_fanout',
  'fanout config must define the trigger caller',
);
mustContain(
  'supabase/migrations/20261108_chat_depth.sql',
  'message_reactions',
  'migration must create reactions',
);

if (failures.length > 0) {
  console.error(`Chat depth gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat depth and push guards pass.');
