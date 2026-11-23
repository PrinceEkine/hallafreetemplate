// Every secondary screen for launch must exist and be wired.
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (!content.includes(needle)) {
    failures.push(`${file} must contain ${needle} (${why})`);
  }
}

for (const file of [
  'app/community/discover.tsx',
  'app/community/task-new.tsx',
  'app/community/project-new.tsx',
  'app/community/edit.tsx',
  'app/event/new.tsx',
  'app/event/[id].tsx',
  'lib/uploads.ts',
  'lib/e2ee.ts',
  'lib/communityContent.ts',
  'supabase/migrations/2026110801_community_modules.sql',
  'assets/brand/icon.png',
  'assets/brand/adaptive-icon.png',
  'scripts/gen-icons.mjs',
]) {
  mustExist(file);
}

mustContain(
  'app/post/new.tsx',
  'uploadToBucket',
  'posts must support pictures',
);
mustContain(
  'app/announce/new.tsx',
  'uploadToBucket',
  'announcements must support pictures',
);
mustContain(
  'components/ProfileScreen.tsx',
  'uploadMyAvatar',
  'profiles must support a picture',
);
mustContain(
  'app/community/discover.tsx',
  'requestToJoin',
  'discovery must offer join requests',
);
mustContain(
  'app/(tabs)/teams.tsx',
  '/community/discover',
  'discovery must be reachable',
);
mustContain(
  'app/community/[id].tsx',
  'listCommunityGroups',
  'a community must show its groups',
);
mustContain(
  'app/chat/group-new.tsx',
  'useLocalSearchParams',
  'group create must accept a preselected community',
);
mustContain('lib/chat.ts', 'getDmPeerInfo', 'DMs must resolve peer keys');
mustContain('lib/chat.ts', 'getMessagesBefore', 'chat must page history');
mustContain(
  'lib/chat.ts',
  'listCommunityGroups',
  'communities must list their groups',
);
mustContain(
  'app/chat/[id].tsx',
  'encryptForPeer',
  'DMs must encrypt before send',
);
for (const file of [
  'app/(tabs)/teams.tsx',
  'app/(tabs)/chat.tsx',
  'app/(tabs)/feed.tsx',
  'app/(tabs)/events.tsx',
  'app/(tabs)/update.tsx',
]) {
  mustContain(file, 'setQuery', 'tab search must be wired to state');
}
mustContain('app/_layout.tsx', 'Sentry.init', 'crashes must report to Sentry');
if (
  readFileSync(join(ROOT, 'app.json'), 'utf8').includes(
    '@sentry/react-native/expo',
  )
) {
  failures.push(
    'app.json must not contain @sentry/react-native/expo (the unconfigured plugin fails Android builds; reinstall only with a Sentry org/project/token)',
  );
}
mustContain(
  'package.json',
  '@sentry/react-native',
  'Sentry dependency must be declared',
);
mustContain(
  'components/premium.tsx',
  'uri',
  'Avatar must support photo URLs with letter fallback',
);
mustContain(
  'components/AppHeader.tsx',
  'getMyAvatarUrl',
  'tab header must load the real profile photo',
);
mustContain(
  'components/ScreenHeader.tsx',
  'getMyAvatarUrl',
  'screen header must load the real profile photo',
);
mustContain(
  'app/(tabs)/chat.tsx',
  'avatarUrl',
  'chat list must show peer photos',
);
mustContain(
  'app/chat/[id].tsx',
  'avatarUrl',
  'message bubbles must show sender photos',
);

if (failures.length > 0) {
  console.error(`Screen gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('All launch screens are present and wired.');
