// Ophixe Media on-device guards: chat photos/videos auto-save to a
// gallery album and documents to a device folder (deduped per message,
// behind an auto-save toggle); viewers and file rows offer manual save
// and share; the policy discloses the on-device copies.
// Run: node tests/check-ophixe-media.mjs
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

// ── Device media library ───────────────────────────────────────
mustExist('lib/deviceMedia.ts');
mustContain(
  'lib/deviceMedia.ts',
  "OPHIXE_ALBUM = 'Ophixe Media'",
  'gallery saves land in one named album',
);
mustContain(
  'lib/deviceMedia.ts',
  'autoSaveChatMedia',
  'decrypted attachments need one background save entry point',
);
mustContain(
  'lib/deviceMedia.ts',
  'saveChatMediaNow',
  'viewer SAVE buttons need an explicit save entry point',
);
mustContain(
  'lib/deviceMedia.ts',
  '@ophixe:media_saved',
  'saves must dedup per message',
);
mustContain(
  'lib/deviceMedia.ts',
  'requestPermissionsAsync(true)',
  'gallery saves must ask write-only, never read the library',
);
mustContain(
  'lib/deviceMedia.ts',
  'StorageAccessFramework',
  'Android documents need a visible shared folder',
);
mustContain(
  'lib/deviceMedia.ts',
  'getAutoSaveEnabled',
  'auto-save needs a user toggle',
);
mustContain(
  'lib/media.ts',
  'autoSaveChatMedia',
  'every decrypted attachment must attempt the on-device save',
);

// ── Bubble save/share UI ───────────────────────────────────────
mustContain(
  'components/MediaBubble.tsx',
  'saveChatMediaNow',
  'bubbles must offer manual save',
);
mustContain(
  'components/MediaBubble.tsx',
  'expo-sharing',
  'documents need a share-out path',
);
mustContain(
  'components/MediaBubble.tsx',
  'Save file to device',
  'file rows need a save affordance',
);
mustContain(
  'components/ProfileScreen.tsx',
  'AUTO-SAVE MEDIA',
  'my account needs the auto-save switch',
);
mustContain(
  'components/ProfileScreen.tsx',
  'DOCUMENTS FOLDER',
  'my account offers the docs folder picker',
);

// ── Permission copy + disclosure ───────────────────────────────
mustContain(
  'app.json',
  'Ophixe Media album',
  'the OS prompt must name where media goes',
);
mustContain(
  'lib/legal.ts',
  'Ophixe Media album or folder',
  'the policy must disclose on-device copies',
);
mustContain(
  'website/privacy.html',
  'Ophixe Media album or folder',
  'the public policy must match the in-app one',
);

// ── Any file incl. APK install ─────────────────────────────────
mustContain(
  'lib/media.ts',
  'MAX_CHAT_FILE_BYTES',
  'documents need headroom past the media cap',
);
mustContain(
  'app/chat/[id].tsx',
  'MAX_CHAT_FILE_BYTES',
  'sending must size the cap by file kind',
);
mustContain(
  'components/MediaBubble.tsx',
  'getContentUriAsync',
  'installs need a shareable content URI',
);
mustContain(
  'components/MediaBubble.tsx',
  'android.intent.action.VIEW',
  'APKs must open the system installer',
);
mustContain(
  'components/MediaBubble.tsx',
  'Only install files from people you trust',
  'packages install behind a trust prompt',
);
mustContain(
  'modules/call-keepalive/android/src/main/AndroidManifest.xml',
  'REQUEST_INSTALL_PACKAGES',
  'the installer flow needs its manifest permission',
);

// ── Suite wiring ───────────────────────────────────────────────
mustContain(
  'package.json',
  'check-ophixe-media',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Ophixe-media gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Ophixe-media guards pass.');
