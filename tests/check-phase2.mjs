// Phase-2 guards: chat split + timestamps, groups, folders, media filters,
// form links, meetings, tasks/personal events, contact, pay, notifications,
// logos, pin/low-priority/archive.
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
};

const MIGRATION = 'supabase/migrations/0012_phase2.sql';
check('migration 0012 exists', existsSync(join(ROOT, MIGRATION)));
const mig = existsSync(join(ROOT, MIGRATION)) ? read(MIGRATION) : '';

// Chat split + WhatsApp-style times/date lines (items 5, 26).
check(
  'chat tab lists DMs only',
  read('app/(tabs)/chat.tsx').includes('.filter((it) => !it.is_group)'),
);
check(
  'chat shows clock times',
  read('app/chat/[id].tsx').includes('clockTime(item.created_at)'),
);
check(
  'chat shows date lines',
  read('app/chat/[id].tsx').includes('dayLineText'),
);

// Groups: create entry points, discovery, join (items 6, 12).
check(
  'teams has a group button',
  read('app/(tabs)/teams.tsx').includes("'/chat/group-new'"),
);
check('lib/chat.ts can join groups', read('lib/chat.ts').includes('joinGroup'));
check(
  'community page offers join',
  read('app/community/[id].tsx').includes('handleJoinGroup'),
);
check(
  'members can read community groups',
  mig.includes('Community members can read community groups'),
);

// Files folders-first (item 16).
check(
  'files requires a folder first',
  read('app/community/files.tsx').includes('Create a folder first'),
);
check(
  'files can create folders',
  read('app/community/files.tsx').includes('createFolder'),
);
check('migration adds folders', mig.includes('community_file_folders'));

// Media auto-gallery (item 17, revised): pictures and videos shared in
// the community appear on their own; nothing is added by hand.
for (const label of ['PHOTOS', 'VIDEOS']) {
  check(
    `media has a ${label} filter`,
    read('app/community/media.tsx').includes(`'${label}'`) ||
      read('app/community/media.tsx').includes(`"${label}"`),
  );
}
check(
  'media pulls post pictures automatically',
  read('lib/communityContent.ts').includes('listCommunityGallery'),
);
check(
  'media can download to the gallery',
  read('app/community/media.tsx').includes('DOWNLOAD'),
);
check(
  'media has no manual link saving',
  !read('app/community/media.tsx').includes('addMediaLink'),
);

// Google-form links (item 18).
check(
  'forms hub lists form links',
  read('app/forms/index.tsx').includes('Form links'),
);
check(
  'forms hub can add links',
  read('app/forms/index.tsx').includes('createFormLink'),
);
check('migration adds form links', mig.includes('community_form_links'));

// Meeting rooms (item 20).
check(
  'module is relabeled MEETING',
  read('lib/communityModules.ts').includes("label: 'MEETING'"),
);
check(
  'meeting screen lists rooms',
  read('app/community/actions.tsx').includes('listMeetings'),
);
check(
  'meeting screen seeds defaults',
  read('app/community/actions.tsx').includes('Management Meeting Room'),
);
check('migration adds meetings', mig.includes('community_meetings'));

// Tasks in Events + personal events (items 24, 25).
check(
  'events tab shows my tasks',
  read('app/(tabs)/events.tsx').includes('listMyTasks'),
);
check(
  'events tab shows personal events',
  read('app/(tabs)/events.tsx').includes('listPersonalEvents'),
);
check('personal-new screen exists', existsSync(join(ROOT, 'app/event/personal-new.tsx')));
check('migration adds personal events', mig.includes('personal_events'));

// Contact owners/admins (item 21).
check(
  'contact manages visibility',
  read('app/community/contact.tsx').includes('setContactVisibility'),
);
check('migration adds contact flags', mig.includes('show_in_contact'));

// Pay paid-lists (item 22).
check(
  'wallet shows paid lists',
  read('app/wallet/index.tsx').includes('PAID LIST'),
);
check('lib/wallet.ts lists payers', read('lib/wallet.ts').includes('listDuePayers'));

// Notifications feed + settings (items 15, 31).
check(
  'notifications reads the feed',
  read('app/notifications.tsx').includes('listNotifications'),
);
check(
  'notifications no longer lists announcements',
  !read('app/notifications.tsx').includes("from('announcements')"),
);
check(
  'profile has notification settings',
  read('components/ProfileScreen.tsx').includes('saveNotificationPrefs'),
);
check(
  'fan-out honors prefs',
  read('supabase/functions/push-fanout/index.ts').includes('notification_prefs'),
);
check(
  'fan-out writes feed rows',
  read('supabase/functions/push-fanout/index.ts').includes("from('notifications')"),
);
check('migration adds notifications', mig.includes('create table if not exists public.notifications'));

// Community logos (item 27).
check(
  'create community uploads a logo',
  read('app/community/new.tsx').includes('uploadCommunityLogo'),
);
check(
  'create community drops sidebar picks',
  !read('app/community/new.tsx').includes('SIDEBAR SECTIONS'),
);
check(
  'community page shows the logo',
  read('app/community/[id].tsx').includes('logo_url'),
);
check('migration adds logos', mig.includes('logo_url'));

// Pin / low priority / archive (items 29, 30).
check(
  'community page pins',
  read('app/community/[id].tsx').includes("handlePrefToggle('pinned')"),
);
check(
  'community page has low priority',
  read('app/community/[id].tsx').includes('LOW PRIORITY'),
);
check(
  'drawer orders communities',
  read('components/DrawerMenu.tsx').includes('getOrderedCommunities'),
);
check(
  'profile lists archived',
  read('components/ProfileScreen.tsx').includes('ARCHIVED COMMUNITIES'),
);
check('migration adds prefs', mig.includes('community_prefs'));

if (failures.length > 0) {
  console.error(`Phase-2 gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Phase-2 checks pass.');
