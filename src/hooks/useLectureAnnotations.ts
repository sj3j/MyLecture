import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PdfAnnotation } from '../types/pdfAnnotation.types';
import {
  listAnnotations,
  saveAnnotation,
  deleteAnnotation,
  deleteAllForLecture,
} from '../services/pdfAnnotationService';

/**
 * Every annotation for one lecture, held in memory for the life of the reader.
 *
 * Loaded once on open. A page render reads from the in-memory map and never
 * touches IndexedDB, because a DB round-trip inside a canvas render is exactly
 * where jank comes from. Mutations apply optimistically and persist in the
 * background - the same "assume success" posture mcqAnswerService takes.
 */
export function useLectureAnnotations(lectureId: string | null) {
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const liveLecture = useRef(lectureId);

  liveLecture.current = lectureId;

  useEffect(() => {
    let cancelled = false;
    if (!lectureId) { setAnnotations([]); setLoading(false); return; }

    setLoading(true);
    listAnnotations(lectureId).then(rows => {
      if (!cancelled) { setAnnotations(rows); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [lectureId]);

  /** Annotations bucketed by page, so a page component can grab its own in O(1). */
  const byPage = useMemo(() => {
    const map = new Map<number, PdfAnnotation[]>();
    for (const a of annotations) {
      const list = map.get(a.page);
      if (list) list.push(a);
      else map.set(a.page, [a]);
    }
    return map;
  }, [annotations]);

  const upsert = useCallback(async (a: PdfAnnotation) => {
    setAnnotations(prev => {
      const i = prev.findIndex(p => p.id === a.id);
      if (i === -1) return [...prev, a];
      const next = prev.slice();
      next[i] = a;
      return next;
    });
    await saveAnnotation(a);
  }, []);

  const remove = useCallback(async (id: string) => {
    const lid = liveLecture.current;
    setAnnotations(prev => prev.filter(p => p.id !== id));
    if (lid) await deleteAnnotation(id, lid);
  }, []);

  const removeAll = useCallback(async () => {
    const lid = liveLecture.current;
    setAnnotations([]);
    if (lid) await deleteAllForLecture(lid);
  }, []);

  return { annotations, byPage, loading, upsert, remove, removeAll };
}
