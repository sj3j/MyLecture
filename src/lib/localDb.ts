/**
 * The device-local database.
 *
 * A deliberate departure from this codebase's localStorage habit, for two
 * reasons that are specific rather than stylistic:
 *
 *   1. localStorage is one ~5MB quota shared across the whole origin, and
 *      `mcq_cache_${lectureId}` already fills it with generated MCQ payloads,
 *      unbounded and never evicted. `setItem` throws SYNCHRONOUSLY on overflow,
 *      so a student with a semester of highlights would not merely fail to save
 *      a note - they would break MCQ caching and offline-PDF bookkeeping too.
 *      Quota exhaustion here is an app-wide failure, not a feature-local one.
 *
 *   2. The native build's service worker (vite.config.ts `selfDestroying`)
 *      deletes EVERY CacheStorage cache on activate, and re-registers on every
 *      page load - so CacheStorage is wiped each launch. IndexedDB is untouched
 *      by it.
 *
 * Hand-rolled rather than pulling in `idb`: this is one open plus four helpers,
 * and the main bundle is already large enough to warn.
 */

const DB_NAME = 'mylecture-local';
const DB_VERSION = 1;

export const STORE_ANNOTATIONS = 'pdfAnnotations';
export const STORE_BLOBS = 'pdfBlobs';
export const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

/** True when IndexedDB is usable at all (private modes and old WebViews may not be). */
export function isLocalDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!isLocalDbAvailable()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
        const s = db.createObjectStore(STORE_ANNOTATIONS, { keyPath: 'id' });
        s.createIndex('by_lecture', 'lectureId', { unique: false });
        s.createIndex('by_lecture_page', ['lectureId', 'page'], { unique: false });
        s.createIndex('by_updated', 'updatedAt', { unique: false });
      }
      // Downloaded PDF bytes. Keyed by URL to match how useOfflinePDF already
      // thinks about them.
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // Another tab opened a newer version; let go so it can upgrade.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });

  // A failed open must not be cached forever - a later call may succeed.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const dbGet = <T>(store: string, key: IDBValidKey) =>
  run<T | undefined>(store, 'readonly', s => s.get(key));

export const dbPut = <T>(store: string, value: T) =>
  run<IDBValidKey>(store, 'readwrite', s => s.put(value as any));

export const dbDelete = (store: string, key: IDBValidKey) =>
  run<undefined>(store, 'readwrite', s => s.delete(key));

export const dbGetAllByIndex = <T>(store: string, index: string, query: IDBValidKey | IDBKeyRange) =>
  run<T[]>(store, 'readonly', s => s.index(index).getAll(query));

/** Deletes every record matching an index query, in one transaction. */
export function dbDeleteByIndex(store: string, index: string, query: IDBValidKey | IDBKeyRange): Promise<number> {
  return openDb().then(db => new Promise<number>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const cursorReq = tx.objectStore(store).index(index).openCursor(query);
    let removed = 0;
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) { cursor.delete(); removed++; cursor.continue(); }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
    tx.oncomplete = () => resolve(removed);
    tx.onabort = () => reject(tx.error);
  }));
}
