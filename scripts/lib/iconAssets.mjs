// Shared image helpers for the icon generator.
//
// The interesting one is extractMark: the logo master in this repo is not a
// transparent logo, it is a finished square render on an opaque white ground,
// and every asset built from it has to lift that ground off first.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * The mark, lifted off the white ground it was rendered on and trimmed to its
 * own ink.
 *
 * assets/Normallogo.png is a 2048px opaque square: the blue book-and-quill mark
 * on a flat white background. Handing that straight to an adaptive icon layer
 * would put a white box behind the logo on the launcher.
 *
 * A flood fill inward from the border, rather than a global "make white
 * transparent" test: the mark carries WHITE outline strokes inside the book, and
 * a global test punches holes straight through them. Only white REACHABLE from
 * the edge is ground. Measured on the current master, 28.4% of the surviving
 * pixels are near-white -- that is those strokes, and they have to survive.
 *
 * Edge pixels where the mark is anti-aliased against the ground stay opaque and
 * keep their pale blend, so the mark carries a faint light fringe. Against the
 * white plate this composites back to exactly the original artwork; on a dark
 * plate it would read as a thin halo and would want un-matting instead. That is
 * one of the reasons the plate is white.
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
  // 2048px of mostly-empty canvas instead of against the mark.
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

/**
 * Trim transparent margins and report the same shape `extractMark` does.
 *
 * `extractMark` removes a WHITE ground, which is exactly wrong for artwork that
 * arrives already keyed onto transparency -- the flood fill would walk straight
 * through the transparent margin AND through the mark's interior holes.
 * Anything pre-keyed comes through here instead.
 */
export async function trimToMark(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  if (x1 < 0) throw new Error(`${file}: image is fully transparent`);
  const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const out = await sharp(file).extract(box).png().toBuffer();
  return { buf: out, width: box.width, height: box.height, canvas: w, box };
}

/**
 * A flat white stencil of the mark's alpha, for Android notification icons.
 *
 * Android tints notification icons itself and discards their colour, so the only
 * thing that survives is the alpha channel. Built from
 * assets/TransparentBGlogo.png rather than from the opaque master: that file's
 * background removal also took out the book's inner outline strokes, leaving
 * 77,745 ENCLOSED transparent pixels. Against the opaque master those same
 * strokes are white INK, so a silhouette of it collapses to a featureless blob;
 * here they stay holes and the book still reads at 24dp.
 */
export async function silhouette(mark) {
  const { data, info } = await sharp(mark.buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    out[p * 4] = 255;
    out[p * 4 + 1] = 255;
    out[p * 4 + 2] = 255;
    out[p * 4 + 3] = data[p * c + 3];
  }
  const buf = await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return { buf, width: w, height: h, canvas: mark.canvas, box: mark.box };
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

export function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
