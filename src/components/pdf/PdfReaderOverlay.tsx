import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Loader2, Minus, NotebookPen, Plus, RotateCw, X,
} from 'lucide-react';
import PdfPage, { type PageHandle } from './PdfPage';
import SelectionToolbar from './SelectionToolbar';
import NoteEditorSheet from './NoteEditorSheet';
import NotesDrawer from './NotesDrawer';
import { ConfirmModal } from '../ui/ConfirmModal';
import { loadPdfjs, fetchPdfBytes, freshBytes, PDFJS_DOC_OPTIONS } from '../../lib/pdfjs';
import { readStoredPdf } from '../../hooks/useOfflinePDF';
import { buildAnchor, canonicalOffsetWithin, rectsToQuads } from '../../lib/pdfAnchor';
import { useLectureAnnotations } from '../../hooks/useLectureAnnotations';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import { exportLecture, getDocMeta, setDocMeta } from '../../services/pdfAnnotationService';
import type { HighlightColor, PdfAnnotation } from '../../types/pdfAnnotation.types';
import type { Language } from '../../types';
import '../../styles/pdf-text-layer.css';

interface Props {
  lectureId: string;
  lectureTitle: string;
  pdfUrl: string;
  lang: Language;
  onClose: () => void;
}

interface SelectionFragment {
  pageNumber: number;
  start: number;
  end: number;
  quads: [number, number, number, number][];
  pageW: number;
  pageH: number;
  canonicalText: string;
}

interface SelectionSnapshot {
  text: string;
  fragments: SelectionFragment[];
}

// Stable identity so a page without annotations does not defeat PdfPage memo.
const NO_ANNOTATIONS: PdfAnnotation[] = [];

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

