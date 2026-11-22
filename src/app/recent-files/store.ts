import { useLocalStorage } from '@vueuse/core'
import { basename } from 'pathe'
import * as v from 'valibot'
import { computed, shallowReactive, watch } from 'vue'

import { DOCUMENT_EXTENSIONS } from '@open-pencil/core/io'
import type { DocumentKind } from '@open-pencil/scene-graph'
import { createMutex } from '@open-pencil/std/async'
import { randomHex } from '@open-pencil/std/random'

import {
  DEFAULT_STORAGE_PROFILE,
  storageLocationOf,
  storageProfileId,
  type StorageDocumentBinding,
  type StorageProviderID
} from '@/app/integrations/storage'
import { fileIdentitiesMatch } from '@/app/tabs/open/identity'

import {
  deleteRecentBrowserSources,
  readRecentBrowserContent,
  readRecentBrowserHandle,
  writeRecentBrowserContent,
  writeRecentBrowserHandle,
  type RecentBrowserFileSource
} from './browser-handles'
import { recentFilesLimit } from './preferences'
import { recentDocumentViewSchema } from './schema'
import {
  clearRecentFileThumbnails,
  updateRecentBrowserThumbnail,
  type RecentBrowserCover
} from './thumbnails'

const RECENT_DOCUMENTS_STORAGE_KEY = 'open-pencil:recent-documents'

export type RecentDocumentView = v.InferOutput<typeof recentDocumentViewSchema>

export interface RecentLocalDocument {
  id: string
  kind: 'local'
  path: string
  name: string
  updatedAt: string
  /** A design or a board; entries recorded before this was kept have none. */
  documentKind?: DocumentKind
  view?: RecentDocumentView
}

export interface RecentStorageDocument {
  id: string
  kind: 'storage'
  providerId: StorageProviderID
  profileId?: string
  containerId?: string
  documentId: string
  name: string
  updatedAt: string
  /** A design or a board; entries recorded before this was kept have none. */
  documentKind?: DocumentKind
  view?: RecentDocumentView
}

interface RecentBrowserDocument {
  id: string
  kind: 'browser'
  name: string
  updatedAt: string
  documentKind: DocumentKind
  view?: RecentDocumentView
}

export type RecentDocument = RecentLocalDocument | RecentStorageDocument | RecentBrowserDocument

type PathOrStorageDocument = RecentLocalDocument | RecentStorageDocument

export const recentDocuments = useLocalStorage<PathOrStorageDocument[]>(
  RECENT_DOCUMENTS_STORAGE_KEY,
  []
)
// Older app versions can still read their existing list without encountering a new entry kind.
const browserDocuments = useLocalStorage<RecentBrowserDocument[]>(
  'open-pencil:recent-browser-files',
  []
)

// If no durable handle is available, keep the original browser object only for this page.
const sessionFiles = shallowReactive(
  new Map<string, { document: RecentBrowserDocument; source: RecentBrowserFileSource }>()
)
const browserFileIds = new WeakMap<RecentBrowserFileSource, string>()
const browserRecordWrites = createMutex()

function fileName(path: string): string {
  return basename(path) || path
}

function localDocumentId(path: string): string {
  return `local:${path}`
}

function storageDocumentId(binding: StorageDocumentBinding): string {
  const profileId = storageProfileId(binding)
  // Documents of single-account providers keep the IDs they had before profiles existed.
  return profileId === DEFAULT_STORAGE_PROFILE
    ? `storage:${binding.providerId}:${binding.documentId}`
    : `storage:${binding.providerId}:${profileId}:${binding.documentId}`
}

function normalizedRecentDocuments(): PathOrStorageDocument[] {
  return recentDocuments.value.slice(0, recentFilesLimit.value)
}

export const recentFiles = computed<RecentDocument[]>(() => {
  const documents = normalizedRecentDocuments()
  if (!browserDocuments.value.length && !sessionFiles.size) return documents
  return [
    ...Array.from(sessionFiles.values(), ({ document }) => document).reverse(),
    ...browserDocuments.value.filter((document) => !sessionFiles.has(document.id)),
    ...documents
  ]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, recentFilesLimit.value)
})

watch(recentFiles, (documents) => {
  if (!sessionFiles.size) return
  const kept = new Set(documents.map(({ id }) => id))
  for (const id of sessionFiles.keys()) {
    if (!kept.has(id)) sessionFiles.delete(id)
  }
})

function removeBrowserSources(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve()
  return browserRecordWrites
    .run(async () => {
      const removed = ids.filter(
        (id) => !browserDocuments.value.some((document) => document.id === id)
      )
      if (removed.length) await deleteRecentBrowserSources(removed)
    })
    .catch(() => undefined)
}

