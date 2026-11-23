// Every sidebar module must resolve to a real screen (no placeholders).
// Run: npm test
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

// Module id -> screen file that must exist.
const EXPECTED = {
  directory: 'app/community/directory.tsx',
  actions: 'app/community/actions.tsx',
  task: 'app/community/task.tsx',
  forms: 'app/forms/index.tsx',
  media: 'app/community/media.tsx',
  files: 'app/community/files.tsx',
  approval: 'app/community/approval.tsx',
  polls: 'app/community/polls.tsx',
  pay: 'app/wallet/index.tsx',
  project: 'app/community/project.tsx',
  contact: 'app/community/contact.tsx',
};

for (const [id, file] of Object.entries(EXPECTED)) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`module "${id}" is missing its screen: ${file}`);
  }
}

// The model must define exactly these module ids.
const model = readFileSync(join(ROOT, 'lib/communityModules.ts'), 'utf8');
for (const id of Object.keys(EXPECTED)) {
  if (!model.includes(`id: '${id}'`)) {
    failures.push(`lib/communityModules.ts does not define module "${id}"`);
  }
}

// The sidebar must link to each dedicated screen.
const drawer = readFileSync(join(ROOT, 'components/DrawerMenu.tsx'), 'utf8');
for (const file of Object.values(EXPECTED)) {
  const route =
    '/' +
    file
      .replace(/^app\//, '')
      .replace(/\.tsx$/, '')
      .replace(/\/index$/, '');
  if (!drawer.includes(route)) {
    failures.push(`components/DrawerMenu.tsx does not link to ${route}`);
  }
}

// Module screens must be real implementations, not placeholders.
for (const file of Object.values(EXPECTED)) {
  const full = join(ROOT, file);
  if (!existsSync(full)) continue;
  const content = readFileSync(full, 'utf8');
  if (/coming soon/i.test(content)) {
    failures.push(`${file} still contains placeholder text`);
  }
}

if (failures.length > 0) {
  console.error(`Module screen gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log(
  `All ${Object.keys(EXPECTED).length} sidebar modules have real screens.`,
);
