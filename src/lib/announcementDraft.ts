/**
 * Unsent-composer persistence.
 *
 * The composer is a docked bar now, not a modal, so leaving the screen is a
 * one-tap accident rather than a deliberate dismissal. NoteEditorSheet already
 * set the expectation for text surfaces in this app - it saves on unmount so a
 * tap-away never loses typing - and a half-written announcement with three
 * uploaded images is a far more expensive thing to lose than a PDF note.
 *
 * Stored in IndexedDB, not localStorage, for the reason localDb.ts documents at
 * length: localStorage is one ~5MB origin-wide quota that `mcq_cache_*` already
 * fills, and `setItem` throws synchronously, so a draft carrying a staged image
 * would break MCQ caching app-wide rather than merely failing to save.
 *
 * Keyed per stage: a master admin switching stages mid-compose must not have
 * one stage's draft reappear under another's feed.
 */

import { dbGet, dbPut, dbDelete, STORE_META, isLocalDbAvailable } from './localDb';
import type { RichBlock } from '../types/announcement.types';

export interface DraftPoll {
  question: string;
  options: { id: string; text: string }[];
  allowsMultiple: boolean;
}

export interface AnnouncementDraft {
  key: string;
  blocks: RichBlock[];
  poll: DraftPoll | null;
  linkUrl: string;
  linkTitle: string;
  selectedLectures: string[];
  /** Staged, not-yet-uploaded files. Dropped silently if the platform refuses
   *  to structured-clone them; the text half of the draft still survives. */
  files: File[];
  savedAt: number;
}

const keyFor = (stageId: string) => `announcementDraft:${stageId}`;

export async function loadDraft(stageId: string): Promise<AnnouncementDraft | null> {
  if (!isLocalDbAvailable() || !stageId) return null;
  try {
    const draft = await dbGet<AnnouncementDraft>(STORE_META, keyFor(stageId));
    if (!draft) return null;
    // A File that survived the round trip still deserializes as a File; anything
    // else in that array came back malformed and is not worth trusting.
    return { ...draft, files: (draft.files ?? []).filter(f => f instanceof File) };
  } catch {
    return null;
  }
}

export async function saveDraft(
  stageId: string,
  draft: Omit<AnnouncementDraft, 'key' | 'savedAt'>,
): Promise<void> {
  if (!isLocalDbAvailable() || !stageId) return;

  const record: AnnouncementDraft = { ...draft, key: keyFor(stageId), savedAt: Date.now() };

  try {
    await dbPut(STORE_META, record);
  } catch {
    // Almost always a structured-clone failure on the staged File objects, or a
    // quota rejection from one. Keeping the text is strictly better than
    // discarding the whole draft because an image would not fit.
    try {
      await dbPut(STORE_META, { ...record, files: [] });
    } catch {
      /* Drafts are a convenience; never let one break the composer. */
    }
  }
}

export async function clearDraft(stageId: string): Promise<void> {
  if (!isLocalDbAvailable() || !stageId) return;
  try {
    await dbDelete(STORE_META, keyFor(stageId));
  } catch {
    /* ignore */
  }
}

/** True when a draft holds nothing worth restoring, so an empty composer is not
 *  written to disk on every keystroke pause. */
export function isDraftEmpty(draft: Omit<AnnouncementDraft, 'key' | 'savedAt'>): boolean {
  return (
    !draft.blocks.some(b => b.text.trim().length > 0) &&
    !draft.poll &&
    !draft.files.length &&
    !draft.linkUrl.trim() &&
    !draft.selectedLectures.length
  );
}
