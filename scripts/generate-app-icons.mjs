// Regenerate every launcher icon, splash image and web icon from one logo master.
//
// Why this exists instead of `npx capacitor-assets generate`:
//
//  1. assets/icon-foreground.png is not a transparent logo. It is an opaque
//     WHITE 682px square with transparent margins and the mark painted inside.
//     capacitor-assets takes that at face value and hands it to the adaptive
//     icon's foreground layer, so the white square rides along and shows up as
//     a box behind the mark on the launcher and on the Android 12+ splash.
//     Stripping the plate is step one here, and no amount of layer/inset
//     tweaking substitutes for it.
//  2. That tool also insets the adaptive icon's BACKGROUND layer by 16.7%, so
//     the plate never reaches the edge of the 108dp canvas. Launchers that
//     force a shape then wrap the icon in a plate of their own to compensate.
//  3. It writes the adaptive layers at LEGACY densities -- 192px at xxxhdpi,
//     where the adaptive canvas is 108dp and xxxhdpi is 4x, so the correct size
//     is 432px. The system upscales 2.25x and the mark comes out soft.
//
// Everything is derived from the mark's own bounding box after the plate comes
// off, so the result does not depend on how much padding the source carries.
// Re-run after replacing the master:
//
//     node scripts/generate-app-icons.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { compose, composeGradient, extractMark, gradient, keyOutPlate, markAt, solid, trimToMark, write } from './lib/iconAssets.mjs';

/** The single source of truth. Plate and padding are removed automatically. */
const LOGO = 'assets/logo-master.png';

/** Plate colour behind the mark, everywhere. */
// The logo master is NOT a bare glyph - it is a finished card with its own
// vertical gradient (sampled #b5e8fa at the top, #7aafc3 at the bottom) and soft
// semi-transparent edges. Compositing it onto a DIFFERENT plate colour is what
// produced the "square inside a circle" launcher icon: the card's corners stayed
// visible against the plate and then got cut by the mask.
//
// Matching the plate to the card's own gradient makes the rim dissolve into it,
// so the icon reads as one continuous surface at any mask shape.
// A blue plate, because what sits on it is now the bare WHITE glyph. Matching
// the plate to the card's own pale gradient was solving the wrong problem - the
// card is gone (see keyOutPlate), and white on pale blue has almost no contrast.
const BG_TOP = '#42a5f5';
const BG_BOTTOM = '#1976d2';
/** Flat fallback for the few places that cannot take a gradient. */
const BG = '#2196F3';

const RES = 'android/app/src/main/res';

// Adaptive icons are drawn on a 108dp canvas of which only the middle 72dp
// (66.7%) survives the launcher's mask, and only a 66dp circle survives EVERY
// mask shape. If the mark has content in the corners of its bounding box, the
// box DIAGONAL -- not its width -- is what has to fit that circle: at 0.46 a
// square-ish mark's corners land at a diameter of ~0.61, inside the 0.667
// circle with room to spare, and the mark still reads at ~69% of the visible
// area. Raise it toward 0.55 for a round or centre-weighted mark; lower it if
// corners get clipped on a circular launcher mask.
const ADAPTIVE_LOGO = 0.46;
/** Legacy pre-API-26 icons are unmasked, so the mark can be larger. */
const LEGACY_LOGO = 0.62;
/** Fraction of the SHORT screen edge the splash mark occupies. */
const SPLASH_LOGO = 0.3;
/** Web PWA icons: "any" is drawn full-bleed, "maskable" gets an 80% safe zone. */
const WEB_LOGO = 0.72;
const WEB_MASKABLE_LOGO = 0.55;

