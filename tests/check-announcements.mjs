// Guards announcement-to-post links: posts can also go out as linked
// announcements, SEE MORE opens the post only when linked, announcements
// show their time, and announcements carry up to 4 pictures.
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

function mustNotContain(file, needle, why) {
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

const MIGRATION = 'supabase/migrations/2026111506_announcement_post.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'post_id',
    'announcements must link to a post',
  );
}

mustContain(
  'app/(tabs)/update.tsx',
  'SEE MORE',
  'linked announcements must offer SEE MORE',
);
mustContain(
  'app/(tabs)/update.tsx',
  'postId',
  'the feed must track the linked post',
);
mustContain(
  'app/(tabs)/update.tsx',
  'item.time',
  'announcements must show their time',
);
mustContain(
  'app/post/new.tsx',
  'ALSO POST AS ANNOUNCEMENT',
  'post creation must offer the announcement toggle',
);
mustContain(
  'app/post/new.tsx',
  'post_id',
  'the toggle must link the announcement to the post',
);
mustContain(
  'app/announce/[id].tsx',
  'SEE MORE',
  'linked announcement detail must link to the post',
);
mustContain(
  'app/announce/new.tsx',
  'Attach pictures',
  'announcements must take pictures',
);
mustContain(
  'app/announce/new.tsx',
  'Up to 4 pictures per announcement',
  'announcements cap pictures at 4',
);
mustContain(
  'app/announce/[id].tsx',
  'PhotoCarousel',
  'announcement detail must show pictures in a carousel',
);
mustNotContain(
  'app/(tabs)/update.tsx',
  'PhotoCarousel',
  'list cards must hide pictures until tapped open',
);

if (failures.length > 0) {
  console.error(`Announcement gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Announcement guards pass.');
