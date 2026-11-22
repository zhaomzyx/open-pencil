import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEventListener } from '@vueuse/core'
import { onMounted, onScopeDispose } from 'vue'

import { errorMessage } from '@open-pencil/std/errors'

import { confirmAppExit, isExitApproved, pageAsksBeforeLeaving } from '@/app/document/close/exit'
import { notificationMessages } from '@/app/i18n/notifications'
import { toast } from '@/app/shell/ui'
import { allTabs } from '@/app/tabs'
import { IS_TAURI } from '@/constants'

// Let an approved navigation dispatch pagehide before showing the notice.
const STAY_NOTICE_DELAY_MS = 200

export function useDocumentCloseProtection() {
  let closing = false
  let disposed = false
  const cleanup: Array<() => void> = []
  let stayNoticeTimer: number | undefined

  function cancelStayNotice() {
    window.clearTimeout(stayNoticeTimer)
    stayNoticeTimer = undefined
  }

  useEventListener(window, 'beforeunload', (event) => {
    if (!pageAsksBeforeLeaving()) return
    event.preventDefault()
    event.returnValue = ''
    cancelStayNotice()
    stayNoticeTimer = window.setTimeout(() => {
      stayNoticeTimer = undefined
      if (!pageAsksBeforeLeaving()) return
      const names = allTabs.value
        .filter((tab) => tab.isDirty)
        .map((tab) => tab.name)
        .join(', ')
      if (names) {
        toast.warning(notificationMessages.get().pageKeptForUnsavedChanges({ names }), undefined, {
          sticky: true
        })
      }
    }, STAY_NOTICE_DELAY_MS)
  })
  useEventListener(window, 'pagehide', cancelStayNotice)

  async function requestClose(close: () => Promise<void>) {
    if (closing) return
    closing = true
    try {
      if (!(await confirmAppExit())) return
      await close()
    } catch (error) {
      toast.error(
        notificationMessages.get().operationFailed({
          error: errorMessage(error)
        })
      )
    } finally {
      closing = false
    }
  }

  function registerCleanup(unsubscribe: () => void) {
    if (disposed) unsubscribe()
    else cleanup.push(unsubscribe)
  }

  onMounted(async () => {
    if (!IS_TAURI) return
    if (disposed) return
    const window = getCurrentWindow()
    await window
      .onCloseRequested((event) => {
        // Always intercept: Tauri destroys the window implicitly when a handler returns
        // without preventing, which would bypass the prompt after approval.
        event.preventDefault()
        if (isExitApproved()) return
        void requestClose(() => window.destroy())
      })
      .then(registerCleanup)
  })

  onScopeDispose(() => {
    disposed = true
    cancelStayNotice()
    for (const unsubscribe of cleanup) unsubscribe()
  })
}
