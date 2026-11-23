// Guards the tweetnacl PRNG fix: tweetnacl binds its random generator at
// module load and throws 'no PRNG' on React Native, where the WebCrypto
// global does not exist. That broke every message send (text + voice, DM +
// group). lib/prng.ts installs expo-standard-web-crypto's CSPRNG-backed
// getRandomValues as the global BEFORE tweetnacl loads, so it must be the
// first import of the app entry and of every tweetnacl consumer.
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

function firstImportLine(file) {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  return lines.find((line) => line.trimStart().startsWith('import')) ?? '';
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (!pkg.dependencies?.['expo-standard-web-crypto']) {
  failures.push(
    'package.json must depend on expo-standard-web-crypto (the CSPRNG backing the PRNG polyfill)',
  );
}
mustContain(
  'package-lock.json',
  '"node_modules/expo-standard-web-crypto"',
  'the polyfill must be installed, not just declared',
);

mustExist('lib/prng.ts');
mustContain(
  'lib/prng.ts',
  'expo-standard-web-crypto',
  'the polyfill must use the audited package, not hand-rolled randomness',
);
mustContain(
  'lib/prng.ts',
  'getRandomValues',
  'the polyfill must install getRandomValues',
);
mustContain(
  'lib/prng.ts',
  'globalThis',
  'the polyfill must install a real global before tweetnacl loads',
);

// Import order is load order: tweetnacl reads the global at import time.
for (const file of ['app/_layout.tsx', 'lib/e2ee.ts', 'lib/voice.ts']) {
  const first = firstImportLine(file);
  if (!first.includes('prng')) {
    failures.push(
      `${file} first import must be the PRNG polyfill (got: ${first.trim() || '<none>'})`,
    );
  }
}

if (failures.length > 0) {
  console.error(`PRNG gaps (${failures.length}):`);
  for (const entry of failures) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('PRNG guards pass.');
