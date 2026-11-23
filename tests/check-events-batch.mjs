// Events batch guards: auto-scrolling banner with a past-event fallback,
// admin event editing, 5-working-day auto-delete, the clock time picker,
// and the improved calendar.
// Run: node tests/check-events-batch.mjs
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

const MIGRATION = 'supabase/migrations/2026111901_meeting_video.sql';

// ── Auto-scroll banner + past fallback ───────────────────────────────
mustContain(
  'app/(tabs)/events.tsx',
  'bannerList',
  'the banner pages through events',
);
mustContain(
  'app/(tabs)/events.tsx',
  'setInterval',
  'the banner advances on its own',
);
mustContain(
  'app/(tabs)/events.tsx',
  'bannerDots',
  'the carousel shows its position',
);
mustContain(
  'app/(tabs)/events.tsx',
  'PAST EVENT',
  'no upcoming event still shows a past banner',
);

// ── Event editing ────────────────────────────────────────────────────
mustContain('lib/communityContent.ts', 'updateEvent', 'event edit API');
mustExist('app/event/edit.tsx');
mustContain(
  'app/event/edit.tsx',
  'updateEvent',
  'the edit screen saves through the API',
);
mustContain(
  'app/event/[id].tsx',
  'Edit event',
  'admins reach the edit screen from details',
);

// ── Auto-delete after 5 working days ─────────────────────────────────
mustContain(
  MIGRATION,
  'isodow',
  'the purge must count working days, not calendar days',
);
mustContain(MIGRATION, 'pg_cron', 'the purge runs nightly where possible');
mustContain(
  'app/(tabs)/events.tsx',
  'purgeStaleEvents',
  'the app sweeps stale events on load too',
);

// ── Clock time picker ────────────────────────────────────────────────
mustExist('components/TimePicker.tsx');
mustContain(
  'components/TimePicker.tsx',
  'Tap the hour',
  'the picker walks hours then minutes',
);
mustContain(
  'components/TimePicker.tsx',
  "'AM', 'PM'",
  'the picker keeps AM/PM',
);
mustContain(
  'app/event/new.tsx',
  'TimePicker',
  'new events use the clock picker',
);
mustContain(
  'app/event/personal-new.tsx',
  'TimePicker',
  'to-dos use the clock picker',
);
mustContain(
  'app/event/personal-new.tsx',
  'DatePicker',
  'to-dos share the improved calendar',
);

// ── Improved calendar ────────────────────────────────────────────────
mustContain(
  'components/DatePicker.tsx',
  'cellToday',
  'today stands out on the grid',
);
mustContain(
  'components/DatePicker.tsx',
  'Today:',
  'one tap jumps back to today',
);

// ── Suite wiring ─────────────────────────────────────────────────────
mustContain(
  'package.json',
  'check-events-batch',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Events-batch gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Events-batch guards pass.');
