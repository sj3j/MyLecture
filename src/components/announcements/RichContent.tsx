import React from 'react';
import type { RichBlock, RichEntity } from '../../types/announcement.types';
import { safeUrl } from '../../lib/richText';

/**
 * Renders a stored announcement body.
 *
 * Zero dependencies by design. The composer lazy-loads Tiptap, but every student
 * hits this path on every post, so it stays a plain slice-and-emit walk over the
 * text: cut the string wherever the active mark set changes, wrap each run in
 * real React elements. Nothing here ever touches dangerouslySetInnerHTML, which
 * is why the app still needs no sanitiser.
 *
 * A post with no `richBlocks` - every bot-authored one, and anything written
 * before the composer landed - falls through to `text` with the bare-URL
 * autolinker that this screen has always had.
 */

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
// Separate, non-global twin. `test()` on a /g regex advances lastIndex, so
// reusing URL_SPLIT here would make every second call return false.
const URL_TEST = /^https?:\/\/[^\s]+$/;

/** Bare URLs inside an unmarked run stay clickable, as they were before rich
 *  text existed. A run that already carries a link mark is left alone so the
 *  two never nest. */
function autoLink(value: string, keyPrefix: string): React.ReactNode[] {
  return value.split(URL_SPLIT).map((part, i) => {
    const href = URL_TEST.test(part) ? safeUrl(part) : null;
    return href ? (
      <a
        key={`${keyPrefix}-${i}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-600 dark:text-sky-400 hover:underline break-all"
      >
        {part}
      </a>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
    );
  });
}

/**
 * Wrapping order is fixed rather than incidental: link outermost so the whole
 * styled run is one tap target, then the visual marks, then code innermost so
 * its background box hugs the glyphs.
 */
function wrap(node: React.ReactNode, marks: RichEntity[], key: string): React.ReactNode {
  let out = node;

  if (marks.some(m => m.type === 'code')) {
    out = <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-zinc-900 text-[0.9em] font-mono">{out}</code>;
  }
  if (marks.some(m => m.type === 'strike')) out = <s>{out}</s>;
  if (marks.some(m => m.type === 'underline')) out = <u>{out}</u>;
  if (marks.some(m => m.type === 'italic')) out = <em>{out}</em>;
  if (marks.some(m => m.type === 'bold')) out = <strong className="font-black">{out}</strong>;

  const link = marks.find(m => m.type === 'link');
  const href = link ? safeUrl(link.url) : null;
  if (href) {
    out = (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline underline-offset-2">
        {out}
      </a>
    );
  }

  return <React.Fragment key={key}>{out}</React.Fragment>;
}

function renderBlock(block: RichBlock, blockKey: string): React.ReactNode[] {
  const entities = block.entities ?? [];
  if (!entities.length) return autoLink(block.text, blockKey);

  // Every entity boundary is a cut point; between two adjacent cuts the active
  // mark set is constant, so each slice needs exactly one wrap.
  const cuts = new Set<number>([0, block.text.length]);
  for (const e of entities) {
    cuts.add(Math.max(0, Math.min(e.offset, block.text.length)));
    cuts.add(Math.max(0, Math.min(e.offset + e.length, block.text.length)));
  }
  const points = [...cuts].sort((a, b) => a - b);

  const out: React.ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [start, end] = [points[i], points[i + 1]];
    const slice = block.text.slice(start, end);
    if (!slice) continue;

    const active = entities.filter(e => start >= e.offset && end <= e.offset + e.length);
    const key = `${blockKey}-${start}`;

    out.push(
      active.length
        ? wrap(slice, active, key)
        : <React.Fragment key={key}>{autoLink(slice, key)}</React.Fragment>
    );
  }
  return out;
}

interface Props {
  blocks?: RichBlock[];
  /** Fallback for posts stored before rich text, and for bot-authored posts. */
  text?: string;
  className?: string;
}

export default function RichContent({ blocks, text, className = '' }: Props) {
  const hasBlocks = blocks?.some(b => b.text.trim().length > 0);

  if (!hasBlocks) {
    if (!text?.trim()) return null;
    return (
      <p className={`text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-snug ${className}`} dir="auto">
        {autoLink(text, 'plain')}
      </p>
    );
  }

  return (
    <div className={className}>
      {blocks!.map((block, i) => {
        const key = `b${i}`;
        // dir="auto" per block, not on the wrapper: a post whose heading is
        // Arabic and whose body opens with a Latin drug name has to resolve
        // direction independently for each, which one shared container cannot do.
        return block.type === 'h' ? (
          <h3 key={key} className="text-base font-black text-slate-900 dark:text-stone-100 leading-snug mt-2 first:mt-0 mb-1" dir="auto">
            {renderBlock(block, key)}
          </h3>
        ) : (
          <p key={key} className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-snug mb-1 last:mb-0" dir="auto">
            {renderBlock(block, key)}
          </p>
        );
      })}
    </div>
  );
}
