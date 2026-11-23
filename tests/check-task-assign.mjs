// Task-assign guards: picking an assignee opens a searchable member
// directory page instead of an inline chip cloud.
// Run: node tests/check-task-assign.mjs
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

function mustLack(file, needle, why) {
  if (!existsSync(join(ROOT, file))) {
    failures.push(`missing file: ${file}`);
    return;
  }
  if (read(file).includes(needle)) {
    failures.push(`${file} must not contain ${needle} (${why})`);
  }
}

mustExist('app/community/task-assign.tsx');
mustContain(
  'app/community/task-assign.tsx',
  'SearchField',
  'the directory is searchable',
);
mustContain(
  'app/community/task-assign.tsx',
  'listCommunityMembers',
  'admins pick from real members',
);
mustContain(
  'app/community/task-new.tsx',
  'task-assign',
  'the form opens the directory page',
);
mustContain(
  'lib/taskAssignee.ts',
  'takePendingAssignees',
  'the picks return to the form',
);
mustContain(
  'app/community/task-new.tsx',
  'DatePicker',
  'due dates pick from a mini calendar',
);
mustContain(
  'components/DatePicker.tsx',
  'WEEKDAYS',
  'the picker renders a month grid',
);
mustLack(
  'app/community/task-new.tsx',
  'TYPE THE DATE',
  'due dates pick from a calendar, never typed',
);
mustContain('package.json', 'check-task-assign', 'the check must run in npm test');

if (failures.length > 0) {
  console.error(`Task-assign gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('Task-assign guards pass.');