watch(browserDocuments, (documents, previous) => {
  const kept = new Set(documents.map(({ id }) => id))
  const ids = previous.filter((document) => !kept.has(document.id)).map(({ id }) => id)
  void removeBrowserSources(ids)
})

export const recentLocalFilePaths = computed<string[]>(() =>
  normalizedRecentDocuments().flatMap((document) =>
    document.kind === 'local' ? [document.path] : []
  )
)

function remember(document: PathOrStorageDocument): void {
  const others = normalizedRecentDocuments().filter((recent) => recent.id !== document.id)
  const previous = recentDocuments.value.find((recent) => recent.id === document.id)
  // Opening or saving a document again keeps the view it was left at.
  const view = document.view ?? previous?.view
  recentDocuments.value = [view ? { ...document, view } : document, ...others].slice(
    0,
    recentFilesLimit.value
  )
}

/**
 * The recent-files id of an open document by its storage binding, path, or known browser handle.
 */
export function recentDocumentIdOf(
  path: string | null,
  binding: StorageDocumentBinding | null,
  handle: FileSystemFileHandle | null = null
): string | null {
  if (binding) return storageDocumentId(binding)
  if (path) return localDocumentId(path)
  return handle ? (browserFileIds.get(handle) ?? null) : null
}

/** Keeps the view a listed document was left at, without moving it up the list. */
export function rememberRecentDocumentView(id: string, view: RecentDocumentView): void {
  const session = sessionFiles.get(id)
  if (session) {
    sessionFiles.set(id, { ...session, document: { ...session.document, view } })
  }
  if (browserDocuments.value.some((document) => document.id === id)) {
    browserDocuments.value = browserDocuments.value.map((document) =>
      document.id === id ? { ...document, view } : document
    )
    return
  }
  if (session) return
  if (!recentDocuments.value.some((document) => document.id === id)) return
  recentDocuments.value = recentDocuments.value.map((document) =>
    document.id === id ? { ...document, view } : document
  )
}

/** The view a listed document was left at, if one was kept and stored intact. */
export function recentDocumentView(id: string): RecentDocumentView | null {
  const view: unknown =
    sessionFiles.get(id)?.document.view ??
    browserDocuments.value.find((document) => document.id === id)?.view ??
    recentDocuments.value.find((document) => document.id === id)?.view
  const parsed = v.safeParse(recentDocumentViewSchema, view)
  return parsed.success ? parsed.output : null
}

/** What a file on this device is by its name: a FigJam `.jam` is a board, anything else a design. */
function localDocumentKind(path: string): DocumentKind {
  return path.toLowerCase().endsWith(`.${DOCUMENT_EXTENSIONS.board}`) ? 'board' : 'design'
}

/**
 * A recent file's kind: as recorded, or for one recorded before kinds were, by its name on this
 * device and as a design elsewhere, as storage lists files whose kind they do not know.
 */
export function recentDocumentKind(document: RecentDocument): DocumentKind {
  if (document.documentKind) return document.documentKind
  return document.kind === 'local' ? localDocumentKind(document.path) : 'design'
}

/** Remembers a file opened or saved on this device, as the kind the opened document is. */
export function rememberRecentFile(path: string, documentKind: DocumentKind): void {
  remember({
    id: localDocumentId(path),
    kind: 'local',
    path,
    name: fileName(path),
    updatedAt: new Date().toISOString(),
    documentKind
  })
}

export async function recentBrowserFileSource(
  id: string
): Promise<RecentBrowserFileSource | undefined> {
  let source = sessionFiles.get(id)?.source
  if (!source) source = await readRecentBrowserHandle(id).catch(() => undefined)
  if (!source) {
    const file = await readRecentBrowserContent(id).catch(() => undefined)
    if (file) {
      const document = browserDocuments.value.find((recent) => recent.id === id)
      if (document) sessionFiles.set(id, { document, source: file })
      source = file
    }
  }
  if (source) browserFileIds.set(source, id)
  return source
}

async function reserveBrowserFileId(source: RecentBrowserFileSource): Promise<string> {
  const handle = source instanceof File ? undefined : source
  const knownId = handle ? await identifyRecentBrowserFile(handle) : browserFileIds.get(source)
  const id = knownId ?? `browser:${randomHex(16)}`
  browserFileIds.set(source, id)
  return id
}

/** Assigns a browser history entry before its document is shown, so its view is kept too. */
export function reserveRecentBrowserFileId(source: RecentBrowserFileSource): Promise<string> {
  return browserRecordWrites.run(() => reserveBrowserFileId(source))
}