export default function PdfReaderOverlay({ lectureId, lectureTitle, pdfUrl, lang, onClose }: Props) {
  const isRtl = lang === 'ar';

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [staleFile, setStaleFile] = useState(false);

  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [editing, setEditing] = useState<PdfAnnotation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const pages = useRef(new Map<number, PageHandle>());
  const fingerprint = useRef('');
  const pendingPage = useRef<number | null>(null);

  const { annotations, byPage, upsert, remove, removeAll } = useLectureAnnotations(lectureId);

  useBackDismiss(true, onClose, 'pdfReader');
  useBackDismiss(drawerOpen, () => setDrawerOpen(false), 'pdfNotes');
  useBackDismiss(!!editing, () => setEditing(null), 'pdfNote');

  const registerPage = useCallback((n: number, h: PageHandle | null) => {
    if (h) pages.current.set(n, h);
    else pages.current.delete(n);
  }, []);

  const markOrphan = useCallback((id: string, orphaned: boolean) => {
    setOrphanIds(prev => {
      if (orphaned === prev.has(id)) return prev;
      const next = new Set(prev);
      if (orphaned) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // ---- document loading -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        // Prefer the downloaded copy: it works offline and skips the network
        // entirely for a lecture the student already saved.
        const [pdfjs, local] = await Promise.all([
          loadPdfjs(),
          readStoredPdf(pdfUrl),
        ]);
        if (cancelled) return;
        const buf = local ?? await fetchPdfBytes(pdfUrl, ac.signal);
        if (cancelled) return;

        const doc = await pdfjs.getDocument({
          ...PDFJS_DOC_OPTIONS,
          data: freshBytes(buf),
        }).promise;
        if (cancelled) { doc.destroy(); return; }

        const sizes: { w: number; h: number }[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const v = p.getViewport({ scale: 1, rotation: 0 });
          sizes.push({ w: v.width, h: v.height });
        }
        if (cancelled) { doc.destroy(); return; }

        fingerprint.current = doc.fingerprints?.[0] ?? '';

        // Warn rather than silently misplace highlights if the file changed.
        const meta = await getDocMeta(lectureId);
        if (meta?.fingerprint && meta.fingerprint !== fingerprint.current) setStaleFile(true);

        // Claim the remembered page BEFORE any state update below. `layout` is
        // derived from pageSizes, so the effect that consumes this fires as soon
        // as setPageSizes lands - and anything set after a later `await` would
        // arrive too late to be seen.
        if (meta?.lastPage && meta.lastPage > 1) pendingPage.current = meta.lastPage;

        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setPageSizes(sizes);

        // Always open at fit-width. These are wide lecture slides, and the
        // PDF's natural size overflows a phone screen and clips the text.
        // Zoom is deliberately NOT restored: persisting it meant one bad stored
        // value stuck forever, and reopening at readable width is what every
        // PDF reader does. Page position is still remembered.
        const avail = (scrollRef.current?.clientWidth ?? window.innerWidth) - 16;
        const widest = Math.max(...sizes.map(z => z.w));
        if (widest > 0) {
          setScale(+Math.max(MIN_SCALE, Math.min(MAX_SCALE, avail / widest)).toFixed(2));
        }

        await setDocMeta(lectureId, {
          fingerprint: fingerprint.current,
          pageCount: doc.numPages,
        });

      } catch (e: any) {
        if (cancelled || e?.name === 'AbortError') return;
        console.error('PDF load failed', e);
        setError(
          isRtl
            ? 'تعذّر فتح ملف المحاضرة. تحقق من الاتصال وحاول مرة أخرى.'
            : 'Could not open this lecture file. Check your connection and try again.',
        );
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, lectureId]);

  // Tear the document down explicitly - the worker holds page resources.
  useEffect(() => () => { try { pdfDoc?.destroy(); } catch { /* already gone */ } }, [pdfDoc]);

  // Remember where the reader was left.
  useEffect(() => {
    if (!pdfDoc) return;
    const id = setTimeout(() => setDocMeta(lectureId, { lastPage: current }), 400);
    return () => clearTimeout(id);
  }, [current, lectureId, pdfDoc]);

  // ---- layout / virtualization -----------------------------------------
  const layout = useMemo(() => {
    const swap = rotation % 180 !== 0;
    let y = 0;
    return pageSizes.map((s) => {
      const w = (swap ? s.h : s.w) * scale;
      const h = (swap ? s.w : s.h) * scale;
      const top = y;
      y += h + 24; // matches the my-3 gap on each page
      return { top, w, h };
    });
  }, [pageSizes, scale, rotation]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || layout.length === 0) return;
    const mid = el.scrollTop + el.clientHeight / 2;
    let n = 1;
    for (let i = 0; i < layout.length; i++) {
      if (layout[i].top <= mid) n = i + 1; else break;
    }
    setCurrent(n);
  }, [layout]);

  const scrollToPage = useCallback((n: number) => {
    const el = scrollRef.current;
    if (!el || !layout[n - 1]) return;
    el.scrollTo({ top: Math.max(0, layout[n - 1].top - 8), behavior: 'smooth' });
  }, [layout]);

  // Once the page boxes exist, honour a remembered page.
  useEffect(() => {
    if (pendingPage.current && layout.length > 0) {
      const n = pendingPage.current;
      pendingPage.current = null;
      requestAnimationFrame(() => scrollToPage(n));
    }
  }, [layout, scrollToPage]);

  /** Only the visible page and its neighbours are mounted - the rest are boxes. */
  const isLive = (n: number) => Math.abs(n - current) <= 1;

  // ---- selection --------------------------------------------------------
  /** DOM position -> canonical offset within a page. */
  const canonicalOffset = (h: PageHandle, node: Node, offset: number): number | null => {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
    const span = el?.closest('[data-item-index]') as HTMLElement | null;
    if (!span) return null;
    const itemIndex = Number(span.dataset.itemIndex);
    const r = h.canonical.itemRanges[itemIndex];
    if (!r) return null;
    return r.start + canonicalOffsetWithin(span.textContent ?? '', offset);
  };

  const fragmentFor = (range: Range, h: PageHandle): SelectionFragment | null => {
    if (!range.intersectsNode(h.textLayerEl)) return null;

    const spans = [...h.spanByItem.values()];
    if (spans.length === 0) return null;

    // Clamp the selection to this page: if it started or ended on another page,
    // use this page's own first/last text node instead.
    const sub = document.createRange();
    const startsHere = h.textLayerEl.contains(range.startContainer);
    const endsHere = h.textLayerEl.contains(range.endContainer);
    try {
      if (startsHere) sub.setStart(range.startContainer, range.startOffset);
      else sub.setStart(spans[0].firstChild ?? spans[0], 0);

      if (endsHere) sub.setEnd(range.endContainer, range.endOffset);
      else {
        const last = spans[spans.length - 1];
        const node = last.firstChild ?? last;
        sub.setEnd(node, node.textContent?.length ?? 0);
      }
    } catch {
      return null;
    }
    if (sub.collapsed) return null;

    const start = canonicalOffset(h, sub.startContainer, sub.startOffset);
    const end = canonicalOffset(h, sub.endContainer, sub.endOffset);
    if (start === null || end === null || end <= start) return null;

    const box = h.el.getBoundingClientRect();
    const clientRects = Array.from(sub.getClientRects()) as DOMRect[];
    return {
      pageNumber: h.pageNumber,
      start,
      end,
      quads: rectsToQuads(clientRects, { left: box.left, top: box.top }, h.viewport),
      pageW: h.pageW,
      pageH: h.pageH,
      canonicalText: h.canonical.text,
    };
  };

  /**
   * Snapshot the selection the moment it happens.
   *
   * iOS collapses the selection on the first DOM mutation, so reading
   * window.getSelection() later - inside the toolbar's click handler - returns
   * nothing. Everything the toolbar needs is captured here instead.
   */
  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelection(null); return; }

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text) { setSelection(null); return; }

    const fragments: SelectionFragment[] = [];
    for (const h of pages.current.values()) {
      const f = fragmentFor(range, h);
      if (f) fragments.push(f);
    }
    if (fragments.length === 0) { setSelection(null); return; }

    setSelection({
      text,
      fragments: fragments.sort((a, b) => a.pageNumber - b.pageNumber),
    });
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onChange = () => { clearTimeout(t); t = setTimeout(captureSelection, 140); };
    document.addEventListener('selectionchange', onChange);
    return () => { document.removeEventListener('selectionchange', onChange); clearTimeout(t); };
  }, [captureSelection]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  /** One annotation per page the selection touched, tied by a shared groupId. */
  const createHighlight = async (color: HighlightColor, openNote: boolean) => {
    const snap = selection;
    if (!snap) return;

    const groupId = snap.fragments.length > 1 ? crypto.randomUUID() : undefined;
    const now = Date.now();
    let first: PdfAnnotation | null = null;

    for (const f of snap.fragments) {
      const a: PdfAnnotation = {
        id: crypto.randomUUID(),
        lectureId,
        docFingerprint: fingerprint.current,
        kind: 'highlight',
        page: f.pageNumber,
        color,
        groupId,
        anchor: buildAnchor({
          text: f.canonicalText,
          start: f.start,
          end: f.end,
          quads: f.quads,
          pageW: f.pageW,
          pageH: f.pageH,
        }),
        createdAt: now,
        updatedAt: now,
        schema: 1,
      };
      if (!first) first = a;
      await upsert(a);
    }

    clearSelection();
    if (openNote && first) setEditing(first);
  };

  const addPin = async (pageNumber: number, point: { x: number; y: number }) => {
    const now = Date.now();
    const a: PdfAnnotation = {
      id: crypto.randomUUID(),
      lectureId,
      docFingerprint: fingerprint.current,
      kind: 'pin',
      page: pageNumber,
      color: 'yellow',
      point,
      createdAt: now,
      updatedAt: now,
      schema: 1,
    };
    await upsert(a);
    setEditing(a);
  };

  const goTo = (a: PdfAnnotation) => {
    setDrawerOpen(false);
    scrollToPage(a.page);
    setFlashId(a.id);
    setTimeout(() => setFlashId(null), 1400);
  };

  const doExport = async () => {
    const json = await exportLecture(lectureId, lectureTitle);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lectureTitle || 'lecture'}-notes.json`.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const Back = isRtl ? ChevronRight : ChevronLeft;
  const Fwd = isRtl ? ChevronLeft : ChevronRight;
  const noteCount = annotations.length;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="pdfReaderSurface fixed inset-0 z-[160] bg-white dark:bg-zinc-900 flex flex-col overflow-hidden"
    >
      <header className="shrink-0 flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 border-b border-slate-200 dark:border-zinc-800">
        <button
          onClick={onClose}
          aria-label={isRtl ? 'إغلاق' : 'Close'}
          className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <h1 dir="auto" className="flex-1 min-w-0 truncate font-bold text-slate-900 dark:text-stone-100">
          {lectureTitle}
        </h1>

        <button
          onClick={() => setDrawerOpen(true)}
          aria-label={isRtl ? 'ملاحظاتي' : 'My notes'}
          className="relative p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <NotebookPen className="w-6 h-6" />
          {noteCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-black flex items-center justify-center">
              {noteCount}
            </span>
          )}
        </button>
      </header>

      {staleFile && (
        <div className="shrink-0 flex items-start gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 text-xs font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {isRtl
              ? 'هذه الملاحظات كُتبت على نسخة أقدم من هذا الملف، وقد لا تكون في مواضعها.'
              : 'These notes were made on an older version of this file and may not line up.'}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        dir="ltr"
        className="flex-1 overflow-y-auto overflow-x-auto bg-slate-200 dark:bg-zinc-950 px-2"
      >
        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500" />
            <p dir={isRtl ? 'rtl' : 'ltr'} className="text-slate-600 dark:text-slate-300 font-bold">{error}</p>
          </div>
        )}

        {!error && !pdfDoc && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        )}

        {pdfDoc && layout.map((box, i) => {
          const n = i + 1;
          return isLive(n) ? (
            <PdfPage
              key={n}
              pdfDoc={pdfDoc}
              pageNumber={n}
              scale={scale}
              rotation={rotation}
              annotations={byPage.get(n) ?? NO_ANNOTATIONS}
              registerPage={registerPage}
              onHighlightTap={setEditing}
              onOrphan={markOrphan}
              onPinPoint={addPin}
              flashId={flashId}
            />
          ) : (
            // Placeholder keeps the scroll height honest while unmounted, so
            // scrolling a 100-page lecture does not shift under the finger.
            <div
              key={n}
              className="mx-auto my-3 bg-white/60 dark:bg-zinc-800/40 rounded"
              style={{ width: box.w, height: box.h }}
            />
          );
        })}
      </div>

      <footer className="shrink-0 flex items-center justify-center gap-1 px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] border-t border-slate-200 dark:border-zinc-800">
        <button
          onClick={() => scrollToPage(Math.max(1, current - 1))}
          disabled={current <= 1}
          aria-label={isRtl ? 'السابق' : 'Previous'}
          className="p-2 rounded-full text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Back className="w-5 h-5" />
        </button>

        <span dir="ltr" className="min-w-[72px] text-center text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
          {current} / {pageCount || '-'}
        </span>

        <button
          onClick={() => scrollToPage(Math.min(pageCount, current + 1))}
          disabled={current >= pageCount}
          aria-label={isRtl ? 'التالي' : 'Next'}
          className="p-2 rounded-full text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Fwd className="w-5 h-5" />
        </button>

        <span className="w-px h-6 bg-slate-200 dark:bg-zinc-700 mx-2" />

        <button
          onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - 0.25).toFixed(2)))}
          disabled={scale <= MIN_SCALE}
          aria-label={isRtl ? 'تصغير' : 'Zoom out'}
          className="p-2 rounded-full text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Minus className="w-5 h-5" />
        </button>
        <span className="min-w-[46px] text-center text-xs font-bold text-slate-500 tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + 0.25).toFixed(2)))}
          disabled={scale >= MAX_SCALE}
          aria-label={isRtl ? 'تكبير' : 'Zoom in'}
          className="p-2 rounded-full text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          onClick={() => setRotation(r => (r + 90) % 360)}
          aria-label={isRtl ? 'تدوير' : 'Rotate'}
          className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </footer>

      <AnimatePresence>
        {selection && (
          <SelectionToolbar
            isRtl={isRtl}
            onPick={(c) => createHighlight(c, false)}
            onNote={() => createHighlight('yellow', true)}
            onCopy={() => {
              navigator.clipboard?.writeText(selection.text).catch(() => { /* denied */ });
              clearSelection();
            }}
            onDismiss={clearSelection}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <NoteEditorSheet
            annotation={editing}
            isRtl={isRtl}
            onSave={(note) => upsert({ ...editing, note, updatedAt: Date.now() })}
            onDelete={() => { remove(editing.id); setEditing(null); }}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <NotesDrawer
            annotations={annotations}
            orphanIds={orphanIds}
            isRtl={isRtl}
            onGoTo={goTo}
            onDelete={remove}
            onExport={doExport}
            onDeleteAll={() => setConfirmWipe(true)}
            onClose={() => setDrawerOpen(false)}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        onConfirm={() => { removeAll(); setConfirmWipe(false); setDrawerOpen(false); }}
        title={isRtl ? 'حذف كل الملاحظات' : 'Delete all notes'}
        message={isRtl
          ? 'سيتم حذف كل التظليلات والملاحظات في هذه المحاضرة من هذا الجهاز. لا يمكن التراجع.'
          : 'Every highlight and note for this lecture will be removed from this device. This cannot be undone.'}
      />
    </div>
  );
}
