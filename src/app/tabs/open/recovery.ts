import { readFigDocument } from '@/app/document/io/fig'
import { documentFileName } from '@/app/document/io/names'
import { getRecoveryStore, type RecoverySnapshotMeta } from '@/app/document/recovery'
import { recoverySessionId } from '@/app/document/recovery/session'
import { rememberRecentBrowserFile } from '@/app/recent-files'
import { figFile } from '@/app/tabs/open/fig'
import {
  failPreparation,
  releaseOpeningTab,
  reusableTabStore,
  showImportedGraph
} from '@/app/tabs/open/show'
import { IS_BROWSER, IS_TAURI } from '@/constants'

export async function listRecoverySnapshots(): Promise<RecoverySnapshotMeta[]> {
  return getRecoveryStore().list()
}

export async function discardRecoverySnapshot(id: string): Promise<void> {
  await getRecoveryStore().remove(id)
}

const pendingRestores = new Map<string, Promise<void>>()

/** Repeated opens share the read, decode and adoption of the recovery copy. */
export function restoreRecoverySnapshot(id: string): Promise<void> {
  const pending = pendingRestores.get(id)
  if (pending) return pending
  const restore = openRecoveryCopy(id).finally(() => pendingRestores.delete(id))
  pendingRestores.set(id, restore)
  return restore
}

/** The tab takes over the recovery copy once its document opens. */
async function openRecoveryCopy(id: string): Promise<void> {
  const snapshot = await getRecoveryStore().read(id)
  if (!snapshot) throw new Error('Recovery snapshot is no longer available')

  const opening = reusableTabStore()
  const { store } = opening
  const load = store.preparationController.begin({
    kind: 'recovery-restore',
    subject: snapshot.documentName
  })
  let succeeded = false
  try {
    load.update({ phase: 'reading', detail: snapshot.documentName })
    const file = figFile(snapshot.figBytes, snapshot.documentName)
    load.update({ phase: 'decoding', detail: snapshot.documentName })
    const imported = await readFigDocument(file, load.signal)
    // Recovery can relinquish its copy on close. Recents keeps the version actually restored.
    if (IS_BROWSER && !IS_TAURI) {
      const kind = imported.documentKind
      const name = documentFileName(snapshot.documentName, kind)
      const archive = name === file.name ? file : new File([file], name, { type: file.type })
      const recentId = `browser:recovery:${id}`
      store.setRecentBrowserFileId(recentId)
      // Rendering and claiming the recovered work do not depend on the history cache.
      void rememberRecentBrowserFile(archive, kind, recentId, undefined, () =>
        getRecoveryStore().readCover(id)
      ).catch((error: unknown) => {
        console.warn('[Recent files] Could not keep the restored document:', error)
      })
    }

    await showImportedGraph(
      store,
      imported,
      async () => {
        store.state.documentName = snapshot.documentName
        await store.adoptRecoverySnapshot(id)
        // The copy is this window's now, so no other window lists it while it is open here.
        await getRecoveryStore().claim(id, recoverySessionId)
      },
      load
    )
    succeeded = true
  } catch (error) {
    failPreparation(load, 'decode-failed', error)
    await releaseOpeningTab(opening, { keepRecovery: true })
    throw error
  } finally {
    if (succeeded) load.complete()
  }
}
