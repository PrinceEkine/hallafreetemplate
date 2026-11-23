// Guards against dead navigation: every static link in app/ and
// components/ must resolve to a real expo-router route file.
// Run: npm test
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.expo' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

// Mirror expo-router typed-routes semantics (the tsc gate): group segments
// are optional, dynamic [param] segments match anything, and an index file
// maps to its directory path (/wallet for app/wallet/index.tsx).
function buildRoutes() {
  const exact = new Set();
  const patterns = [];
  for (const file of walk(join(ROOT, 'app'))) {
    const rel = relative(join(ROOT, 'app'), file)
      .split(sep)
      .join('/')
      .replace(/\.(tsx?|jsx?)$/, '');
    const segs = rel.split('/');
    const base = segs[segs.length - 1];
    if (base === '_layout' || base === '_sitemap' || base.startsWith('+')) {
      continue;
    }
    if (rel === 'index') {
      exact.add('/');
      continue;
    }
    // An index file serves its directory path (expo-router serves /wallet
    // for app/wallet/index.tsx, never /wallet/index).
    const routeSegs =
      base === 'index' ? segs.slice(0, -1) : segs;
    const variants = new Set(['/' + routeSegs.join('/')]);
    const stripped = routeSegs.filter(
      (s) => !(s.startsWith('(') && s.endsWith(')')),
    );
    if (stripped.length !== segs.length) {
      variants.add('/' + stripped.join('/'));
    }
    for (const v of variants) {
      if (v.includes('[')) {
        patterns.push(
          new RegExp('^' + v.replace(/\[.+?\]/g, '[^/]+') + '$'),
        );
      } else {
        exact.add(v);
      }
    }
  }
  return { exact, patterns };
}

const LINK_PATTERNS = [
  /router\.(?:push|replace)\(\s*['"`]([^'"`]+)['"`]/g,
  /pathname:\s*['"`]([^'"`]+)['"`]/g,
  /href\s*=\s*["']([^"']+)["']/g,
  /href\s*=\s*\{\s*["']([^"']+)["']\s*\}/g,
];

function extractLinks(file) {
  const content = readFileSync(file, 'utf8');
  const links = [];
  for (const pattern of LINK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const raw = match[1];
      if (
        raw.startsWith('http') ||
        raw.startsWith('.') ||
        raw.startsWith('#') ||
        raw.includes('${')
      ) {
        continue;
      }
      const line = content.slice(0, match.index).split('\n').length;
      links.push({ link: raw.split(/[?#]/)[0], file, line });
    }
  }
  return links;
}

const { exact, patterns } = buildRoutes();
const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))];
const bad = [];
let count = 0;
for (const file of files) {
  for (const { link, line } of extractLinks(file)) {
    count += 1;
    const ok =
      exact.has(link) || patterns.some((pattern) => pattern.test(link));
    if (!ok) bad.push(`${relative(ROOT, file)}:${line} -> ${link}`);
  }
}

if (bad.length > 0) {
  console.error(`Dead navigation links (${bad.length} of ${count}):`);
  for (const entry of bad) console.error(`  ${entry}`);
  process.exit(1);
}
console.log(`All ${count} navigation links resolve.`);
