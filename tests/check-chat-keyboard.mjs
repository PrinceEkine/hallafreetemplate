// Guards the chat/comment keyboard fix: the composer must sit just above
// the keyboard on both platforms. Android uses adjustResize (the window
// shrinks by itself), so the avoider runs on iOS only: enabling it on
// Android double-shifts the composer far above the keyboard.
// Run: npm test
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

function mustNotContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
if (appJson.expo?.android?.softwareKeyboardLayoutMode !== 'resize') {
  failures.push(
    'app.json expo.android.softwareKeyboardLayoutMode must be "resize" (Android window must shrink for the keyboard)',
  );
}

mustContain(
  'app/chat/[id].tsx',
  'keyboardShouldPersistTaps',
  'taps must reach the composer while the keyboard is open',
);
mustContain(
  'app/chat/[id].tsx',
  'keyboardVerticalOffset',
  'the avoider needs a measured header offset',
);
mustContain(
  'app/chat/[id].tsx',
  "edges={['bottom']}",
  'the composer must respect the bottom safe area',
);
mustContain(
  'app/chat/[id].tsx',
  'maintainVisibleContentPosition',
  'the message list must not jump when the keyboard opens',
);
mustContain(
  'app/chat/[id].tsx',
  "enabled={Platform.OS === 'ios'}",
  'the avoider must run on iOS only (Android resize already shrinks)',
);
mustContain(
  'app/post/[id].tsx',
  "enabled={Platform.OS === 'ios'}",
  'the comment composer must run the avoider on iOS only',
);
mustContain(
  'app/post/[id].tsx',
  'keyboardShouldPersistTaps',
  'comment taps must work while the keyboard is open',
);
mustContain(
  'lib/keyboard.ts',
  'useAndroidKeyboardPad',
  'Android needs a hook that pads the composer when the window does not resize',
);
mustContain(
  'lib/keyboard.ts',
  'keyboardDidShow',
  'the pad must measure the real keyboard height',
);
mustContain(
  'lib/keyboard.ts',
  'Dimensions',
  'the pad must apply only when the window failed to shrink',
);
mustContain(
  'app/chat/[id].tsx',
  'useAndroidKeyboardPad',
  'the chat composer must use the Android keyboard pad',
);
mustContain(
  'lib/keyboard.ts',
  'useKeyboardVisible',
  'the composer must know when the keyboard covers the home bar',
);
mustContain(
  'app/chat/[id].tsx',
  'useKeyboardVisible',
  'the composer must cancel its bottom inset while typing',
);
mustContain(
  'app/post/[id].tsx',
  'useAndroidKeyboardPad',
  'the comment composer must use the Android keyboard pad',
);

if (failures.length > 0) {
  console.error(`Chat keyboard gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Chat keyboard guards pass.');
