// Post-save guards: home filters are All/Saved/Liked/Tag, posts save from
// the 3-dot menu into a server-side save list, and Tag shows posts the
// user is mentioned in.
// Run: node tests/check-post-saves.mjs
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

function mustExist(file) {
  if (!existsSync(join(ROOT, file))) failures.push(`missing file: ${file}`);
}

// ── Migration ──────────────────────────────────────────────────────
mustExist('supabase/migrations/2026111802_post_saves.sql');
mustContain(
  'supabase/migrations/2026111802_post_saves.sql',
  'post_saves',
  'saves need a server-side list',
);

// ── Library ────────────────────────────────────────────────────────
mustContain('lib/engagement.ts', 'toggleSave', 'save toggle API');
mustContain('lib/engagement.ts', 'mySavedIds', 'saved-state lookup');
mustContain('lib/mentions.ts', 'myTaggedPostIds', 'tagged-post lookup');

// ── Feed ───────────────────────────────────────────────────────────
mustContain('app/(tabs)/feed.tsx', "'SAVED'", 'Saved filter');
mustContain('app/(tabs)/feed.tsx', "'TAG'", 'Tag filter');
mustContain('app/(tabs)/feed.tsx', 'Save post', 'menu saves the post');
mustContain('app/(tabs)/feed.tsx', 'Unsave', 'menu reverses the save');

// ── Suite wiring ───────────────────────────────────────────────────
mustContain('package.json', 'check-post-saves', 'the check must run in npm test');

if (failures.length > 0) {
  console.error(`Post-save gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Post-save guards pass.');
