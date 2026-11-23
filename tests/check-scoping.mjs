// The sidebar lives on the left, and every action scopes to the selected
// community instead of asking the user to pick one.
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

// Sidebar on the left.
mustContain(
  'components/DrawerMenu.tsx',
  "justifyContent: 'flex-start'",
  'drawer panel must anchor left',
);
mustContain(
  'components/DrawerMenu.tsx',
  "flexDirection: 'row-reverse'",
  'community rail must sit on the left edge',
);
mustContain(
  'components/DrawerMenu.tsx',
  '(-PANEL_WIDTH)',
  'drawer must slide in from the left',
);
mustNotContain(
  'components/DrawerMenu.tsx',
  "justifyContent: 'flex-end'",
  'drawer must not anchor right',
);

// Action screens use the selected community, no pickers.
for (const file of [
  'app/forms/new.tsx',
  'app/chat/group-new.tsx',
  'app/wallet/due-new.tsx',
  'app/chat/new.tsx',
  'app/community/task-new.tsx',
  'app/community/project-new.tsx',
]) {
  mustContain(
    file,
    'resolveSelectedCommunityId',
    'actions must scope to the selected community',
  );
}
mustNotContain(
  'app/forms/new.tsx',
  'SEND TO',
  'staff request must not ask where to send',
);
mustNotContain(
  'app/forms/new.tsx',
  'setPicked',
  'staff request must not list communities',
);
mustNotContain(
  'app/chat/group-new.tsx',
  '>COMMUNITY</Text>',
  'group create must not list communities',
);
mustNotContain(
  'app/wallet/due-new.tsx',
  '>COMMUNITY</Text>',
  'due create must not list communities',
);
mustNotContain(
  'app/wallet/due-new.tsx',
  'setPicked',
  'due create must not list communities',
);

// Lists follow the selection too.
mustContain(
  'app/(tabs)/chat.tsx',
  'it.community_id === selectedId',
  'DM list must follow the selected community',
);
mustContain(
  'app/forms/index.tsx',
  'listCommunityMySubmissions',
  'forms hub must scope requests to the selected community',
);
mustContain(
  'app/forms/index.tsx',
  'listCommunityPendingApprovals',
  'forms hub must scope approvals to the selected community',
);
mustNotContain(
  'app/forms/index.tsx',
  'listMySubmissions(',
  'forms hub must not list requests across communities',
);
mustNotContain(
  'app/forms/index.tsx',
  'listPendingApprovals(',
  'forms hub must not list approvals across communities',
);
mustContain(
  'app/wallet/index.tsx',
  'myDues(scoped)',
  'wallet dues must scope to the selected community',
);
mustContain(
  'lib/wallet.ts',
  'myDues(communityId?: string | null)',
  'myDues must accept a community scope',
);
mustContain(
  'app/member/[id].tsx',
  'useSelectedCommunityId',
  'member DM must prefer the selected community',
);

if (failures.length > 0) {
  console.error(`Scoping gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Sidebar is left and actions scope to the selected community.');
