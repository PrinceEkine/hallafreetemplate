// Nav guards: selected-community store, per-tab scoping, back targets, lifted tab bar.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const failures = [];
const check = (name, file, pattern) => {
  if (!pattern.test(read(file))) failures.push(`${name} (${file})`);
};

check(
  'selected store exports resolver',
  'lib/selectedCommunity.ts',
  /export (async )?function resolveSelectedCommunityId/,
);
check(
  'selected store exports hook',
  'lib/selectedCommunity.ts',
  /export function useSelectedCommunityId/,
);
check(
  'drawer switches selection',
  'components/DrawerMenu.tsx',
  /setSelectedCommunityId/,
);
check(
  'drawer returns to selected home',
  'components/DrawerMenu.tsx',
  /router\.replace\('\/feed'\)/,
);
check('header back override', 'components/ScreenHeader.tsx', /backTo/);
for (const tab of ['feed', 'update', 'events', 'chat', 'teams']) {
  check(
    `${tab} tab scopes to selection`,
    `app/(tabs)/${tab}.tsx`,
    /resolveSelectedCommunityId|useSelectedCommunityId/,
  );
}
for (const section of [
  'directory',
  'actions',
  'task',
  'media',
  'files',
  'approval',
  'project',
  'contact',
  'polls',
]) {
  check(
    `${section} back target`,
    `app/community/${section}.tsx`,
    /backTo="\/feed"/,
  );
}
check(
  'community profile back target',
  'app/community/[id].tsx',
  /backTo="\/feed"/,
);
check('tab bar lifted', 'app/(tabs)/_layout.tsx', /height: 78/);

if (failures.length > 0) {
  console.error(`nav check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('nav check passed');
