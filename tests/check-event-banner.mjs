// Guards the events banner: the top banner must open the event details
// when tapped, and an image banner must still show what the event is
// (kicker, title, date) instead of a bare picture.
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

mustContain(
  'components/EventBanner.tsx',
  'onPress',
  'the banner must accept a press handler',
);
mustContain(
  'components/EventBanner.tsx',
  'Pressable',
  'a tappable banner must be wrapped in Pressable',
);
mustContain(
  'components/EventBanner.tsx',
  'accessibilityLabel',
  'a tappable banner must stay accessible',
);
mustContain(
  'components/EventBanner.tsx',
  'kicker',
  'an image banner must overlay a label, not just a picture',
);
mustContain(
  'app/(tabs)/events.tsx',
  'bannerEvent.id',
  'the top banner must navigate to its own event',
);
mustContain(
  'app/(tabs)/events.tsx',
  'UPCOMING EVENT',
  'the top banner must label itself as the upcoming event',
);

if (failures.length > 0) {
  console.error(`Event banner gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Event banner guards pass.');
