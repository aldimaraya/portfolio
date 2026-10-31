import type { BorderInsets } from '@/lib/photo/border';
import type { ClipFields, MediaKind, StillFields } from './drafts';

/**
 * Where the Add media queue keeps what it has processed but not yet uploaded:
 * IndexedDB, in this browser. Nothing reaches R2 until Publish, so a file
 * picked by mistake costs no storage and no write operations — and a refresh
 * or a closed tab loses nothing that had finished processing.
 *
 * IndexedDB rather than localStorage because the payload is the processed
 * files themselves (a re-encoded clip is ~45 MB a minute), and localStorage
 * holds about 5 MB of strings. Two object stores: the item's details, written
 * on every edit, and its files, written once — so typing a place does not
 * rewrite a clip.
 *
 * Browser-only. Every call opens the database afresh; it is cheap, and a
 * cached handle goes stale if another tab upgrades the schema.
 */

const DB_NAME = 'add-media-queue';
const VERSION = 1;
const ITEMS = 'items';
const FILES = 'files';

interface StoredBase {
  key: string;
  name: string;
  /** When it was added, for the queue's order after a reload. */
  added: number;
  note: string;
  warning: string;
  width: number;
  height: number;
  selected: boolean;
  /**
   * Where Publish put the main file, written just before the draft row is
   * created. A reload that finds a draft with this URL knows this copy already
   * became that row — the tab closed before the copy could be forgotten.
   */
  sentUrl?: string;
}

export type StoredItem =
  | (StoredBase & {
      kind: Extract<MediaKind, 'still'>;
      fields: StillFields;
      /** The border cut from the original, or null if none was. */
      insets: BorderInsets | null;
      colour: { avgHue: number; avgChroma: number; avgLightness: number; warmth: number; isMonochrome: boolean };
    })
  | (StoredBase & {
      kind: Extract<MediaKind, 'clip'>;
      fields: ClipFields;
      durationSeconds: number;
      spriteFrames: number;
      /** Where the preview frames were taken from, and how much they span. Absent on items stored before the picker. */
      windowStart?: number;
      windowSeconds?: number;
    });

/**
 * The bytes Publish will send. `upload` is the processed still or the clip as
 * it will be stored; `original` is a still's picked file, kept so a trim review
 * starts from the uncut picture — and never uploaded, since it carries EXIF.
 */
export interface StoredFiles {
  key: string;
  upload: File;
  original?: File;
  poster?: Blob;
  sprite?: Blob;
  /** A clip's hand-picked thumbnail, already re-encoded; wins over the grabbed poster. */
  cover?: File;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs `work` in one transaction and resolves once it has committed — not merely been queued. */
async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = work(tx);
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('The browser refused to store this'));
    });
  } finally {
    db.close();
  }
}

/**
 * A finished item, details and files together, so a reload never finds one
 * without the other. Asks the browser to keep the data through storage
 * pressure the first time — without that, a browser short on disk may clear it.
 */
export async function storeItem(item: StoredItem, files: StoredFiles): Promise<void> {
  void navigator.storage?.persist?.().catch(() => undefined);
  await transact([ITEMS, FILES], 'readwrite', (tx) => {
    tx.objectStore(ITEMS).put(item);
    tx.objectStore(FILES).put(files);
  });
}

/** Just the details — what every edit writes. */
export async function storeDetails(item: StoredItem): Promise<void> {
  await transact([ITEMS], 'readwrite', (tx) => {
    tx.objectStore(ITEMS).put(item);
  });
}

export async function storeFiles(files: StoredFiles): Promise<void> {
  await transact([FILES], 'readwrite', (tx) => {
    tx.objectStore(FILES).put(files);
  });
}

/**
 * The files as read back from disk. Worth the round trip after storing a
 * clip: the encode was built in memory, and the copy IndexedDB hands back is
 * disk-backed, so swapping to it lets the in-memory one be collected.
 */
export async function loadFiles(key: string): Promise<StoredFiles | undefined> {
  return transact<StoredFiles>([FILES], 'readonly', (tx) => tx.objectStore(FILES).get(key));
}

export async function loadItems(): Promise<StoredItem[]> {
  const items = await transact<StoredItem[]>([ITEMS], 'readonly', (tx) => tx.objectStore(ITEMS).getAll());
  return (items ?? []).sort((a, b) => a.added - b.added);
}

export async function forgetItem(key: string): Promise<void> {
  await transact([ITEMS, FILES], 'readwrite', (tx) => {
    tx.objectStore(ITEMS).delete(key);
    tx.objectStore(FILES).delete(key);
  });
}

/** A refusal phrased for the row it lands on — a full disk is the likely one. */
export function storageError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') {
    return 'Out of browser storage — publish or remove some of the queue first';
  }
  return cause instanceof Error ? `Could not keep this in the browser: ${cause.message}` : 'Could not keep this in the browser';
}
