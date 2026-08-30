import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  canonicalizePage,
  tagTextLayerSpans,
  quadsToRects,
  resolveAnchor,
  geometryMatches,
  rawOffsetForCanonical,
  type CanonicalPage,
  type TextItemLike,
} from '../../lib/pdfAnchor';
import { safeCanvasScale } from '../../lib/pdfjs';
import { HIGHLIGHT_COLORS, type PdfAnnotation } from '../../types/pdfAnnotation.types';

/**
 * What the overlay needs from a rendered page in order to turn a selection into
 * an anchor. Registered on render, unregistered on teardown.
 */
export interface PageHandle {
  pageNumber: number;
  el: HTMLElement;
  textLayerEl: HTMLElement;
  canonical: CanonicalPage;
  viewport: any;
  /** itemIndex -> the span pdf.js rendered for it. */
  spanByItem: Map<number, HTMLElement>;
  pageW: number;
  pageH: number;
  hasText: boolean;
}

interface Props {
  pdfDoc: any;
  pageNumber: number;
  scale: number;
  rotation: number;
  annotations: PdfAnnotation[];
  registerPage: (n: number, h: PageHandle | null) => void;
  onHighlightTap: (a: PdfAnnotation) => void;
  onOrphan: (id: string, orphaned: boolean) => void;
  onPinPoint?: (pageNumber: number, point: { x: number; y: number }) => void;
  flashId?: string | null;
}

