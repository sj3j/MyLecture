// Shared image helpers for the icon and store-asset generators.
//
// The interesting one is extractMark: the logo master in this repo is not a
// transparent logo, and every asset built from it has to strip its plate first.
// Both generate-app-icons.mjs and generate-store-assets.mjs need that, and a
// second copy of a flood fill is a second chance to get it subtly wrong.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * The mark, lifted off the plate it was drawn on and trimmed to its own ink.
 *
 * assets/icon-foreground.png is an opaque WHITE 682px square with transparent
 * margins and the mark painted inside it. Handing that straight to an adaptive
 * icon layer is what put a white box behind the logo on the launcher.
 *
 * A flood fill inward from the border, rather than a global "make white
 * transparent" test: the mark has near-white highlights along the bowl and the
 * snake's back, and a global test punches holes straight through them. Only
 * white REACHABLE from the edge is plate.
 *
 * Edge pixels where the mark is anti-aliased against the plate stay opaque and
 * keep their pale blend, so the mark carries a faint light fringe. Against a
 * white plate this composites back to exactly the original artwork; on a dark
 * plate it would read as a thin halo and would want un-matting instead.
 */
export async function extractMark(logoPath) {
  const { data, info } = await sharp(logoPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  const isPlate = (p) => {
    const i = p * c;
    return data[i + 3] < 8 || (data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242);
  };

  const alpha = Buffer.alloc(w * h, 255);
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);

  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isPlate(p)) continue;
    alpha[p] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < w * h; p++) {
    if (!alpha[p]) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error(`${logoPath}: nothing left after removing the plate`);

  const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };

  // Two pipelines, deliberately. removeAlpha before joinChannel because
  // joinChannel APPENDS -- handing it RGBA yields a 5-channel image rather than
  // the replaced alpha we want. And the extract has to run on a fresh pipeline:
  // chained onto the raw+joinChannel one it shifts the pixels but leaves the
  // canvas at its original size, so every size downstream gets computed against
  // 1024px of mostly-empty canvas instead of against the mark.
  const masked = await sharp(data, { raw: { width: w, height: h, channels: c } })
    .removeAlpha()
    .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
  const buf = await sharp(masked).extract(box).png().toBuffer();

  const check = await sharp(buf).metadata();
  if (check.width !== box.width || check.height !== box.height) {
    throw new Error(
      `extract produced ${check.width}x${check.height}, expected ${box.width}x${box.height}`,
    );
  }

  return { buf, width: box.width, height: box.height, box, canvas: w };
}

/** The mark scaled so its LONGER side is `size` px. */
export async function markAt(mark, size) {
  const scale = size / Math.max(mark.width, mark.height);
  const w = Math.max(1, Math.round(mark.width * scale));
  const h = Math.max(1, Math.round(mark.height * scale));
  const buf = await sharp(mark.buf)
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return { buf, w, h };
}

/** Mark centred on a canvas, over `bg` (or transparent when bg is null). */
export async function compose(mark, canvasW, canvasH, markSize, bg, roundRadius = 0) {
  const { buf, w, h } = await markAt(mark, markSize);
  let base = sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([
    { input: buf, left: Math.round((canvasW - w) / 2), top: Math.round((canvasH - h) / 2) },
  ]);

  if (roundRadius > 0) {
    // Punch the corners out with an SVG mask. Only the legacy pre-API-26 icons
    // need this -- adaptive icons are masked by the launcher itself, and
    // rounding them here would show as a double-rounded corner.
    const mask = Buffer.from(
      `<svg width="${canvasW}" height="${canvasH}"><rect width="${canvasW}" height="${canvasH}" rx="${roundRadius}" ry="${roundRadius}" fill="#fff"/></svg>`,
    );
    base = sharp(await base.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return base.png().toBuffer();
}

/**
 * Strip a coloured card from behind a near-white glyph.
 *
 * The MyLecture master is a finished square app icon: a light-blue gradient card
 * with a white mark drawn on it. `extractMark` only trims transparent margins,
 * so it hands back the CARD, and compositing that onto any plate reproduces the
 * "square inside a circle" the launcher mask makes of it. The card also cannot
 * simply be scaled to fill the canvas: its glyph is 72% of the card, which would
 * put the glyph's diagonal at 104% of the adaptive canvas and clip it on every
 * round launcher.
 *
 * The glyph is near-white and the card is light blue, so min(r,g,b) separates
 * them - white gives 255, the card's lightest tone 181. Ramping alpha across
 * that gap keeps the glyph's anti-aliased edges instead of hard-thresholding
 * them into jaggies.
 *
 * A flood fill from the border cannot do this: the card is inset inside
 * transparent margins, so the fill never reaches it.
 */
/**
 * Trim transparent margins and report the same shape `extractMark` does.
 *
 * `extractMark` removes a WHITE plate, which is exactly wrong for artwork that
 * has already been keyed to a white glyph on transparency - it deletes the
 * glyph and reports "nothing left". Anything pre-keyed comes through here.
 */
export async function trimToMark(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let p = 0; p < w * h; p++) {
    if (data[p * c + 3] < 8) continue;
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('trimToMark: image is fully transparent');
  const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const out = await sharp(buf).extract(box).png().toBuffer();
  return { buf: out, width: box.width, height: box.height, canvas: w, box };
}

export async function keyOutPlate(file, lo = 215, hi = 250) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const r = data[p * c], g = data[p * c + 1], b = data[p * c + 2], a = data[p * c + 3];
    const m = Math.min(r, g, b);
    const alpha = a > 8 ? Math.max(0, Math.min(1, (m - lo) / (hi - lo))) : 0;
    out[p * 4] = 255;
    out[p * 4 + 1] = 255;
    out[p * 4 + 2] = 255;
    out[p * 4 + 3] = Math.round(alpha * a);
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

export async function solid(width, height, bg) {
  return sharp({ create: { width, height, channels: 4, background: bg } })
    .png()
    .toBuffer();
}

/**
 * A vertical two-stop gradient plate.
 *
 * Exists because the MyLecture logo master is not a bare glyph -- it is a
 * finished card with its own vertical gradient and soft, semi-transparent
 * edges. Dropping that card on a FLAT plate leaves a visible seam where the
 * translucent rim meets the plate, and dropping it on a differently-coloured
 * plate reads as a square inside a circle once the launcher masks it. Matching
 * the plate to the card's own gradient makes the rim dissolve, so the whole
 * thing reads as one continuous surface whatever shape the mask cuts.
 */
export async function gradient(width, height, top, bottom) {
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${top}"/>` +
      `<stop offset="100%" stop-color="${bottom}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#g)"/></svg>`,
  );
  return sharp(svg).png().toBuffer();
}

/** Mark centred over a gradient plate, optionally corner-rounded. */
export async function composeGradient(mark, canvasW, canvasH, markSize, top, bottom, roundRadius = 0) {
  const { buf, w, h } = await markAt(mark, markSize);
  const plate = await gradient(canvasW, canvasH, top, bottom);
  let base = sharp(plate).composite([
    { input: buf, left: Math.round((canvasW - w) / 2), top: Math.round((canvasH - h) / 2) },
  ]);

  if (roundRadius > 0) {
    const mask = Buffer.from(
      `<svg width="${canvasW}" height="${canvasH}"><rect width="${canvasW}" height="${canvasH}" rx="${roundRadius}" ry="${roundRadius}" fill="#fff"/></svg>`,
    );
    base = sharp(await base.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return base.png().toBuffer();
}

export function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
