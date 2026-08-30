/**
 * Copies pdf.js's standard font data into public/ so it ships in the bundle
 * (and therefore inside the APK).
 *
 * Without this, any PDF that does not embed the base-14 fonts renders its text
 * as blank boxes. Runs before the Vite build so the files are picked up as
 * static assets.
 *
 * .map files are filtered out deliberately: scripts/pruneNativeWebDir.mjs fails
 * the native build on stray source maps.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts');
const dest = path.join(root, 'public', 'pdfjs', 'standard_fonts');

if (!existsSync(src)) {
  console.error('pdfjs-dist standard_fonts not found - is pdfjs-dist installed?');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, {
  recursive: true,
  filter: (s) => !s.endsWith('.map'),
});

console.log(`copyPdfjsAssets: standard_fonts -> public/pdfjs/standard_fonts`);
