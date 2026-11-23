// Tab badge guards: every tab icon carries its unread number, and
// tapping the icon clears it until genuinely new activity lands.
// Run: node tests/check-tab-badges.mjs
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

mustExist('lib/tabBadges.ts');
mustContain(
  'lib/tabBadges.ts',
  'getTabBadgeCounts',
  'one counter feeds every tab icon',
);
mustContain(
  'lib/tabBadges.ts',
  'markTabSeen',
  'tapping a tab must mark it read',
);
mustContain(
  'lib/tabBadges.ts',
  "count: 'exact', head: true",
  'new-post counts must not download rows',
);
const TABS = ['chat', 'teams', 'feed', 'update', 'events'];
for (const tab of TABS) {
  mustContain(
    'app/(tabs)/_layout.tsx',
    `badgeLabel(badges.${tab})`,
    `the ${tab} icon needs its number`,
  );
  mustContain(
    'app/(tabs)/_layout.tsx',
    `handleTabPress('${tab}')`,
    `tapping ${tab} must clear its number`,
  );
}

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-tab-badges',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Tab-badge gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Tab-badge guards pass.');
