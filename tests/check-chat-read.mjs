// Chat read-state + upload guards: own sent messages must never show as
// unread, threads must re-mark read on focus and on incoming messages while
// open, read receipts must update live, and uploads must use the current
// expo-file-system API (getInfoAsync is removed, not just deprecated).
// Run: node tests/check-chat-read.mjs
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

function mustNotContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) return;
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

mustExist('supabase/migrations/20261113_chat_read.sql');
mustContain(
  'supabase/migrations/20261113_chat_read.sql',
  'last_message_sender',
  'the chat list needs the last sender to suppress self-unread',
);
mustContain(
  'supabase/migrations/20261113_chat_read.sql',
  'supabase_realtime',
  'read receipts must stream live',
);
mustContain(
  'lib/chat.ts',
  'last_message_sender',
  'unread must be suppressed when the last message is mine',
);
mustContain(
  'lib/chat.ts',
  'await markRead(conversationId)',
  'sending must mark my own read state',
);
mustContain(
  'app/chat/[id].tsx',
  'useFocusEffect',
  'threads must re-mark read when focused again',
);
mustContain(
  'app/chat/[id].tsx',
  'markRead(id).catch',
  'incoming messages while viewing must mark read',
);
mustContain(
  'lib/uploads.ts',
  'new File(',
  'uploads must use the current expo-file-system File API',
);
mustNotContain(
  'lib/uploads.ts',
  'getInfoAsync',
  'the legacy filesystem call throws on current Expo SDKs',
);
mustNotContain(
  'lib/uploads.ts',
  'readAsStringAsync',
  'the legacy filesystem call throws on current Expo SDKs',
);
mustContain(
  'lib/forms.ts',
  'new File(',
  'evidence uploads must use the current expo-file-system File API',
);
mustNotContain(
  'lib/forms.ts',
  'getInfoAsync',
  'the legacy filesystem call throws on current Expo SDKs',
);

if (failures.length > 0) {
  console.error(`Chat read/upload gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat read and upload guards pass.');
