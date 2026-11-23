// Batch A guards: join copy, drawer close removal, member counts,
// tag moves, announcement size/shadow, compact search, discover
// excerpts, white default wallpaper, back-to-home, forms side nav,
// audio-first rooms, tappable community website.
// Run: node tests/check-batch-a.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

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

function mustLack(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

// -- Join copy + drawer close --------------------------------------
mustContain(
  'app/community/join.tsx',
  'Join a community',
  'join screen carries the new name',
);
mustContain(
  'components/DrawerMenu.tsx',
  'JOIN A COMMUNITY',
  'drawer entry matches the join screen',
);
mustLack(
  'components/DrawerMenu.tsx',
  'name="close" size={22}',
  'no X beside the community name in the drawer',
);

// -- Directory counts + tags -----------------------------------------
mustContain(
  'app/community/directory.tsx',
  'MEMBERS (${active.length})',
  'member count sits beside the heading',
);
mustContain(
  'app/community/directory.tsx',
  'rightCol',
  'the membership tag moves to the admin-toggle side',
);
mustLack(
  'app/community/directory.tsx',
  'SUPPORT',
  'support chips are gone from directory rows',
);
mustContain(
  'app/member/[id].tsx',
  '{roleTag ? (',
  'profiles keep the membership tag on the right',
);
mustLack(
  'app/member/[id].tsx',
  '>SUPPORT</Text>',
  'support chips are gone from profiles',
);

// -- Announcements -----------------------------------------------------
mustContain(
  'app/(tabs)/update.tsx',
  'height: 60',
  'announcement cards share one uniform height',
);
mustContain(
  'app/(tabs)/update.tsx',
  'shadowOpacity: 0.08',
  'announcement cards carry a soft shadow',
);

// -- Compact search ------------------------------------------------------
mustContain(
  'components/premium.tsx',
  'height: 34',
  'search bars stay compact everywhere',
);

// -- Discover excerpts -----------------------------------------------------
mustContain(
  'app/community/discover.tsx',
  'slice(0, 80)',
  'discover rows show an about excerpt instead of OPEN',
);

// -- White default wallpaper -----------------------------------------------
mustContain(
  'lib/wallpaper.ts',
  'defaultWallpaperColor',
  'the default background resolves to white',
);
mustContain(
  'app/chat/[id].tsx',
  "wallpaper.type === 'default' ? (",
  'threads render the default as a plain color',
);
mustContain(
  'app/chat/wallpaper.tsx',
  'Default white',
  'the picker names the white default',
);

// -- Back-to-home + forms nav -----------------------------------------------
mustContain(
  'app/wallet/index.tsx',
  'showMenu backTo="/feed"',
  'wallet backs home like other modules',
);
mustContain(
  'app/forms/index.tsx',
  'showMenu backTo="/feed"',
  'forms backs home like other modules',
);
mustContain(
  'app/forms/new.tsx',
  'showMenu',
  'form flows keep the side navigation',
);
mustContain(
  'app/forms/[id].tsx',
  'showMenu',
  'form details keep the side navigation',
);

// -- Audio-first rooms -------------------------------------------------------
mustContain(
  'app/community/actions.tsx',
  'Rooms always open audio-first',
  'meetings join as audio calls',
);

// -- Tappable website ----------------------------------------------------------
mustContain(
  'app/community/[id].tsx',
  'handleWebsite',
  'members tap through to the community site',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-batch-a',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Batch-A gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Batch-A guards pass.');
