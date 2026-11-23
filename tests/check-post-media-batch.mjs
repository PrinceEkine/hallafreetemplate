// Post media batch guards: home posts carry gallery photos, videos,
// and downloadable files (Word, Excel…); the editor preserves
// videos/files while pictures stay editable.
// Run: node tests/check-post-media-batch.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

function mustLack(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  const content = readFileSync(join(ROOT, file), 'utf8');
  if (content.includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
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

// -- Kind storage ------------------------------------------------------
const MIGRATION = 'supabase/migrations/2026112210_post_media_kinds.sql';
mustExist(MIGRATION);
mustContain(
  MIGRATION,
  "check (kind in ('image', 'video', 'file'))",
  'post attachments need a kind column',
);
mustContain(
  MIGRATION,
  'file_name',
  'file rows must remember their names',
);
mustContain(
  'lib/content.ts',
  'kind,file_name,file_size',
  'media reads must fetch kinds',
);
mustContain(
  'lib/content.ts',
  'NewPostMedia',
  'media writes must carry kinds',
);

// -- Composer: full gallery + video + files ---------------------------------
mustContain(
  'app/post/new.tsx',
  'launchImageLibraryAsync',
  'posting must open the full gallery, not recent-only',
);
mustContain(
  'app/post/new.tsx',
  "mediaTypes: ['images', 'videos']",
  'posts must accept videos',
);
mustContain(
  'app/post/new.tsx',
  'Attach files',
  'posts must accept Word, Excel and other files',
);
mustContain(
  'app/post/new.tsx',
  'MAX_FILE_BYTES',
  'posted files need an upload cap',
);
mustContain(
  'app/post/edit.tsx',
  'launchImageLibraryAsync',
  'editing must use the full gallery too',
);
mustContain(
  'app/post/edit.tsx',
  'setLocked',
  'videos and files must survive an edit',
);

// -- Shared renderers ---------------------------------------------------------
mustExist('components/PostAttachments.tsx');
mustContain(
  'components/PostAttachments.tsx',
  'PostVideos',
  'videos need an inline tile plus player',
);
mustContain(
  'components/PostAttachments.tsx',
  'PostFiles',
  'files need downloadable rows',
);
mustContain(
  'components/PostAttachments.tsx',
  'Only install files from people you trust',
  'posted packages keep the installer trust prompt',
);

// -- Feed + detail ---------------------------------------------------------------
mustLack(
  'app/(tabs)/feed.tsx',
  'PostVideos',
  'home keeps the previous card pattern; videos open in detail',
);
mustLack(
  'app/(tabs)/feed.tsx',
  'PostFiles',
  'home keeps the previous card pattern; files open in detail',
);
mustContain(
  'app/post/[id].tsx',
  '<PostVideos uris={post.videos} />',
  'post detail must play videos',
);
mustContain(
  'app/post/[id].tsx',
  '<PostFiles files={post.files} />',
  'post detail must list files',
);
mustContain(
  'lib/mock.ts',
  'videos?: string[]',
  'the feed Post shape carries videos',
);

// -- Suite wiring ----------------------------------------------------
mustContain(
  'package.json',
  'check-post-media-batch',
  'the check must run in npm test',
);

if (failures.length > 0) {
  console.error(`Post-media gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Post-media guards pass.');
