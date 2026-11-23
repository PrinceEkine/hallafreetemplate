// Phase-1 guards: Ophixe rebrand, no-console hardening, post titles,
// event banners, left-side drawer, centered headers.
// Run: npm test
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.expo' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

// 1. Brand identity in configs.
const appJson = JSON.parse(read('app.json'));
check('app.json name is Ophixe', appJson.expo?.name === 'Ophixe');
check('app.json slug is ophixe', appJson.expo?.slug === 'ophixe');
check('app.json scheme is ophixe', appJson.expo?.scheme === 'ophixe');
check(
  'android package is com.ophixe.app',
  appJson.expo?.android?.package === 'com.ophixe.app',
);
check(
  'ios bundle is com.ophixe.app',
  appJson.expo?.ios?.bundleIdentifier === 'com.ophixe.app',
);
check(
  'package.json name is ophixe',
  JSON.parse(read('package.json')).name === 'ophixe',
);
check(
  'welcome screen says ophixe',
  read('app/index.tsx').includes('>ophixe<'),
);
check(
  'logo mark is the Ophixe mark',
  read('components/Logo.tsx').includes('ophixe-bg'),
);

// 2. No stale brand references in shipped code. The only allowed
// exceptions are the documented legacy storage-key fallbacks (existing
// installs migrate to the ophixe keys on read; E2EE keys stay byte
// identical so testers keep their private keys) and the invite page URL,
// which points at the real GitHub repo path until the website is ready.
const LEGACY_STORAGE_RE =
  /@?halla[_:](e2ee_secret|selectedCommunityId|avatar|cached_|community_modules)/;
const INVITE_URL_RE = /github\.io\/halla\/join\.html/;
for (const file of walk(join(ROOT, 'app'))
  .concat(walk(join(ROOT, 'components')))
  .concat(walk(join(ROOT, 'constants')))
  .concat(walk(join(ROOT, 'lib')))) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (
      /halla/i.test(line) &&
      !LEGACY_STORAGE_RE.test(line) &&
      !INVITE_URL_RE.test(line)
    ) {
      failures.push(`stale brand ref ${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

// 3. Hardening: no console calls in shipped code.
for (const file of walk(join(ROOT, 'app'))
  .concat(walk(join(ROOT, 'components')))
  .concat(walk(join(ROOT, 'lib')))) {
  const rel = relative(ROOT, file);
  if (/console\.(log|warn|error|info|debug)/.test(readFileSync(file, 'utf8'))) {
    failures.push(`console call in shipped code: ${rel}`);
  }
}

// 4. Post titles (item 3).
check(
  'app/post/new.tsx has a title field',
  read('app/post/new.tsx').includes('label="TITLE"'),
);
check(
  'app/post/new.tsx saves the title',
  read('app/post/new.tsx').includes('title: title.trim()'),
);
check(
  'app/(tabs)/feed.tsx renders titles',
  read('app/(tabs)/feed.tsx').includes('SELECT_WITH_TITLE'),
);

// 5. Event banners + expandable calendar (items 4, 8, 9).
check(
  'app/(tabs)/events.tsx shows a banner',
  read('app/(tabs)/events.tsx').includes('EventBanner'),
);
check(
  'app/(tabs)/events.tsx has an expandable calendar',
  read('app/(tabs)/events.tsx').includes('setExpanded'),
);
check(
  'app/event/new.tsx has a date picker',
  read('app/event/new.tsx').includes('DatePicker'),
);
check(
  'app/forms/new.tsx shares the date picker',
  read('app/forms/new.tsx').includes('DatePicker'),
);
check(
  'app/event/new.tsx has a time picker',
  read('app/event/new.tsx').includes('TimePicker'),
);
check(
  'app/event/new.tsx supports banners',
  read('app/event/new.tsx').includes('BANNER (OPTIONAL)'),
);
check(
  'migration 0011 adds event banners',
  read('supabase/migrations/0011_admin_posting.sql').includes('banner_url'),
);

// 6. Drawer on the left with community search (items 23, 28).
check(
  'drawer docks to the left',
  read('components/DrawerMenu.tsx').includes("justifyContent: 'flex-start'"),
);
check(
  'drawer searches communities',
  read('components/DrawerMenu.tsx').includes('Search communities'),
);

// 7. Centered header text + company avatar (items 13, 14).
for (const file of ['components/AppHeader.tsx', 'components/ScreenHeader.tsx']) {
  check(`${file} centers its title`, read(file).includes("position: 'absolute'"));
  check(
    `${file} shows the company avatar`,
    read(file).includes('companyAvatar'),
  );
}

if (failures.length > 0) {
  console.error(`Phase-1 gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Phase-1 checks pass.');