interface PaintedRect {
  id: string;
  color: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * One page: canvas, highlight layer, text layer.
 *
 * `dir="ltr"` is pinned on the wrapper on purpose. The surrounding app is RTL,
 * and an inherited `direction: rtl` changes how the browser splits bidi runs
 * inside pdf.js's absolutely-positioned spans, which shifts getClientRects()
 * and puts every highlight in the wrong place. Only the reader chrome is RTL.
 *
 * Memoized because the overlay re-renders on every scroll tick (to track the
 * current page) and on every annotation change; without it each mounted page
 * would re-run its canvas render on both.
 */
export default React.memo(function PdfPage({
  pdfDoc, pageNumber, scale, rotation, annotations,
  registerPage, onHighlightTap, onOrphan, onPinPoint, flashId,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PageHandle | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [rects, setRects] = useState<PaintedRect[]>([]);
  const [ready, setReady] = useState(false);

  /**
   * Rebuild a DOM Range from canonical character offsets.
   *
   * Highlights are re-derived from the LIVE layout rather than replayed from
   * stored pixel geometry, which is what makes them follow zoom and rotation
   * for free. Stored quads are only the fallback for when the text itself can
   * no longer be found.
   */
  const rangeFor = useCallback((h: PageHandle, start: number, end: number): Range | null => {
    const { canonical, spanByItem } = h;
    let startNode: Node | null = null, startOff = 0, endNode: Node | null = null, endOff = 0;

    for (const r of canonical.itemRanges) {
      const span = spanByItem.get(r.itemIndex);
      if (!span || !span.firstChild) continue;
      const raw = span.textContent ?? '';

      if (startNode === null && start >= r.start && start <= r.end) {
        startNode = span.firstChild;
        startOff = rawOffsetForCanonical(raw, start - r.start);
      }
      if (end >= r.start && end <= r.end) {
        endNode = span.firstChild;
        endOff = rawOffsetForCanonical(raw, end - r.start);
      }
    }

    if (!startNode || !endNode) return null;
    try {
      const range = document.createRange();
      range.setStart(startNode, Math.min(startOff, startNode.textContent?.length ?? 0));
      range.setEnd(endNode, Math.min(endOff, endNode.textContent?.length ?? 0));
      return range.collapsed ? null : range;
    } catch {
      return null;
    }
  }, []);

  /** Resolve every annotation on this page into paintable boxes. */
  const paint = useCallback(() => {
    const h = handleRef.current;
    const wrap = wrapRef.current;
    if (!h || !wrap) return;

    const box = wrap.getBoundingClientRect();
    const out: PaintedRect[] = [];

    for (const a of annotations) {
      if (a.kind === 'pin' && a.point) {
        const [r] = quadsToRects([[a.point.x, a.point.y, a.point.x + 14, a.point.y + 14]], h.viewport);
        out.push({ id: a.id, color: HIGHLIGHT_COLORS[a.color], ...r });
        continue;
      }
      if (!a.anchor) continue;

      const resolved = resolveAnchor(a.anchor, h.canonical.text);
      let painted: PaintedRect[] = [];

      if (resolved) {
        const range = rangeFor(h, resolved.start, resolved.end);
        if (range) {
          // DOMRectList iterates as `unknown` under this lib config.
          const clientRects = Array.from(range.getClientRects()) as DOMRect[];
          painted = clientRects
            .filter(r => r.width > 0.5 && r.height > 0.5)
            .map(r => ({
              id: a.id,
              color: HIGHLIGHT_COLORS[a.color],
              left: r.left - box.left,
              top: r.top - box.top,
              width: r.width,
              height: r.height,
            }));
        }
      }

      // Text is gone but the page is geometrically unchanged - stored quads are
      // still trustworthy.
      if (painted.length === 0 && geometryMatches(a.anchor, h.pageW, h.pageH)) {
        painted = quadsToRects(a.anchor.quads, h.viewport)
          .map(r => ({ id: a.id, color: HIGHLIGHT_COLORS[a.color], ...r }));
      }

      // Nothing located it. The annotation is NOT deleted - it surfaces in the
      // notes drawer instead, note text intact.
      onOrphan(a.id, painted.length === 0);
      out.push(...painted);
    }

    setRects(out);
  }, [annotations, rangeFor, onOrphan]);

  // Render the page, then its text layer.
  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;
    let page: any = null;

    (async () => {
      page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale, rotation });
      const base = page.getViewport({ scale: 1, rotation: 0 });
      const canvas = canvasRef.current;
      const textEl = textRef.current;
      if (!canvas || !textEl) return;

      setSize({ width: viewport.width, height: viewport.height });

      const dpr = window.devicePixelRatio || 1;
      const q = safeCanvasScale(viewport.width, viewport.height, dpr);
      canvas.width = Math.floor(viewport.width * q);
      canvas.height = Math.floor(viewport.height * q);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(q, 0, 0, q, 0, 0);

      renderTask = page.render({ canvasContext: ctx, viewport, canvas: null });
      try {
        await renderTask.promise;
      } catch (e: any) {
        // Cancelling a render on scroll/zoom is normal, not an error.
        if (e?.name !== 'RenderingCancelledException') console.error('page render failed', e);
        return;
      }
      if (cancelled) return;

      // Text layer
      const { TextLayer } = await import('pdfjs-dist');
      if (cancelled) return;

      textEl.innerHTML = '';
      const textContent = await page.getTextContent();
      if (cancelled) return;

      const items = (textContent.items ?? []).filter((i: any) => typeof i.str === 'string') as TextItemLike[];
      const layer = new TextLayer({ textContentSource: textContent, container: textEl, viewport });
      await layer.render();
      if (cancelled) return;

      const spans = Array.from(textEl.querySelectorAll('span')) as HTMLElement[];
      const tagged = tagTextLayerSpans(spans, items);
      if (import.meta.env.DEV && spans.length > 0 && tagged !== spans.length) {
        console.warn(`[pdf] page ${pageNumber}: tagged ${tagged}/${spans.length} spans - anchors may drift`);
      }

      const spanByItem = new Map<number, HTMLElement>();
      for (const s of spans) {
        const idx = s.dataset.itemIndex;
        if (idx !== undefined) spanByItem.set(Number(idx), s);
      }

      const handle: PageHandle = {
        pageNumber,
        el: wrapRef.current!,
        textLayerEl: textEl,
        canonical: canonicalizePage(items),
        viewport,
        spanByItem,
        pageW: base.width,
        pageH: base.height,
        hasText: items.some(i => (i.str ?? '').trim().length > 0),
      };
      handleRef.current = handle;
      registerPage(pageNumber, handle);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* already settled */ }
      try { page?.cleanup(); } catch { /* page may not have loaded */ }
      // Release the backing store rather than waiting for GC - this is what
      // keeps memory flat while scrolling a long lecture.
      const c = canvasRef.current;
      if (c) { c.width = 0; c.height = 0; }
      handleRef.current = null;
      registerPage(pageNumber, null);
      setReady(false);
    };
  }, [pdfDoc, pageNumber, scale, rotation, registerPage]);

  // Repaint highlights whenever the page or the annotation set changes.
  useEffect(() => {
    if (ready) paint();
  }, [ready, paint]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const h = handleRef.current;
    if (!h || h.hasText || !onPinPoint) return;
    // Only pages with no text layer accept pins - elsewhere this would fight
    // text selection.
    const box = e.currentTarget.getBoundingClientRect();
    const [x, y] = h.viewport.convertToPdfPoint(e.clientX - box.left, e.clientY - box.top);
    onPinPoint(pageNumber, { x, y });
  };

  return (
    <div
      ref={wrapRef}
      dir="ltr"
      data-page={pageNumber}
      onDoubleClick={handlePointerDown}
      className="relative mx-auto my-3 bg-white shadow-lg shadow-black/20"
      style={{
        width: size.width || undefined,
        height: size.height || undefined,
        ['--total-scale-factor' as any]: scale,
      }}
    >
      <canvas ref={canvasRef} className="block" />

      <div className="pdfHighlightLayer">
        {rects.map((r, i) => (
          <div
            key={`${r.id}-${i}`}
            className={`pdfHighlightRect${flashId === r.id ? ' pdfHighlightFlash' : ''}`}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: r.color }}
          />
        ))}
        {rects.map((r, i) => (
          <div
            key={`hit-${r.id}-${i}`}
            className="pdfHighlightHit"
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            onClick={() => {
              const a = annotations.find(x => x.id === r.id);
              if (a) onHighlightTap(a);
            }}
          />
        ))}
      </div>

      <div ref={textRef} className="textLayer" />
    </div>
  );
});
