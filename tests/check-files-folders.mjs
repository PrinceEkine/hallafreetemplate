// Files must be folder-first: folders render as a grid (not filter chips),
// tapping a folder opens it and uploads land inside it, only admins create
// folders, and files plus folders carry All / Admin / select-members
// visibility. Run: node tests/check-files-folders.mjs
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

function mustNotContain(file, needle, why) {
  if (!existsSync(join(ROOT, file))) return;
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

mustExist('supabase/migrations/20261114_file_visibility.sql');
mustContain(
  'supabase/migrations/20261114_file_visibility.sql',
  'visibility',
  'files and folders need a visibility model',
);
mustContain(
  'supabase/migrations/20261114_file_visibility.sql',
  'Admins can create folders',
  'folder creation must be admin-only in RLS',
);
mustContain(
  'lib/communityContent.ts',
  'visibility',
  'file helpers must carry visibility',
);
mustContain(
  'lib/communityContent.ts',
  'file_visible_members',
  'select-members visibility needs a member table',
);
mustContain(
  'lib/communityContent.ts',
  'Only admins can create folders',
  'folder creation must be admin-guarded in the app layer',
);
mustContain(
  'app/community/files.tsx',
  'numColumns',
  'folders must render as a grid',
);
mustContain(
  'app/community/files.tsx',
  'openFolder',
  'tapping a folder must open it for uploads inside',
);
mustContain(
  'app/community/files.tsx',
  'Select members',
  'visibility must offer All, Admin and select-members',
);
mustContain(
  'app/community/files.tsx',
  'visibility',
  'the files UI must surface visibility',
);
mustNotContain(
  'app/community/files.tsx',
  'folderChip',
  'folders must not look like filter pills',
);

if (failures.length > 0) {
  console.error(`Files folder gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Files folder guards pass.');