/** Adaptive layers: 108dp at each density bucket. */
const ADAPTIVE_DENSITIES = {
  ldpi: 81,
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

/** Legacy launcher icons: 48dp at each density bucket. */
const LEGACY_DENSITIES = {
  ldpi: 36,
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

function log(file, note) {
  console.log(`  ${file}${note ? `  ${note}` : ''}`);
}

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error(`generate-app-icons: ${LOGO} not found`);
    process.exit(1);
  }

  // The master is a finished square icon (card + glyph). Key the card out first
  // so the adaptive layers get the glyph alone; keep the untouched master for
  // the splash, where a white glyph on a white ground would be invisible.
  const keyed = await keyOutPlate(LOGO);
  write('assets/logo-glyph.png', keyed);
  const mark = await trimToMark(keyed);
  const cardMark = await extractMark(LOGO);
  const pct = ((mark.width / mark.canvas) * 100).toFixed(1);
  console.log(
    `Master  ${LOGO} (${mark.canvas}px)\n` +
      `Mark    ${mark.width}x${mark.height} at (${mark.box.left},${mark.box.top}) -- ${pct}% of the master, plate removed\n` +
      `Plate   ${BG}\n`,
  );

  // Keep the stripped mark on disk: it is what every other asset is built from,
  // and having it inspectable is the difference between trusting this script
  // and re-deriving the plate problem from scratch next time.
  write('assets/logo-mark.png', mark.buf);
  log('assets/logo-mark.png', `${mark.width}x${mark.height} transparent`);

  console.log('\nassets/ masters');
  write('assets/icon-background.png', await gradient(1024, 1024, BG_TOP, BG_BOTTOM));
  log('icon-background.png', '1024x1024 solid plate');
  write('assets/icon.png', await composeGradient(mark, 1024, 1024, Math.round(1024 * LEGACY_LOGO), BG_TOP, BG_BOTTOM));
  log('icon.png', '1024x1024 plate + mark');
  for (const f of ['assets/splash.png', 'assets/splash-dark.png']) {
    write(f, await compose(cardMark, 2732, 2732, Math.round(2732 * SPLASH_LOGO), '#ffffff'));
    log(path.basename(f), '2732x2732');
  }

  console.log('\nAndroid adaptive icon (108dp canvas)');
  for (const [density, size] of Object.entries(ADAPTIVE_DENSITIES)) {
    const dir = `${RES}/mipmap-${density}`;
    write(
      `${dir}/ic_launcher_foreground.png`,
      await compose(mark, size, size, Math.round(size * ADAPTIVE_LOGO), null),
    );
    write(`${dir}/ic_launcher_background.png`, await gradient(size, size, BG_TOP, BG_BOTTOM));
    log(`mipmap-${density}/ic_launcher_{foreground,background}.png`, `${size}px`);
  }

  console.log('\nAndroid legacy icon (48dp canvas)');
  for (const [density, size] of Object.entries(LEGACY_DENSITIES)) {
    const dir = `${RES}/mipmap-${density}`;
    const m = Math.round(size * LEGACY_LOGO);
    write(`${dir}/ic_launcher.png`, await composeGradient(mark, size, size, m, BG_TOP, BG_BOTTOM, size * 0.2));
    write(`${dir}/ic_launcher_round.png`, await composeGradient(mark, size, size, m, BG_TOP, BG_BOTTOM, size / 2));
    log(`mipmap-${density}/ic_launcher{,_round}.png`, `${size}px`);
  }

  // Every density/orientation/night variant that already exists keeps its exact
  // dimensions. Night gets the same white plate as day: a dark splash behind a
  // white icon box was the other half of what looked wrong on device, and the
  // chosen plate is white in both modes.
  console.log('\nSplash screens');
  const splashDirs = fs
    .readdirSync(RES)
    .filter((d) => d.startsWith('drawable') && fs.existsSync(`${RES}/${d}/splash.png`));
  for (const d of splashDirs) {
    const file = `${RES}/${d}/splash.png`;
    const { width, height } = await sharp(file).metadata();
    write(
      file,
      // White ground: the launch screen is white, and the card mark reads
      // cleanly against it (the bare glyph would not - it is near-white).
      await compose(cardMark, width, height, Math.round(Math.min(width, height) * SPLASH_LOGO), '#ffffff'),
    );
  }
  log(`${splashDirs.length} splash.png variants`, 'regenerated at their existing sizes');

  console.log('\nWeb icons');
  for (const size of [192, 512]) {
    write(
      `public/icons/icon-${size}.png`,
      await composeGradient(mark, size, size, Math.round(size * WEB_LOGO), BG_TOP, BG_BOTTOM),
    );
    write(
      `public/icons/icon-maskable-${size}.png`,
      await compose(mark, size, size, Math.round(size * WEB_MASKABLE_LOGO), BG),
    );
    log(`icon-${size}.png, icon-maskable-${size}.png`);
  }

  // The two SVGs were a placeholder pill emoji. Nothing reads them except the
  // service worker's precache list, and removing them from there would need an
  // sw version bump, so they are regenerated as real icons instead. The mark is
  // a raster, so it rides along base64-encoded at a bounded size.
  const embedded = (await markAt(mark, 384)).buf.toString('base64');
  const svg = (frac) => {
    const side = 512 * frac;
    const off = (512 - side) / 2;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n` +
      `  <rect width="512" height="512" fill="${BG}"/>\n` +
      `  <image x="${off.toFixed(1)}" y="${off.toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${embedded}"/>\n` +
      `</svg>\n`
    );
  };
  write('public/icons/icon.svg', Buffer.from(svg(WEB_LOGO)));
  write('public/icons/icon-maskable.svg', Buffer.from(svg(WEB_MASKABLE_LOGO)));
  log('icon.svg, icon-maskable.svg', 'were a placeholder pill emoji');

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
