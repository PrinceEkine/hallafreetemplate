// Event media guards: tappable event artwork with a fullscreen viewer,
// plus video banners end to end (pick, upload, list tile, detail player).
// Run: node tests/check-event-media.mjs
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

const MIGRATION = 'supabase/migrations/2026112001_event_banner_video.sql';

// ── Backend: banner kind ──────────────────────────────────────────
mustExist(MIGRATION);
mustContain(
  MIGRATION,
  'banner_kind',
  'events must record whether the banner is an image or a video',
);
mustContain(
  'lib/communityContent.ts',
  'banner_kind',
  'the event API reads and writes the banner kind',
);
mustContain(
  'lib/communityContent.ts',
  'bannerKind',
  'create/update accept the banner kind',
);

// ── Detail: tap artwork to view ───────────────────────────────────
mustContain(
  'app/event/[id].tsx',
  'onPress',
  'the event artwork must be tappable',
);
mustContain(
  'app/event/[id].tsx',
  'Modal',
  'tapping opens a fullscreen viewer',
);
mustContain(
  'app/event/[id].tsx',
  'VideoView',
  'the viewer plays video banners in-app',
);

// ── Banner tile: video shows a playable tile ──────────────────────
mustContain(
  'components/EventBanner.tsx',
  'kind',
  'the banner knows image from video',
);
mustContain(
  'components/EventBanner.tsx',
  'VideoView',
  'video banners render a first-frame tile, not a blank box',
);
mustContain(
  'components/EventBanner.tsx',
  'play',
  'video tiles carry a play affordance',
);

// ── Create/edit: video pick + upload ──────────────────────────────
for (const screen of ['app/event/new.tsx', 'app/event/edit.tsx']) {
  mustContain(
    screen,
    'video/*',
    'the picker must offer videos as well as images',
  );
  mustContain(
    screen,
    'MAX_MEDIA_BYTES',
    'video banners use the media size cap, not the image cap',
  );
  mustContain(
    screen,
    'bannerKind',
    'the picked kind is stored with the event',
  );
}

// ── Lists: kind flows to the tile ─────────────────────────────────
mustContain(
  'app/(tabs)/events.tsx',
  'banner_kind',
  'the list reads the banner kind',
);
mustContain(
  'app/(tabs)/events.tsx',
  'bannerKind',
  'the list passes the kind to the banner tile',
);

// ── Suite wiring ──────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-event-media',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Event-media gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Event-media guards pass.');
