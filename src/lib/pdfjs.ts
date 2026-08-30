/**
 * Loading pdf.js once, with a worker that actually is a worker.
 *
 * Two things here are load-bearing:
 *
 *   1. `?worker` lets Vite bundle and fingerprint the worker itself. pdf.js's
 *      own default is to resolve a URL at runtime and, when that fails, fall
 *      back to a "fake worker" that parses PDFs ON THE MAIN THREAD - which does
 *      not error, it just janks the UI to a standstill on a phone. Handing it a
 *      constructed worker via `workerPort` removes that code path entirely.
 *
 *   2. No CDN. The Capacitor build runs from https://localhost with the bundle
 *      on-device and no network guarantee, so every byte has to ship in the APK.
 */

import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

type PdfjsModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfjsModule> | null = null;

/**
 * Base options every getDocument() call needs.
 *
 * standardFontDataUrl is not optional in practice: without the base-14 font
 * data, PDFs that rely on non-embedded fonts render their text as blank boxes.
 * scripts/copyPdfjsAssets.mjs puts these under public/ at build time.
 */
export const PDFJS_DOC_OPTIONS = {
  standardFontDataUrl: './pdfjs/standard_fonts/',
  // Arabic lecture PDFs are frequently CID-encoded; if glyphs come out blank,
  // ship pdfjs-dist/cmaps to public/pdfjs/cmaps/ and set cMapUrl + cMapPacked.
  isEvalSupported: false,
} as const;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (modulePromise) return modulePromise;

  modulePromise = import('pdfjs-dist').then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    }
    if (import.meta.env.DEV && !pdfjs.GlobalWorkerOptions.workerPort) {
      console.error('[pdfjs] no workerPort - PDFs would parse on the main thread');
    }
    return pdfjs;
  });

  modulePromise.catch(() => { modulePromise = null; });
  return modulePromise;
}

/**
 * Fetch a PDF as bytes.
 *
 * Deliberately not handing getDocument() a URL. A URL makes pdf.js issue HTTP
 * Range requests, which need Content-Range/Accept-Ranges in the response's
 * Access-Control-Expose-Headers - and Firebase Storage, where these lectures
 * live, exposes neither. One plain GET is the request shape that is verified to
 * work from the native origin.
 */
export async function fetchPdfBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * A fresh view over the bytes for each getDocument() call.
 *
 * getDocument TRANSFERS `data` to the worker, which detaches the ArrayBuffer.
 * Reusing the original on a re-open (a rotation change, a retry) would hand
 * pdf.js a zero-length buffer, so every open gets its own copy.
 */
export function freshBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf.slice(0));
}

/**
 * Cap the backing-store size of a page canvas.
 *
 * WKWebView in particular has a hard canvas-area ceiling and a low memory
 * budget; exceeding it kills the web content process silently - a blank white
 * screen with no JS error to catch.
 */
export const MAX_CANVAS_AREA = 4_000_000;

export function safeCanvasScale(cssWidth: number, cssHeight: number, dpr: number): number {
  const capped = Math.min(dpr, 2);
  const area = cssWidth * cssHeight * capped * capped;
  if (area <= MAX_CANVAS_AREA) return capped;
  return Math.max(1, capped * Math.sqrt(MAX_CANVAS_AREA / area));
}