/** Associates a picked handle with its previous view before the editor shows the document. */
export async function identifyRecentBrowserFile(
  handle: FileSystemFileHandle
): Promise<string | undefined> {
  const known = browserFileIds.get(handle)
  const documents = [
    ...browserDocuments.value,
    ...Array.from(sessionFiles.values(), ({ document }) => document)
  ]
  if (known && documents.some((document) => document.id === known)) return known

  for (const document of documents) {
    if (document.name !== handle.name) continue
    const sessionSource = sessionFiles.get(document.id)?.source
    const source =
      sessionSource && !(sessionSource instanceof File)
        ? sessionSource
        : await readRecentBrowserHandle(document.id).catch(() => undefined)
    if (
      source &&
      (await fileIdentitiesMatch({ path: null, handle: source }, { path: null, handle }))
    ) {
      browserFileIds.set(handle, document.id)
      return document.id
    }
  }
  return undefined
}

/** Records an opened or saved local browser file; history failures must never fail its I/O. */
export async function rememberRecentBrowserFile(
  source: RecentBrowserFileSource,
  documentKind: DocumentKind,
  id?: string,
  cachedFile?: File,
  fallbackCover?: RecentBrowserCover
): Promise<string> {
  return browserRecordWrites.run(async () => {
    const handle = source instanceof File ? undefined : source
    const knownId = id ?? (await reserveBrowserFileId(source))
    const previousView = recentDocumentView(knownId)
    const document = (): RecentBrowserDocument => ({
      id: knownId,
      kind: 'browser',
      name: source.name,
      updatedAt: new Date().toISOString(),
      documentKind,
      ...(previousView ? { view: previousView } : {})
    })
    const publish = (): void => {
      browserDocuments.value = [
        document(),
        ...browserDocuments.value.filter((recent) => recent.id !== knownId)
      ].slice(0, recentFilesLimit.value)
    }
    const updateThumbnail = () =>
      updateRecentBrowserThumbnail(knownId, source, cachedFile, fallbackCover).catch((error) => {
        console.warn('[Recent files] Could not update the browser thumbnail:', error)
      })
    browserFileIds.set(source, knownId)
    if (handle) {
      try {
        await writeRecentBrowserHandle(knownId, handle, cachedFile)
        await updateThumbnail()
        sessionFiles.delete(knownId)
        publish()
        return knownId
      } catch (error) {
        // Some browsers hand out a usable handle but cannot clone it into IndexedDB.
        console.warn('[Recent files] Keeping this file for the current page only:', error)
      }
    } else if (source instanceof File) {
      try {
        await writeRecentBrowserContent(knownId, source)
        await updateThumbnail()
        sessionFiles.delete(knownId)
        publish()
        return knownId
      } catch (error) {
        console.warn('[Recent files] Keeping this file for the current page only:', error)
      }
    }
    await updateThumbnail()
    sessionFiles.delete(knownId)
    sessionFiles.set(knownId, { document: document(), source })
    return knownId
  })
}

export function rememberRecentStorageDocument(
  binding: StorageDocumentBinding,
  name: string,
  documentKind: DocumentKind
): void {
  remember({
    id: storageDocumentId(binding),
    kind: 'storage',
    ...storageLocationOf(binding),
    documentId: binding.documentId,
    name,
    updatedAt: new Date().toISOString(),
    documentKind
  })
}

export function forgetRecentDocument(id: string): void {
  sessionFiles.delete(id)
  if (browserDocuments.value.some((document) => document.id === id)) {
    browserDocuments.value = browserDocuments.value.filter((document) => document.id !== id)
    return
  }
  recentDocuments.value = normalizedRecentDocuments().filter((document) => document.id !== id)
}

export function forgetRecentFile(path: string): void {
  forgetRecentDocument(localDocumentId(path))
}

export function forgetRecentStorageDocument(binding: StorageDocumentBinding): void {
  forgetRecentDocument(storageDocumentId(binding))
}

/** Forgets the stored documents of one storage profile, such as a Cloud server signed out of. */
export function forgetRecentStorageProfile(providerId: StorageProviderID, profileId: string): void {
  recentDocuments.value = normalizedRecentDocuments().filter(
    (document) =>
      document.kind !== 'storage' ||
      document.providerId !== providerId ||
      storageProfileId(document) !== profileId
  )
}

export async function clearRecentFiles(): Promise<void> {
  const ids = browserDocuments.value.map(({ id }) => id)
  sessionFiles.clear()
  browserDocuments.value = []
  recentDocuments.value = []
  await Promise.all([removeBrowserSources(ids), clearRecentFileThumbnails()])
}

export function recentLocalFileAt(index: number): string | null {
  return recentLocalFilePaths.value[index] ?? null
}
