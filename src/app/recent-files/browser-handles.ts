import type { DBSchema } from 'idb'

import {
  connectAppDatabase,
  defineAppDatabase,
  readStoredBinary,
  storedBinary,
  type StoredBinary
} from '@/app/storage/idb'

interface RecentBrowserContent {
  bytes: StoredBinary
  name: string
  type: string
  lastModified: number
}

interface RecentBrowserThumbnail {
  bytes: StoredBinary
}

export type RecentBrowserFileSource = File | FileSystemFileHandle

interface BrowserFileDatabase extends DBSchema {
  handles: { key: string; value: FileSystemFileHandle }
  contents: { key: string; value: RecentBrowserContent }
  thumbnails: { key: string; value: RecentBrowserThumbnail }
}

const database = connectAppDatabase(
  defineAppDatabase<BrowserFileDatabase>({
    name: 'open-pencil-recent-files',
    version: 3,
    callbacks: {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore('handles')
        if (oldVersion < 2) db.createObjectStore('contents')
        if (oldVersion < 3) db.createObjectStore('thumbnails')
      }
    }
  })
)

export async function readRecentBrowserHandle(
  id: string
): Promise<FileSystemFileHandle | undefined> {
  return (await database.open()).get('handles', id)
}

export async function readRecentBrowserContent(id: string): Promise<File | undefined> {
  const stored = await (await database.open()).get('contents', id)
  if (!stored) return undefined
  let bytes: Blob
  if (stored.bytes instanceof Blob) {
    bytes = stored.bytes
  } else if (stored.bytes instanceof ArrayBuffer) {
    bytes = new Blob([stored.bytes])
  } else {
    bytes = new Blob([new Uint8Array(stored.bytes)])
  }
  return new File([bytes], stored.name, {
    type: stored.type,
    lastModified: stored.lastModified
  })
}

export async function writeRecentBrowserHandle(
  id: string,
  handle: FileSystemFileHandle,
  fallback?: File
): Promise<void> {
  try {
    const transaction = (await database.open()).transaction(['handles', 'contents'], 'readwrite')
    await Promise.all([
      transaction.objectStore('handles').put(handle, id),
      transaction.objectStore('contents').delete(id),
      transaction.done
    ])
  } catch {
    await writeRecentBrowserContent(id, fallback ?? (await handle.getFile()))
  }
}

export async function writeRecentBrowserContent(id: string, file: File): Promise<void> {
  const bytes = await storedBinary(file)
  const transaction = (await database.open()).transaction(['handles', 'contents'], 'readwrite')
  await Promise.all([
    transaction.objectStore('contents').put(
      {
        bytes,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified
      },
      id
    ),
    transaction.objectStore('handles').delete(id),
    transaction.done
  ])
}

export async function deleteRecentBrowserSources(ids: readonly string[]): Promise<void> {
  const transaction = (await database.open()).transaction(
    ['handles', 'contents', 'thumbnails'],
    'readwrite'
  )
  await Promise.all([
    ...ids.map((id) => transaction.objectStore('handles').delete(id)),
    ...ids.map((id) => transaction.objectStore('contents').delete(id)),
    ...ids.map((id) => transaction.objectStore('thumbnails').delete(id)),
    transaction.done
  ])
}

export async function readRecentBrowserThumbnail(id: string): Promise<Uint8Array | null> {
  const stored = await (await database.open()).get('thumbnails', id)
  return readStoredBinary(stored?.bytes)
}

export async function writeRecentBrowserThumbnail(id: string, bytes: Uint8Array): Promise<void> {
  const stored = await storedBinary(bytes)
  const transaction = (await database.open()).transaction('thumbnails', 'readwrite')
  await Promise.all([
    transaction.objectStore('thumbnails').put({ bytes: stored }, id),
    transaction.done
  ])
}

export async function deleteRecentBrowserThumbnail(id: string): Promise<void> {
  const transaction = (await database.open()).transaction('thumbnails', 'readwrite')
  await Promise.all([transaction.objectStore('thumbnails').delete(id), transaction.done])
}
