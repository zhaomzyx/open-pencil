import { watch } from 'vue'

import { isAbortError } from '@open-pencil/std/errors'
import { useDocumentWorkspace } from '@open-pencil/vue/document/workspace'

import { requestBrowserFileRead } from '@/app/document/io/capability'
import {
  createStorageAdapter,
  sameStorageLocation,
  storageLocationOf,
  type StorageDocument
} from '@/app/integrations/storage'
import { openDesignFile, openFileFromPath } from '@/app/shell/menu/files'
import { activeStorageLocation, createStorageWorkspaceSource } from '@/app/storage/workspace/source'
import { openStorageDocumentInNewTab } from '@/app/tabs'

import {
  forgetRecentDocument,
  recentBrowserFileSource,
  recentFiles,
  type RecentDocument
} from './store'
import { loadRecentBrowserThumbnail, loadRecentFileThumbnail } from './thumbnails'

/** The recent files with their previews, as Home and a New file tab list them. */
export function useRecentFilesWorkspace() {
  const workspace = useDocumentWorkspace<RecentDocument>({
    source: {
      async refresh() {
        return recentFiles.value
      },
      async loadPreview(documentId) {
        const document = recentFiles.value.find((candidate) => candidate.id === documentId)
        if (!document) return null
        if (document.kind === 'local') return loadRecentFileThumbnail(document.path)
        if (document.kind === 'browser') {
          const source = await recentBrowserFileSource(document.id).catch(() => undefined)
          return loadRecentBrowserThumbnail(document.id, source)
        }
        return createStorageWorkspaceSource(
          () => undefined,
          () => storageLocationOf(document)
        ).loadPreview(document.documentId)
      }
    },
    refreshOnFocus: false,
    refreshOnReconnect: false,
    previewConcurrency: 2,
    // A card without a preview says nothing of why, so the reason goes to the console.
    onPreviewError: (documentId, error) =>
      console.warn(`[Recent files] No preview for ${documentId}:`, error)
  })
  watch(recentFiles, () => void workspace.invalidate())
  return workspace
}

export type RecentFilesWorkspace = ReturnType<typeof useRecentFilesWorkspace>

/** The recent files whose name, path, or stored id holds `query`, already lowercased in `locale`. */
export function matchingRecentFiles(
  documents: readonly RecentDocument[],
  query: string,
  locale: string
): readonly RecentDocument[] {
  if (!query) return documents
  return documents.filter((document) => {
    if (document.name.toLocaleLowerCase(locale).includes(query)) return true
    if (document.kind === 'local') return document.path.toLocaleLowerCase(locale).includes(query)
    if (document.kind === 'storage') {
      return document.documentId.toLocaleLowerCase(locale).includes(query)
    }
    return false
  })
}

/**
 * Opens a recent file. A stored one opens with the revision its storage lists, so a stale copy on
 * this device is not taken for current: `listed` is the active storage's listing when the caller
 * has it, and other places are listed here; offline, the copy opens as it is.
 */
export async function openRecentDocument(
  document: RecentDocument,
  listed?: readonly StorageDocument[]
): Promise<void> {
  if (document.kind === 'browser') {
    try {
      const source = await recentBrowserFileSource(document.id)
      if (!source) throw new DOMException('Choose this file again to reopen it.', 'NotFoundError')
      if (source instanceof File) {
        await openDesignFile(source)
      } else {
        await requestBrowserFileRead(source)
        await openDesignFile(await source.getFile(), source)
      }
    } catch (error) {
      if (isAbortError(error)) return
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        forgetRecentDocument(document.id)
      }
      throw error
    }
    return
  }
  try {
    if (document.kind === 'local') {
      await openFileFromPath(document.path)
      return
    }
    const location = storageLocationOf(document)
    const listing =
      listed && sameStorageLocation(location, activeStorageLocation())
        ? listed
        : await createStorageAdapter(location)
            .listDocuments()
            .catch(() => [])
    const found = listing.find((candidate) => candidate.id === document.documentId)
    await openStorageDocumentInNewTab(
      found ?? { id: document.documentId, name: document.name, updatedAt: document.updatedAt },
      location
    )
  } catch (error) {
    forgetRecentDocument(document.id)
    throw error
  }
}
