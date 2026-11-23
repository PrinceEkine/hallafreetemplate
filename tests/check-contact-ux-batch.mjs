// Contact/visibility/media batch guards: member selection opens full
// directory pages, videos play in-app, contact shows the community phone
// number with a support roster, the sidebar highlights the selected
// community, dark mode persists, and profiles stay WhatsApp-style with
// shared-only community visibility.
// Run: node tests/check-contact-ux-batch.mjs
import { existsSync, readFileSync } from 'node:fs';
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

function mustLack(file, needle, why) {
  if (!existsSync(join(ROOT, file))) return;
  if (read(file).includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

// Folder visibility opens a directory page.
mustExist('app/community/visibility-select.tsx');
mustExist('lib/pendingSelection.ts');
mustContain(
  'app/community/visibility-select.tsx',
  'SearchField',
  'the directory is searchable',
);
mustContain(
  'app/community/visibility-select.tsx',
  'setPendingMemberSelection',
  'the pick returns to files',
);
mustContain(
  'app/community/files.tsx',
  'visibility-select',
  'files opens the directory page',
);
mustContain(
  'app/community/files.tsx',
  'takePendingMemberSelection',
  'files collects the returning pick',
);
mustLack(
  'app/community/files.tsx',
  'MemberChecklist',
  'no inline checklist anymore',
);

// Videos play in-app.
mustContain(
  'components/MediaBubble.tsx',
  'pointerEvents="none"',
  'the chat preview lets taps reach the tile',
);
mustContain(
  'components/MediaBubble.tsx',
  '{open && <VideoPlayerView',
  'the player mounts only when opened',
);
mustContain(
  'app/community/media.tsx',
  'expo-video',
  'the gallery plays video in-app',
);
mustContain(
  'app/community/media.tsx',
  'VideoPlayerView',
  'the gallery has an in-app player',
);
mustLack(
  'app/community/media.tsx',
  'openWithSignedUrl',
  'gallery videos no longer bounce to a browser',
);

// Support roster + community phone number.
mustExist('app/community/contact-add.tsx');
mustContain(
  'app/community/contact-add.tsx',
  'setSupportMember',
  'the roster saves support flags',
);
mustContain(
  'app/community/contact.tsx',
  'contact-add',
  'contact opens the support roster page',
);
mustContain(
  'app/community/contact.tsx',
  'COMMUNITY PHONE NUMBER',
  'contact shows the phone number',
);
mustContain(
  'app/community/contact.tsx',
  'tel:',
  'the number is tappable to call',
);
mustContain(
  'lib/communityContent.ts',
  'setSupportMember',
  'support flags have a writer',
);
mustContain(
  'lib/communityContent.ts',
  'is_support',
  'members carry the support flag',
);
mustContain(
  'app/community/edit.tsx',
  'COMMUNITY PHONE NUMBER',
  'admins can set the number',
);
mustContain(
  'supabase/migrations/2026111902_contact_phone_support.sql',
  'is_support',
  'the migration adds the support flag',
);
mustContain(
  'supabase/migrations/2026111902_contact_phone_support.sql',
  'phone',
  'the migration adds the phone column',
);

// Sidebar highlights the selected community.
mustContain(
  'components/DrawerMenu.tsx',
  'railAvatarActive',
  'the active avatar has its own style',
);
mustContain(
  'components/DrawerMenu.tsx',
  'width: 58',
  'the selected community avatar is a touch bigger',
);

// Dark mode with memory.
mustExist('lib/theme.tsx');
mustContain('lib/theme.tsx', 'ThemeProvider', 'the theme has a provider');
mustContain('lib/theme.tsx', 'useColors', 'components read the palette');
mustContain(
  'lib/theme.tsx',
  '@ophixe:theme',
  'the choice is remembered on-device',
);
mustContain('app/_layout.tsx', 'ThemeProvider', 'the root provides the theme');
mustContain(
  'components/ProfileScreen.tsx',
  'DARK MODE',
  'my account has the toggle',
);
mustContain(
  'components/ProfileScreen.tsx',
  'toggleTheme',
  'the toggle flips the theme',
);

// WhatsApp-style profile with shared-only visibility.
mustContain(
  'app/member/[id].tsx',
  'setExpanded(true)',
  'the photo expands fullscreen',
);
mustContain(
  'app/member/[id].tsx',
  'myIds.has(r.community_id)',
  'profiles resolve context from shared communities only',
);
mustContain(
  'app/chat/[id].tsx',
  "pathname: '/member/[id]'",
  'chat headers open the profile',
);

// Member profile: tags, admin tools, call history, shared contacts.
mustContain(
  'app/member/[id].tsx',
  'CALL HISTORY',
  'viewers see the call history',
);
mustLack(
  'app/member/[id].tsx',
  'countUserCommunityGroups',
  'the group count is not part of the profile',
);
mustContain(
  'app/member/[id].tsx',
  'MAKE ADMIN',
  'admins can promote from the profile',
);
mustContain(
  'app/member/[id].tsx',
  'CONTACT DETAILS',
  'profiles show contact details',
);
mustContain(
  'lib/calls.ts',
  'listCallHistoryForUser',
  'call history has a reader',
);
mustContain('lib/calls.ts', 'call_logs', 'calls log history rows');
mustContain(
  'supabase/migrations/2026111903_call_logs.sql',
  'call_logs',
  'the migration adds call history',
);

// Directory: admin toggle + membership tags.
mustContain(
  'app/community/directory.tsx',
  'adminToggle',
  'directory rows carry one admin toggle',
);
mustContain(
  'app/community/directory.tsx',
  'membershipTag',
  'directory rows show membership tags',
);
mustContain(
  'app/community/directory.tsx',
  'REMOVE ADMIN',
  'the admin toggle names its action',
);
mustContain(
  'app/community/directory.tsx',
  'community: id',
  'directory opens profiles in context',
);

// Post photos crop to uniform tiles; tapping opens the full photo.
mustContain(
  'components/PhotoCarousel.tsx',
  'resizeMode="cover"',
  'feed tiles crop to one uniform size',
);
mustContain(
  'components/PhotoCarousel.tsx',
  'resizeMode="contain"',
  'the fullscreen viewer shows the whole photo uncropped',
);
mustLack(
  'components/PhotoCarousel.tsx',
  'aspectRatio',
  'tiles share one fixed size instead of per-photo sizing',
);
mustContain(
  'components/PhotoCarousel.tsx',
  'viewerImage',
  'tapping opens a fullscreen viewer',
);

mustContain('package.json', 'check-contact-ux-batch', 'the check must run in npm test');

if (failures.length > 0) {
  console.error(`Contact-UX batch gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Contact-UX batch guards pass.');
