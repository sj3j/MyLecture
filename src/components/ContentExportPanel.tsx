import React, { useEffect, useMemo, useState } from 'react';
import { downloadZip } from 'client-zip';
import { Download, Loader2, AlertTriangle, FileText, Mic, CheckCircle2, X } from 'lucide-react';
import { Language } from '../types';
import {
  ArchiveSubject, collectArchive, archivePath, formatBytes,
} from '../lib/contentArchive';

/**
 * Downloads a year's lectures and recordings as one ZIP, laid out by subject.
 *
 * Sizes are why this is a picker rather than a button. A single subject's
 * recordings measured 756 MB on stage 3; a whole year across every subject is
 * several gigabytes, and there is no useful way to offer that as one blind
 * click. Lectures are PDFs and total tens of megabytes, so they are ticked by
 * default and recordings are opt-in.
 *
 * The bytes never pass through our server: both stores answer browser fetches
 * directly (see src/lib/contentArchive.ts), so this streams from R2 and
 * Firebase Storage into the ZIP as it is written.
 */

interface Selection {
  lectures: boolean;
  records: boolean;
  subjects: Record<string, boolean>;
}

const subjectKey = (s: ArchiveSubject) => `${s.stageId}::${s.subjectId}`;

/**
 * True when the browser can stream a file to disk.
 *
 * Without it the whole archive has to be assembled in memory before it can be
 * saved, which a multi-gigabyte selection will not survive - so the warning
 * below is shown rather than letting the tab die halfway through.
 */
const canStreamToDisk = (): boolean =>
  typeof (window as any).showSaveFilePicker === 'function';

