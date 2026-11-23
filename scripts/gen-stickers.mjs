// Generates the bundled sticker pack art: flat cartoon style, thick black
// outlines, transparent background, 512x512 PNGs. Also normalizes the
// original 8 (strips their cream backdrop, trims, squares up).
// Run: node scripts/gen-stickers.mjs
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const DIR = join(ROOT, 'assets', 'stickers');

const YELLOW = '#FFC93C';
const INK = '#141416';
const BLUSH = '#F4795B';
const MOUTH = '#7C2D12';

function face(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="272" r="168" fill="${YELLOW}" stroke="${INK}" stroke-width="24"/>
  ${inner}
  <ellipse cx="182" cy="188" rx="52" ry="28" fill="#FFFFFF" opacity="0.45" transform="rotate(-24 182 188)"/>
</svg>`;
}

const NEW = {
  smile: face(`
  <path d="M188 244 Q208 224 228 244" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M284 244 Q304 224 324 244" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <ellipse cx="166" cy="284" rx="22" ry="14" fill="${BLUSH}" opacity="0.85"/>
  <ellipse cx="346" cy="284" rx="22" ry="14" fill="${BLUSH}" opacity="0.85"/>
  <path d="M186 306 Q256 372 326 306" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/>`),
  wink: face(`
  <circle cx="208" cy="242" r="16" fill="${INK}"/>
  <path d="M284 242 Q304 224 324 242" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <ellipse cx="346" cy="284" rx="22" ry="14" fill="${BLUSH}" opacity="0.85"/>
  <path d="M196 308 Q262 362 322 302" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/>`),
  cool: face(`
  <rect x="146" y="206" width="112" height="80" rx="32" fill="${INK}"/>
  <rect x="254" y="206" width="112" height="80" rx="32" fill="${INK}"/>
  <rect x="250" y="218" width="22" height="16" fill="${INK}"/>
  <path d="M166 234 L198 234" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>
  <path d="M274 234 L306 234" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>
  <path d="M216 332 Q272 354 312 318" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/>`),
  silly: face(`
  <circle cx="206" cy="240" r="15" fill="${INK}"/>
  <circle cx="306" cy="240" r="15" fill="${INK}"/>
  <path d="M182 300 Q256 296 330 300 L322 336 Q256 388 190 336 Z" fill="${MOUTH}" stroke="${INK}" stroke-width="18" stroke-linejoin="round"/>
  <ellipse cx="256" cy="360" rx="24" ry="17" fill="#F25C5C" stroke="${INK}" stroke-width="10"/>`),
  surprised: face(`
  <path d="M172 172 Q204 154 236 172" stroke="${INK}" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M276 172 Q308 154 340 172" stroke="${INK}" stroke-width="16" fill="none" stroke-linecap="round"/>
  <circle cx="204" cy="240" r="30" fill="#FFFFFF" stroke="${INK}" stroke-width="16"/>
  <circle cx="308" cy="240" r="30" fill="#FFFFFF" stroke="${INK}" stroke-width="16"/>
  <circle cx="204" cy="244" r="12" fill="${INK}"/>
  <circle cx="308" cy="244" r="12" fill="${INK}"/>
  <ellipse cx="256" cy="346" rx="34" ry="44" fill="${MOUTH}" stroke="${INK}" stroke-width="16"/>`),
  sleep: face(`
  <path d="M184 248 Q206 262 228 248" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M284 248 Q306 262 328 248" stroke="${INK}" stroke-width="18" fill="none" stroke-linecap="round"/>
  <ellipse cx="256" cy="330" rx="12" ry="14" fill="${MOUTH}"/>
  <text x="352" y="168" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="#3E7CB1">Z</text>
  <text x="398" y="104" font-family="Arial, sans-serif" font-size="52" font-weight="bold" fill="#3E7CB1">Z</text>
  <text x="432" y="58" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#3E7CB1">Z</text>`),
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <path d="M256 92 L297 205 L418 210 L323 284 L356 400 L256 332 L156 400 L189 284 L94 210 L215 205 Z"
    fill="${YELLOW}" stroke="${INK}" stroke-width="24" stroke-linejoin="round"/>
  <ellipse cx="222" cy="176" rx="34" ry="18" fill="#FFFFFF" opacity="0.5" transform="rotate(-18 222 176)"/>
  <path d="M404 96 L408 110 L422 114 L408 118 L404 132 L400 118 L386 114 L400 110 Z" fill="#FFFFFF" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="120" cy="400" r="12" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>
</svg>`,
  love: face(`
  <path d="M200 272 C164 246 162 216 182 208 C194 204 200 212 200 220 C200 212 206 204 218 208 C238 216 236 246 200 272 Z"
    fill="#E63946" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/>
  <path d="M312 272 C276 246 274 216 294 208 C306 204 312 212 312 220 C312 212 318 204 330 208 C350 216 348 246 312 272 Z"
    fill="#E63946" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/>
  <path d="M200 322 Q256 362 312 322" stroke="${INK}" stroke-width="20" fill="none" stroke-linecap="round"/>`),
};

for (const [id, svg] of Object.entries(NEW)) {
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(join(DIR, `${id}.png`));
  console.log('wrote', `${id}.png`);
}

// ── Normalize the original 8: flood-fill the flat cream backdrop to
// transparent from the corners, trim to the art, square up at 512. ──
const OLD = [
  'thumbs-up',
  'laugh',
  'heart',
  'clap',
  'thinking',
  'party',
  'sad',
  'fire',
];

function colorDist(a, b) {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
}

for (const id of OLD) {
  const file = join(DIR, `${id}.png`);
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const px = (x, y) => (y * width + x) * channels;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ].map(([x, y]) => {
    const o = px(x, y);
    return [data[o], data[o + 1], data[o + 2]];
  });
  // Seed color: average the corners (all backdrop on these files).
  const bg = [0, 1, 2].map(
    (c) => corners.reduce((s, p) => s + p[c], 0) / corners.length,
  );
  const TOL = 18;
  const seen = new Uint8Array(width * height);
  const stack = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = y * width + x;
    if (seen[i]) continue;
    seen[i] = 1;
    const o = px(x, y);
    if (colorDist([data[o], data[o + 1], data[o + 2]], bg) > TOL) continue;
    data[o + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  // Bounding box of surviving art.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[px(x, y) + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`${id}: no art survived the backdrop cut`);
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  await sharp(data, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log('normalized', `${id}.png`);
}

// ── Contact sheet for one-glance review. ──
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.png') && f !== 'contact-sheet.png')
  .sort();
const CELL = 256;
const cols = 4;
const rows = Math.ceil(files.length / cols);
const thumbs = await Promise.all(
  files.map((f) =>
    sharp(join(DIR, f)).resize(CELL, CELL, { fit: 'contain' }).png().toBuffer(),
  ),
);
await sharp({
  create: {
    width: cols * CELL,
    height: rows * CELL,
    channels: 4,
    background: { r: 24, g: 24, b: 28, alpha: 1 },
  },
})
  .composite(
    thumbs.map((input, i) => ({
      input,
      left: (i % cols) * CELL,
      top: Math.floor(i / cols) * CELL,
    })),
  )
  .png()
  .toFile(join(DIR, 'contact-sheet.png'));
console.log('contact sheet:', files.length, 'stickers');
