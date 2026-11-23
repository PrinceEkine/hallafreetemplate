// Guards comment management: authors edit/delete their own comments,
// members report comments to admins, admins delete any comment, and each
// report fans out to the admins' notifications.
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

const MIGRATION = 'supabase/migrations/2026111507_comment_reports.sql';
mustExist(MIGRATION);
if (existsSync(join(ROOT, MIGRATION))) {
  mustContain(
    MIGRATION,
    'comment_reports',
    'reports must persist for admins',
  );
  mustContain(
    MIGRATION,
    'edit comments',
    'authors must be allowed to edit',
  );
  mustContain(
    MIGRATION,
    'trg_comment_report_fanout',
    'reports must fan out to admins',
  );
}

mustContain(
  'lib/engagement.ts',
  'editComment',
  'the app needs an editComment writer',
);
mustContain(
  'lib/engagement.ts',
  'deleteComment',
  'the app needs a deleteComment writer',
);
mustContain(
  'lib/engagement.ts',
  'reportComment',
  'the app needs a reportComment writer',
);
mustContain(
  'app/post/[id].tsx',
  'EDIT',
  'own comments must offer edit',
);
mustContain(
  'app/post/[id].tsx',
  'REPORT',
  'foreign comments must offer report',
);
mustContain(
  'app/post/[id].tsx',
  'DELETE',
  'comments must offer delete',
);
mustContain(
  'supabase/functions/push-fanout/index.ts',
  "'comment_report'",
  'fanout must notify admins of reports',
);
mustContain(
  'app/notifications.tsx',
  "'post'",
  'tapping a report notification must open the post',
);

if (failures.length > 0) {
  console.error(`Comment gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Comment guards pass.');