export default function ContentExportPanel({
  lang, stageId, onClose,
}: {
  lang: Language;
  /** null exports every stage. Master admin only - the rules scope the rest. */
  stageId: string | null;
  onClose: () => void;
}) {
  const isRtl = lang === 'ar';

  const [subjects, setSubjects] = useState<ArchiveSubject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({
    lectures: true, records: false, subjects: {},
  });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await collectArchive(stageId);
        if (cancelled) return;
        setSubjects(found);
        setSelection({
          lectures: true,
          records: false,
          subjects: Object.fromEntries(found.map(s => [subjectKey(s), true])),
        });
      } catch (err: any) {
        console.error('Failed to collect the archive:', err);
        if (!cancelled) setLoadError(err.message || 'Failed to load content');
      }
    })();
    return () => { cancelled = true; };
  }, [stageId]);

  /** Exactly the files the current tick-boxes select, in ZIP order. */
  const chosen = useMemo(() => {
    if (!subjects) return [];
    const out: { path: string; url: string; bytes: number }[] = [];
    const includeStage = stageId === null;
    for (const subject of subjects) {
      if (!selection.subjects[subjectKey(subject)]) continue;
      if (selection.lectures) {
        for (const f of subject.lectures) {
          out.push({ path: archivePath(subject, 'lectures', f, includeStage), url: f.url, bytes: f.bytes });
        }
      }
      if (selection.records) {
        for (const f of subject.records) {
          out.push({ path: archivePath(subject, 'records', f, includeStage), url: f.url, bytes: f.bytes });
        }
      }
    }
    return out;
  }, [subjects, selection, stageId]);

  const totalBytes = chosen.reduce((sum, f) => sum + f.bytes, 0);
  const heavy = totalBytes > 1024 * 1024 * 1024;

  const toggleSubject = (key: string) =>
    setSelection(s => ({ ...s, subjects: { ...s.subjects, [key]: !s.subjects[key] } }));

  const setAllSubjects = (value: boolean) =>
    setSelection(s => ({
      ...s,
      subjects: Object.fromEntries(Object.keys(s.subjects).map(k => [k, value])),
    }));

  const handleDownload = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setProgress({ done: 0, total: chosen.length });

    const fileName = `mylecture-${stageId || 'all'}-${new Date().toISOString().split('T')[0]}.zip`;

    try {
      let completed = 0;

      // Fetched lazily, one at a time, as client-zip pulls from the iterator.
      // Building an array of Responses up front would open every connection at
      // once and hold every body in memory - the exact thing this avoids.
      async function* entries() {
        for (const file of chosen) {
          const response = await fetch(file.url);
          if (!response.ok) {
            console.warn('Skipping unreachable file:', file.path, response.status);
            completed++;
            setProgress({ done: completed, total: chosen.length });
            continue;
          }
          yield { name: file.path, input: response, lastModified: new Date() };
          completed++;
          setProgress({ done: completed, total: chosen.length });
        }
      }

      const zipped = downloadZip(entries());

      if (canStreamToDisk()) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        });
        const writable = await handle.createWritable();
        await zipped.body!.pipeTo(writable);
      } else {
        // No streaming save available: the archive has to be held in memory,
        // which is why the warning above tells them to use a desktop browser
        // for the large selections.
        const blob = await zipped.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      setDone(isRtl
        ? `تم تنزيل ${chosen.length} ملف.`
        : `Downloaded ${chosen.length} files.`);
    } catch (err: any) {
      // Dismissing the save dialog is a choice, not a failure.
      if (err?.name === 'AbortError') return;
      console.error('Archive download failed:', err);
      setError(err?.message || (isRtl ? 'فشل التنزيل' : 'Download failed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const box = 'w-4 h-4 rounded accent-emerald-600 shrink-0';

  return (
    <div className="p-4 bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 rounded-2xl space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm">
            {isRtl ? 'تصدير المحتوى' : 'Export content'}
          </h3>
          <p className="text-xs font-bold text-slate-400 mt-0.5 leading-relaxed">
            {isRtl
              ? 'ملف ZIP فيه مجلد لكل مادة، بداخله المحاضرات والتسجيلات.'
              : 'A ZIP with a folder per subject, holding its lectures and recordings.'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 shrink-0">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {!subjects && !loadError && (
        <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-xs font-bold">
          <Loader2 className="w-4 h-4 animate-spin" />
          {isRtl ? 'جاري حساب الحجم…' : 'Measuring…'}
        </div>
      )}

      {loadError && (
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{loadError}</span>
        </p>
      )}

      {subjects && subjects.length === 0 && (
        <p className="text-xs font-bold text-slate-400 py-4 text-center">
          {isRtl ? 'لا يوجد محتوى لتصديره.' : 'There is no content to export.'}
        </p>
      )}

      {subjects && subjects.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['lectures', FileText, isRtl ? 'المحاضرات' : 'Lectures',
                subjects.reduce((n, s) => n + s.lectures.length, 0),
                subjects.reduce((n, s) => n + s.lectures.reduce((a, f) => a + f.bytes, 0), 0)],
              ['records', Mic, isRtl ? 'التسجيلات' : 'Recordings',
                subjects.reduce((n, s) => n + s.records.length, 0),
                subjects.reduce((n, s) => n + s.records.reduce((a, f) => a + f.bytes, 0), 0)],
            ] as const).map(([key, Icon, label, count, bytes]) => (
              <button
                key={key}
                onClick={() => setSelection(s => ({ ...s, [key]: !s[key] }))}
                disabled={busy}
                className={`p-3 rounded-xl border-2 text-start transition-colors disabled:opacity-50 ${
                  selection[key]
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 shrink-0 ${selection[key] ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="font-black text-xs text-slate-800 dark:text-slate-100 truncate">{label}</span>
                </div>
                <div className="text-[11px] font-bold text-slate-400 mt-1" dir="ltr">
                  {count} · {formatBytes(bytes, isRtl)}
                </div>
              </button>
            ))}
          </div>

          <div className="border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-800">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                {isRtl ? 'المواد' : 'Subjects'}
              </span>
              <div className="flex gap-1.5">
                <button onClick={() => setAllSubjects(true)} disabled={busy}
                  className="text-[11px] font-bold text-sky-600 hover:underline disabled:opacity-50">
                  {isRtl ? 'الكل' : 'All'}
                </button>
                <button onClick={() => setAllSubjects(false)} disabled={busy}
                  className="text-[11px] font-bold text-slate-400 hover:underline disabled:opacity-50">
                  {isRtl ? 'لا شيء' : 'None'}
                </button>
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800">
              {subjects.map(subject => {
                const key = subjectKey(subject);
                const bytes =
                  (selection.lectures ? subject.lectures.reduce((a, f) => a + f.bytes, 0) : 0) +
                  (selection.records ? subject.records.reduce((a, f) => a + f.bytes, 0) : 0);
                const count =
                  (selection.lectures ? subject.lectures.length : 0) +
                  (selection.records ? subject.records.length : 0);
                return (
                  <label key={key} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className={box}
                      checked={!!selection.subjects[key]}
                      onChange={() => toggleSubject(key)}
                      disabled={busy}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                        {subject.subjectName}
                      </div>
                      {stageId === null && (
                        <div className="text-[10px] font-bold text-slate-400 font-mono">{subject.stageId}</div>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 shrink-0" dir="ltr">
                      {count} · {formatBytes(bytes, isRtl)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {heavy && !canStreamToDisk() && (
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-500 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                {isRtl
                  ? 'هذا المتصفح يجمع الملف في الذاكرة قبل الحفظ، وقد يفشل مع هذا الحجم. استخدم Chrome على الحاسوب، أو صدّر مواد أقل.'
                  : 'This browser assembles the archive in memory before saving and may fail at this size. Use Chrome on a desktop, or export fewer subjects.'}
              </span>
            </p>
          )}

          {error && (
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{error}</span>
            </p>
          )}

          {done && (
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {done}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs font-black text-slate-600 dark:text-slate-300" dir="ltr">
              {progress
                ? `${progress.done} / ${progress.total}`
                : `${chosen.length} · ${formatBytes(totalBytes, isRtl)}`}
            </div>
            <button
              onClick={handleDownload}
              disabled={busy || chosen.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isRtl ? 'تنزيل ZIP' : 'Download ZIP'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
