// Chat-thread UX guards: no bottom jump bar inside chat flows (threads use
// the header back button), an icon-led attach sheet with camera capture
// instead of emoji buttons, and storage failures in plain language.
// Run: node tests/check-chat-thread-ux.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

function mustContain(file, needle, why) {
  if (!read(file).includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

function mustNotContain(file, needle, why) {
  if (read(file).includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

// ── No jump bar inside chat flows ───────────────────────────────────
mustContain(
  'components/QuickNav.tsx',
  "'chat'",
  'threads, new chat, and wallpaper must hide the jump bar',
);
mustContain(
  'components/QuickNav.tsx',
  "'Chat'",
  'the Chat destination stays in the bar for other screens',
);
mustContain(
  'app/_layout.tsx',
  '<QuickNav />',
  'the bar still renders under other inner screens',
);
mustNotContain(
  'components/QuickNav.tsx',
  'itemActive',
  'the bar matches the tab bar: tinted icons, no pill',
);

// ── Attach sheet: icons, not emoji ──────────────────────────────────
mustNotContain(
  'app/chat/[id].tsx',
  '📷',
  'attach options use icons, not emoji',
);
mustNotContain(
  'app/chat/[id].tsx',
  '📄',
  'attach options use icons, not emoji',
);
mustContain(
  'app/chat/[id].tsx',
  'attachDropdown',
  'attach options render as a dropdown at the plus sign',
);
mustContain(
  'app/chat/[id].tsx',
  'Take photo or video',
  'users can snap a picture or record a clip without leaving chat',
);
mustContain(
  'app/chat/[id].tsx',
  'launchCameraAsync',
  'camera capture path',
);
mustContain(
  'app/chat/[id].tsx',
  'pickPhotoVideo',
  'the photo/video library path stays',
);
mustContain(
  'app/chat/[id].tsx',
  'pickDocument',
  'the document path stays',
);
mustContain(
  'app/chat/[id].tsx',
  'Encrypting and uploading',
  'uploads show progress instead of failing silently',
);

// ── Friendly upload/download errors ─────────────────────────────────
mustContain(
  'lib/media.ts',
  'friendlyMediaError',
  'storage failures map to plain language',
);
mustContain(
  'lib/media.ts',
  'Bucket not found',
  'the missing-bucket case is handled',
);
mustContain(
  'app/chat/[id].tsx',
  'friendlyMediaError',
  'threads show the friendly message',
);

// ── Suite wiring ────────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-chat-thread-ux',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Chat-thread UX gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat-thread UX guards pass.');
