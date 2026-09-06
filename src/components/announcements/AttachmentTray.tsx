import React, { useEffect, useState } from 'react';
import { X, FileText, Film, Loader2 } from 'lucide-react';

/**
 * Staged, not-yet-uploaded files inside the composer.
 *
 * Shows a real progress bar per file. The old composer passed `null` where
 * uploadBytesResumable takes its progress callback, so a moderator attaching a
 * 40MB video on campus wifi got a spinner with no indication of whether
 * anything was happening - and no way to tell a slow upload from a dead one.
 */

export interface StagedFile {
  file: File;
  /** 0-100, or undefined before the upload starts. */
  progress?: number;
}

const humanSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Object URLs are revoked on unmount; a composer session that stages and drops
 *  a dozen images otherwise leaks every one of them for the page's lifetime. */
function useObjectUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}

interface TileProps {
  staged: StagedFile;
  onRemove: () => void;
  busy: boolean;
  isRtl: boolean;
  // @types/react is not installed, so JSX does not model `key` for us. The
  // repo's existing convention is to declare it on the props interface -
  // see LectureCard, SettingsRow and ProfilePrimitives.
  key?: React.Key;
}

function Tile({ staged, onRemove, busy, isRtl }: TileProps) {
  const { file, progress } = staged;
  const preview = useObjectUrl(file);
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  return (
    <div className="relative shrink-0 w-20 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950">
      <div className="h-16 flex items-center justify-center bg-slate-50 dark:bg-zinc-900">
        {isImage && preview ? (
          <img src={preview} alt={file.name} className="w-full h-full object-cover" />
        ) : isVideo ? (
          <Film className="w-6 h-6 text-slate-400" />
        ) : (
          <FileText className="w-6 h-6 text-slate-400" />
        )}
      </div>

      <p className="px-1.5 py-1 text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate" dir="auto">
        {file.name}
      </p>
      <p className="px-1.5 pb-1 text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
        {humanSize(file.size)}
      </p>

      {typeof progress === 'number' && progress < 100 && (
        <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1">
          <Loader2 className="w-4 h-4 text-white animate-spin" />
          <span className="text-[10px] font-black text-white tabular-nums">{Math.round(progress)}%</span>
          <span className="absolute bottom-0 inset-x-0 h-1 bg-white/25">
            <span className="block h-full bg-sky-400 transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </span>
        </div>
      )}

      {!busy && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={isRtl ? 'إزالة المرفق' : 'Remove attachment'}
          className="absolute top-1 end-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
        >
          <X className="w-3 h-3" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

interface Props {
  staged: StagedFile[];
  onRemove: (index: number) => void;
  busy: boolean;
  isRtl: boolean;
}

export default function AttachmentTray({ staged, onRemove, busy, isRtl }: Props) {
  if (!staged.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto aesthetic-scrollbar pb-1 -mx-1 px-1">
      {staged.map((item, i) => (
        <Tile
          key={`${item.file.name}-${item.file.size}-${i}`}
          staged={item}
          onRemove={() => onRemove(i)}
          busy={busy}
          isRtl={isRtl}
        />
      ))}
    </div>
  );
}
