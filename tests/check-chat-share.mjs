// Chat share guards: WhatsApp-style caption preview (+ recent-media
// carousel) before photo/video send, copy + forward from the long-press
// menu, a bundled sticker pack, and GIF search via Giphy.
// Run: node tests/check-chat-share.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

// ── Caption preview ────────────────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'Add caption',
  'the preview caption field uses WhatsApp wording',
);
mustContain(
  'app/chat/[id].tsx',
  'pendingPick',
  'picks preview before they send',
);
mustContain(
  'lib/media.ts',
  'caption',
  'captions travel inside the media descriptor',
);
mustContain(
  'components/MediaBubble.tsx',
  'caption',
  'received photos show their caption',
);

// ── Recent-media carousel on the preview ───────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'getAssetsAsync',
  'the preview offers recent photos and videos',
);
mustContain(
  'app/chat/[id].tsx',
  'recentAssets',
  'recent media render as a swappable carousel',
);

// ── Copy ───────────────────────────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'expo-clipboard',
  'copy uses the shared clipboard module',
);
mustContain(
  'app/chat/[id].tsx',
  'setStringAsync',
  'copy writes the decrypted text',
);

// ── Forward ────────────────────────────────────────────────────────
mustContain(
  'app/chat/[id].tsx',
  'forwardMessage',
  'forward re-sends through the normal path',
);
mustContain(
  'app/chat/[id].tsx',
  'Forward',
  'the long-press menu offers forward',
);
mustContain(
  'lib/media.ts',
  'copyCipherBytes',
  'forwarded files are re-homed, never re-encrypted',
);

// ── Stickers ───────────────────────────────────────────────────────
mustExist('lib/stickers.ts');
mustContain(
  'lib/stickers.ts',
  'stickerDescriptor',
  'stickers serialize like other attachments',
);
mustContain(
  'app/chat/[id].tsx',
  'parseStickerDescriptor',
  'threads render sticker messages',
);
const stickerDir = join(ROOT, 'assets/stickers');
if (!existsSync(stickerDir)) {
  failures.push('missing directory: assets/stickers (bundled pack)');
} else {
  const art = readdirSync(stickerDir).filter((f) => f.endsWith('.png'));
  if (art.length < 16) {
    failures.push(`assets/stickers holds ${art.length} pngs, need at least 16`);
  }
}

// ── GIFs ───────────────────────────────────────────────────────────
mustExist('lib/gifs.ts');
mustContain('lib/gifs.ts', 'giphy.com', 'GIF search provider');
mustContain(
  'app/chat/[id].tsx',
  'EXPO_PUBLIC_GIPHY_KEY',
  'the GIF tab degrades without a key',
);

// ── Suite wiring ───────────────────────────────────────────────────
mustContain('package.json', 'check-chat-share', 'the check must run in npm test');

if (failures.length > 0) {
  console.error(`Chat-share gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat-share guards pass.');
