/**
 * Deleting the binary objects a year-end wipe leaves behind.
 *
 * Separated from shared/yearWipe.ts because this is the only genuinely
 * irreversible half. Firestore documents are snapshotted into
 * `contentArchives/{yearLabel}` before deletion; these objects are not, and
 * cannot be - a year of recordings is hundreds of megabytes.
 *
 * Nothing in this repo deleted a stored object before, anywhere, except one
 * best-effort call in src/components/LectureCard.tsx. Every other delete path -
 * records, announcements, homework, chat attachments, profile photos - has
 * always orphaned its file. R2 and Storage therefore already hold a backlog of
 * objects from previous years that this does not touch: it deletes only what the
 * manifest recorded, never a prefix scan, so it can never reach further than the
 * year it was handed.
 *
 * Both clients are injected rather than constructed here: server.ts and
 * api/index.ts each build their own, and this module must not import
 * firebase-admin or the S3 SDK itself.
 */
import type { WipeFile } from './yearWipe.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FileDeletionResult {
  /** Objects confirmed gone. */
  deleted: number;
  /** Objects that were already absent. Not an error - a retry hits this. */
  missing: number;
  /** Objects that could not be deleted, with the reason. */
  failed: { key: string; kind: string; reason: string }[];
  /** True when no client was available for that store, so nothing was attempted. */
  skippedR2: boolean;
  skippedStorage: boolean;
}

export interface FileDeletionDeps {
  /** An @aws-sdk/client-s3 S3Client, or null when R2 is not configured. */
  s3?: { send(command: any): Promise<any> } | null;
  /** Constructor for DeleteObjectCommand, injected for the same reason. */
  DeleteObjectCommand?: new (input: { Bucket: string; Key: string }) => any;
  r2Bucket?: string;
  /** A firebase-admin Storage bucket, or null. */
  storageBucket?: { file(path: string): { delete(): Promise<any> } } | null;
}

/** A missing object is a success for our purposes - the goal is "not there". */
function isNotFound(err: any): boolean {
  const code = err?.code ?? err?.$metadata?.httpStatusCode ?? err?.Code ?? err?.name;
  return code === 404 || code === 'NoSuchKey' || code === 'NotFound' || code === 'ENOENT';
}

/**
 * Deletes every object in `files`.
 *
 * Failures are collected, never thrown: a wipe that has already emptied
 * Firestore must not abort half way through its own cleanup, leaving the caller
 * unable to tell what happened. The result is what gets reported to the admin.
 */
export async function deleteWipedFiles(
  files: WipeFile[],
  deps: FileDeletionDeps,
): Promise<FileDeletionResult> {
  const { s3, DeleteObjectCommand, r2Bucket, storageBucket } = deps;

  const canR2 = !!(s3 && DeleteObjectCommand && r2Bucket);
  const canStorage = !!storageBucket;

  const result: FileDeletionResult = {
    deleted: 0,
    missing: 0,
    failed: [],
    skippedR2: !canR2,
    skippedStorage: !canStorage,
  };

  // Duplicate keys are normal - two documents can reference one object, and a
  // second delete of the same key would be reported as a spurious "missing".
  const seen = new Set<string>();

  for (const file of files) {
    const dedupeKey = `${file.kind}:${file.key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (file.kind === 'r2') {
      if (!canR2) continue;
      try {
        await s3!.send(new DeleteObjectCommand!({ Bucket: r2Bucket!, Key: file.key }));
        result.deleted++;
      } catch (err: any) {
        if (isNotFound(err)) result.missing++;
        else result.failed.push({ key: file.key, kind: 'r2', reason: String(err?.message || err) });
      }
      continue;
    }

    if (!canStorage) continue;
    try {
      await storageBucket!.file(file.key).delete();
      result.deleted++;
    } catch (err: any) {
      if (isNotFound(err)) result.missing++;
      else result.failed.push({ key: file.key, kind: 'storage', reason: String(err?.message || err) });
    }
  }

  return result;
}
