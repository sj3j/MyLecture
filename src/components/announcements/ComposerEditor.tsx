import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Italic, Underline, Strikethrough, Code, Link2, Heading, X, Check } from 'lucide-react';
import type { RichBlock } from '../../types/announcement.types';
import { docToBlocks, blocksToDoc, safeUrl } from '../../lib/richText';

/**
 * The rich-text half of the composer. Lazy-loaded, and deliberately the only
 * module in the app that imports Tiptap.
 *
 * Tiptap is here for one specific reason rather than convenience: ProseMirror
 * handles IME composition events correctly. A hand-rolled contentEditable is
 * fine until someone types Arabic on GBoard inside an Android WebView, at which
 * point composition, autocorrect and cursor placement all start fighting each
 * other. That is not a bug you fix once.
 *
 * Only admins and moderators ever mount this, so the ~110KB never reaches a
 * student's bundle - see Composer.tsx, which React.lazy()s it.
 */

interface Props {
  initialBlocks: RichBlock[];
  onChange: (blocks: RichBlock[]) => void;
  isRtl: boolean;
  placeholder: string;
  /** Max height of the scrollable text area; the bar grows to this, then scrolls. */
  maxHeightClass?: string;
}

type ToolbarKey = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'heading';

const TOOLS: { key: ToolbarKey; Icon: typeof Bold; labelAr: string; labelEn: string }[] = [
  { key: 'bold', Icon: Bold, labelAr: 'عريض', labelEn: 'Bold' },
  { key: 'heading', Icon: Heading, labelAr: 'عنوان', labelEn: 'Headline' },
  { key: 'italic', Icon: Italic, labelAr: 'مائل', labelEn: 'Italic' },
  { key: 'underline', Icon: Underline, labelAr: 'تسطير', labelEn: 'Underline' },
  { key: 'strike', Icon: Strikethrough, labelAr: 'شطب', labelEn: 'Strikethrough' },
  { key: 'code', Icon: Code, labelAr: 'شفرة', labelEn: 'Code' },
];

export default function ComposerEditor({
  initialBlocks,
  onChange,
  isRtl,
  placeholder,
  maxHeightClass = 'max-h-[45vh]',
}: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // The block model stored in Firestore is a FLAT array of paragraphs and
        // headings. Every node disabled here is one that would force it into a
        // tree, so they are turned off at the schema rather than merely hidden
        // from the toolbar - otherwise a paste from Word reintroduces them.
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        heading: { levels: [3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto', 'tel'],
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: blocksToDoc(initialBlocks),
    onUpdate: ({ editor: e }) => onChange(docToBlocks(e.getJSON() as any)),
    editorProps: {
      attributes: {
        // dir="auto" so each paragraph picks its direction from its own first
        // strong character: an Arabic announcement quoting a Latin drug name
        // must not drag the whole block LTR.
        dir: 'auto',
        class: 'outline-none min-h-[24px] text-[15px] leading-relaxed text-slate-900 dark:text-stone-100',
      },
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive('bold'),
      italic: !!e?.isActive('italic'),
      underline: !!e?.isActive('underline'),
      strike: !!e?.isActive('strike'),
      code: !!e?.isActive('code'),
      heading: !!e?.isActive('heading', { level: 3 }),
      link: !!e?.isActive('link'),
      hasSelection: !!e && !e.state.selection.empty,
    }),
  });

  const toggle = useCallback((key: ToolbarKey) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (key === 'heading') chain.toggleHeading({ level: 3 }).run();
    else if (key === 'bold') chain.toggleBold().run();
    else if (key === 'italic') chain.toggleItalic().run();
    else if (key === 'underline') chain.toggleUnderline().run();
    else if (key === 'strike') chain.toggleStrike().run();
    else if (key === 'code') chain.toggleCode().run();
  }, [editor]);

  const openLink = useCallback(() => {
    if (!editor) return;
    setLinkValue(editor.getAttributes('link').href ?? '');
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = safeUrl(linkValue);
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkValue('');
  }, [editor, linkValue]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  const btn = (active: boolean) =>
    `w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
      active
        ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
    }`;

  return (
    <div className="flex flex-col min-h-0">
      <div className={`overflow-y-auto aesthetic-scrollbar px-1 ${maxHeightClass}`}>
        <EditorContent editor={editor} />
      </div>

      {linkOpen ? (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <input
            ref={linkInputRef}
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
            dir="ltr"
            inputMode="url"
            placeholder="https://..."
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg outline-none focus:border-sky-500 text-slate-900 dark:text-stone-100 text-left"
          />
          <button
            type="button"
            onClick={applyLink}
            aria-label={isRtl ? 'تطبيق الرابط' : 'Apply link'}
            className="w-9 h-9 shrink-0 rounded-lg bg-sky-600 text-white flex items-center justify-center hover:bg-sky-700"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            aria-label={isRtl ? 'إلغاء' : 'Cancel'}
            className="w-9 h-9 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /*
         * DOCKED under the text, not floating over the selection.
         *
         * SelectionToolbar.tsx in the PDF reader learned this the hard way:
         * Android draws its own selection menu at the selected text and it
         * cannot be suppressed from inside a WebView, so a floating bar lands
         * underneath it and the tap meant for "bold" hits "Select All" instead.
         * Docking also means the toolbar is reachable with nothing selected, so
         * a moderator can turn bold on and then type - which a selection-only
         * bubble structurally cannot offer.
         */
        <div
          className="flex items-center gap-0.5 mt-2 pt-2 border-t border-slate-100 dark:border-zinc-800 overflow-x-auto hide-scrollbar"
          // Never let a press here collapse the selection before the handler runs.
          onMouseDown={e => e.preventDefault()}
          onPointerDown={e => e.preventDefault()}
        >
          {TOOLS.map(({ key, Icon, labelAr, labelEn }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-label={isRtl ? labelAr : labelEn}
              aria-pressed={!!state?.[key]}
              title={isRtl ? labelAr : labelEn}
              className={btn(!!state?.[key])}
            >
              <Icon className="w-4 h-4" strokeWidth={2.5} />
            </button>
          ))}
          <button
            type="button"
            onClick={openLink}
            aria-label={isRtl ? 'رابط' : 'Link'}
            aria-pressed={!!state?.link}
            title={isRtl ? 'رابط' : 'Link'}
            className={btn(!!state?.link)}
          >
            <Link2 className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
