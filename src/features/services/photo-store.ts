"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { processImage, uuid } from "@/lib/images";

/**
 * Request photos are prepared on the device (resized, EXIF/GPS stripped) and kept in IndexedDB until the
 * request is submitted, so they survive the login redirect. They are uploaded to media/<uid>/requests/ only at
 * submit time (guests cannot upload). Falls back to memory when IndexedDB is unavailable (private mode).
 */

export type StoredPhoto = {
  id: string;
  draftKey: string;
  full: Blob;
  fullExt: string;
  fullMime: string;
  thumb: Blob;
  thumbExt: string;
  thumbMime: string;
  createdAt: number;
};

const DB_NAME = "gebzem-request-photos";
const STORE = "photos";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const memory = new Map<string, StoredPhoto>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("draftKey", "draftKey");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? r.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function listPhotos(draftKey: string): Promise<StoredPhoto[]> {
  const fromMemory = () => [...memory.values()].filter((p) => p.draftKey === draftKey);
  const db = await openDb();
  if (!db) return fromMemory();
  try {
    return [...((await run<StoredPhoto[]>(db, "readonly", (s) => s.index("draftKey").getAll(draftKey))) ?? []), ...fromMemory()];
  } catch {
    return fromMemory();
  }
}

async function putPhoto(p: StoredPhoto): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await run(db, "readwrite", (s) => s.put(p));
      return;
    } catch {
      /* quota / private mode: keep it in memory for this tab */
    }
  }
  memory.set(p.id, p);
}

async function deletePhotos(ids: string[]): Promise<void> {
  for (const id of ids) memory.delete(id);
  const db = await openDb();
  if (!db || ids.length === 0) return;
  try {
    await run(db, "readwrite", (s) => {
      for (const id of ids) s.delete(id);
    });
  } catch {
    /* ignore */
  }
}

export type RequestPhotos = {
  /** Preview (thumbnail object URL) per photo id. */
  previews: Record<string, string>;
  /** Number of photos being processed right now. */
  processing: number;
  processingRef: React.RefObject<number>;
  /** Process and store files; `onAdded` is called with each new id (append it to the draft). */
  add: (files: File[], currentCount: number, max: number, onAdded: (id: string) => void) => Promise<void>;
  remove: (id: string) => Promise<void>;
  recordsFor: (ids: string[]) => StoredPhoto[];
  clearAll: () => Promise<void>;
};

/**
 * Photos of one wizard draft. `initialKeepIds` = photo ids of the restored draft; stored photos that are not
 * part of it (e.g. after "Baştan başla") or older than 14 days are deleted on mount.
 */
export function useRequestPhotos(draftKey: string, initialKeepIds: string[]): RequestPhotos {
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const [processing, setProcessing] = React.useState(0);
  const processingRef = React.useRef(0);
  const records = React.useRef(new Map<string, StoredPhoto>());
  const urls = React.useRef(new Map<string, string>());
  const keepRef = React.useRef(initialKeepIds);

  React.useEffect(() => {
    let alive = true;
    const urlMap = urls.current;
    void (async () => {
      const all = await listPhotos(draftKey);
      const keep = new Set(keepRef.current);
      const now = Date.now();
      const stale = all.filter((p) => !keep.has(p.id) || now - p.createdAt > MAX_AGE_MS);
      if (stale.length) await deletePhotos(stale.map((p) => p.id));
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const p of all) {
        if (stale.includes(p)) continue;
        records.current.set(p.id, p);
        const url = URL.createObjectURL(p.thumb);
        urlMap.set(p.id, url);
        next[p.id] = url;
      }
      setPreviews((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      alive = false;
      urlMap.forEach((u) => URL.revokeObjectURL(u));
      urlMap.clear();
    };
  }, [draftKey]);

  const bump = (d: number) => {
    processingRef.current += d;
    setProcessing(processingRef.current);
  };

  const add = React.useCallback(
    async (files: File[], currentCount: number, max: number, onAdded: (id: string) => void) => {
      const room = Math.max(0, max - currentCount - processingRef.current);
      const list = files.slice(0, room);
      if (list.length === 0) {
        toast.error(`En fazla ${max} fotoğraf ekleyebilirsin.`);
        return;
      }
      if (files.length > list.length) toast.message(`Sadece ${list.length} fotoğraf eklendi (en fazla ${max}).`);
      for (const file of list) {
        bump(1);
        try {
          const out = await processImage(file);
          const rec: StoredPhoto = {
            id: uuid(),
            draftKey,
            full: out.full.blob,
            fullExt: out.full.ext,
            fullMime: out.full.mime,
            thumb: out.thumb.blob,
            thumbExt: out.thumb.ext,
            thumbMime: out.thumb.mime,
            createdAt: Date.now(),
          };
          await putPhoto(rec);
          records.current.set(rec.id, rec);
          const url = URL.createObjectURL(rec.thumb);
          urls.current.set(rec.id, url);
          setPreviews((prev) => ({ ...prev, [rec.id]: url }));
          onAdded(rec.id);
        } catch (e) {
          toast.error((e as Error)?.message || "Fotoğraf eklenemedi.");
        } finally {
          bump(-1);
        }
      }
    },
    [draftKey],
  );

  const remove = React.useCallback(async (id: string) => {
    const url = urls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(id);
    records.current.delete(id);
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await deletePhotos([id]);
  }, []);

  const recordsFor = React.useCallback((ids: string[]) => ids.map((id) => records.current.get(id)).filter((r): r is StoredPhoto => !!r), []);

  const clearAll = React.useCallback(async () => {
    const all = await listPhotos(draftKey);
    await deletePhotos([...new Set([...all.map((p) => p.id), ...records.current.keys()])]);
    records.current.clear();
  }, [draftKey]);

  return { previews, processing, processingRef, add, remove, recordsFor, clearAll };
}

/** Upload prepared photos to media/<uid>/requests/. Returns public URLs of the full images (+ paths for cleanup). */
export async function uploadRequestPhotos(uid: string, recs: StoredPhoto[]): Promise<{ urls: string[]; paths: string[] }> {
  const bucket = createClient().storage.from(STORAGE_BUCKETS.media);
  const urls: string[] = [];
  const paths: string[] = [];
  const opts = { cacheControl: "31536000", upsert: false };
  try {
    for (const r of recs) {
      const id = uuid();
      const path = `${uid}/requests/${id}.${r.fullExt}`;
      const thumbPath = `${uid}/requests/${id}_thumb.${r.thumbExt}`;
      const [a, b] = await Promise.all([
        bucket.upload(path, r.full, { ...opts, contentType: r.fullMime }),
        bucket.upload(thumbPath, r.thumb, { ...opts, contentType: r.thumbMime }),
      ]);
      if (!a.error) paths.push(path);
      if (!b.error) paths.push(thumbPath);
      if (a.error) throw new Error("Fotoğraflar yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      urls.push(bucket.getPublicUrl(path).data.publicUrl);
    }
  } catch (e) {
    await removeUploadedPhotos(paths);
    throw e instanceof Error ? e : new Error("Fotoğraflar yüklenemedi.");
  }
  return { urls, paths };
}

export async function removeUploadedPhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await createClient()
    .storage.from(STORAGE_BUCKETS.media)
    .remove(paths)
    .catch(() => undefined);
}
