// Generates app icons from the brand SVG. Run: node scripts/gen-icons.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const brand = join(ROOT, 'assets', 'brand');

const iconSvg = readFileSync(join(brand, 'logo-icon.svg'));
await sharp(iconSvg, { density: 300 })
  .resize(1024, 1024)
  .png()
  .toFile(join(brand, 'icon.png'));

const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <circle cx="512" cy="512" r="170" fill="none" stroke="#FFFFFF" stroke-width="80"/>
  <path d="M452 452 L572 572" stroke="#3EE6C4" stroke-width="54" stroke-linecap="round"/>
  <path d="M572 452 L452 572" stroke="#3EE6C4" stroke-width="54" stroke-linecap="round"/>
  <circle cx="688" cy="336" r="34" fill="#3EE6C4"/>
  <circle cx="752" cy="400" r="15" fill="#FFFFFF" opacity="0.9"/>
</svg>`;
await sharp(Buffer.from(foreground), { density: 300 })
  .resize(1024, 1024)
  .png()
  .toFile(join(brand, 'adaptive-icon.png'));

for (const file of ['icon.png', 'adaptive-icon.png']) {
  const meta = await sharp(join(brand, file)).metadata();
  console.log(file, `${meta.width}x${meta.height}`);
}
