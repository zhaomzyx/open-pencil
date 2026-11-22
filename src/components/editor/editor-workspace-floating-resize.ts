import { useEventListener } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { computed, onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from 'vue'

import type { Vector } from '@open-pencil/scene-graph/primitives'

import type { WorkspaceDockFloating, WorkspaceDockStoredItem } from '@/app/shell/layout-storage'
import { remToPx } from '@/app/shell/root-font-size'

export const FLOATING_PANEL_MARGIN_REM = 0.5

const FLOATING_PANEL_DEFAULT_WIDTH_REM = 18
const FLOATING_PANEL_DEFAULT_HEIGHT_REM = 26
const FLOATING_PANEL_MIN_WIDTH_REM = 12
const FLOATING_PANEL_MIN_HEIGHT_REM = 12

export type FloatingPanelViewport = {
  width: number
  height: number
}

export type FloatingPanelRect = Vector & {
  width: number
  height: number
}

export type FloatingPanelSize = Pick<FloatingPanelRect, 'width' | 'height'>

export type FloatingResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export const FLOATING_RESIZE_HANDLES: readonly FloatingResizeHandle[] = [
  'n',
  'e',
  's',
  'w',
  'nw',
  'ne',
  'se',
  'sw'
]

const FLOATING_RESIZE_HANDLE_CLASS: Record<FloatingResizeHandle, string> = {
  n: 'inset-x-3 top-0 h-2 cursor-row-resize',
  ne: 'right-0 top-0 size-4 cursor-ne-resize',
  e: 'bottom-3 right-0 top-3 w-2 cursor-col-resize',
  se: 'bottom-0 right-0 size-4 cursor-se-resize',
  s: 'inset-x-3 bottom-0 h-2 cursor-row-resize',
  sw: 'bottom-0 left-0 size-4 cursor-sw-resize',
  w: 'bottom-3 left-0 top-3 w-2 cursor-col-resize',
  nw: 'left-0 top-0 size-4 cursor-nw-resize'
}

type FloatingResizeOptions = {
  viewport: MaybeRefOrGetter<FloatingPanelViewport>
  entryFor: (id: WorkspaceDockStoredItem) => WorkspaceDockFloating | undefined
  isBlocked: () => boolean
  onRaise: (id: WorkspaceDockStoredItem) => void
  onCommit: (id: WorkspaceDockStoredItem, rect: FloatingPanelRect) => void
}

type FloatingResizeSession = {
  id: WorkspaceDockStoredItem
  pointerId: number
  handle: FloatingResizeHandle
  captureTarget: HTMLElement
  lostCaptureTarget: () => void
  startPoint: Vector
  startRect: FloatingPanelRect
  rect: FloatingPanelRect
}

type FloatingPanelBounds = {
  left: number
  top: number
  right: number
  bottom: number
  minWidth: number
  minHeight: number
}

export function floatingResizeHandleClass(handle: FloatingResizeHandle): string {
  return FLOATING_RESIZE_HANDLE_CLASS[handle]
}

export function defaultFloatingPanelSize(viewport: FloatingPanelViewport): FloatingPanelSize {
  const { width, height } = resolveFloatingPanelRect({ x: 0, y: 0 }, viewport)
  return { width, height }
}

export function resolveFloatingPanelRect(
  entry: Partial<Pick<WorkspaceDockFloating, 'x' | 'y' | 'width' | 'height'>>,
  viewport: FloatingPanelViewport
): FloatingPanelRect {
  const bounds = floatingPanelBounds(viewport)
  const availableWidth = bounds.right - bounds.left
  const availableHeight = bounds.bottom - bounds.top
  const width = clamp(
    finiteOr(entry.width, Math.min(remToPx(FLOATING_PANEL_DEFAULT_WIDTH_REM), availableWidth)),
    Math.min(remToPx(FLOATING_PANEL_MIN_WIDTH_REM), availableWidth),
    availableWidth
  )
  const height = clamp(
    finiteOr(entry.height, Math.min(remToPx(FLOATING_PANEL_DEFAULT_HEIGHT_REM), availableHeight)),
    Math.min(remToPx(FLOATING_PANEL_MIN_HEIGHT_REM), availableHeight),
    availableHeight
  )
  return {
    x: clamp(finiteOr(entry.x, bounds.left), bounds.left, bounds.right - width),
    y: clamp(finiteOr(entry.y, bounds.top), bounds.top, bounds.bottom - height),
    width,
    height
  }
}

export function resizeFloatingPanelRect(
  start: FloatingPanelRect,
  handle: FloatingResizeHandle,
  delta: Vector,
  viewport: FloatingPanelViewport
): FloatingPanelRect {
  const bounds = floatingPanelBounds(viewport)
  const resized = { ...start }
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')

  if (west) {
    const right = start.x + start.width
    resized.x = clamp(start.x + delta.x, bounds.left, right - bounds.minWidth)
    resized.width = right - resized.x
  } else if (east) {
    resized.width = clamp(start.width + delta.x, bounds.minWidth, bounds.right - start.x)
  }

  if (north) {
    const bottom = start.y + start.height
    resized.y = clamp(start.y + delta.y, bounds.top, bottom - bounds.minHeight)
    resized.height = bottom - resized.y
  } else if (south) {
    resized.height = clamp(start.height + delta.y, bounds.minHeight, bounds.bottom - start.y)
  }

  return resized
}

export function useEditorWorkspaceFloatingResize(options: FloatingResizeOptions) {
  const active = ref<FloatingResizeSession | null>(null)

  function beginFloatingResize(
    event: PointerEvent,
    id: WorkspaceDockStoredItem,
    handle: FloatingResizeHandle
  ) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      active.value ||
      options.isBlocked() ||
      !(event.currentTarget instanceof HTMLElement)
    )
      return

    const entry = options.entryFor(id)
    if (!entry) return
    const captureTarget = event.currentTarget
    const startRect = resolveFloatingPanelRect(entry, toValue(options.viewport))

    try {
      captureTarget.setPointerCapture(event.pointerId)
    } catch {
      return
    }
    event.preventDefault()
    const lostCaptureTarget = cancelResize
    captureTarget.addEventListener('lostpointercapture', lostCaptureTarget)
    active.value = {
      id,
      pointerId: event.pointerId,
      handle,
      captureTarget,
      lostCaptureTarget,
      startPoint: { x: event.clientX, y: event.clientY },
      startRect,
      rect: startRect
    }
    options.onRaise(id)
  }

  function updateResize(event: PointerEvent) {
    const session = active.value
    if (!session || session.pointerId !== event.pointerId) return
    event.preventDefault()
    const viewport = toValue(options.viewport)
    active.value = {
      ...session,
      rect: resizeFloatingPanelRect(
        resolveFloatingPanelRect(session.startRect, viewport),
        session.handle,
        {
          x: event.clientX - session.startPoint.x,
          y: event.clientY - session.startPoint.y
        },
        viewport
      )
    }
  }

  function finishResize(event: PointerEvent) {
    const session = active.value
    if (!session || session.pointerId !== event.pointerId) return
    updateResize(event)
    const completed = active.value
    if (!completed) return
    clearResize()
    options.onCommit(completed.id, completed.rect)
  }

  function cancelResize() {
    if (active.value) clearResize()
  }

  function clearResize() {
    const session = active.value
    active.value = null
    if (!session) return
    session.captureTarget.removeEventListener('lostpointercapture', session.lostCaptureTarget)
    if (session.captureTarget.hasPointerCapture(session.pointerId)) {
      try {
        session.captureTarget.releasePointerCapture(session.pointerId)
      } catch (error) {
        console.warn('Could not release the workspace panel resize pointer capture', error)
      }
    }
  }

  function rectFor(entry: WorkspaceDockFloating): FloatingPanelRect {
    if (active.value?.id === entry.id) return active.value.rect
    return resolveFloatingPanelRect(entry, toValue(options.viewport))
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !active.value) return
    event.preventDefault()
    cancelResize()
  }

  useEventListener(window, 'pointermove', updateResize, { capture: true, passive: false })
  useEventListener(window, 'pointerup', finishResize, { capture: true })
  useEventListener(window, 'pointercancel', cancelResize, { capture: true })
  useEventListener(window, 'keydown', onWindowKeydown, { capture: true })
  useEventListener(window, 'blur', cancelResize)
  onBeforeUnmount(cancelResize)

  return {
    active: computed(() => active.value !== null),
    beginFloatingResize,
    floatingResizeHandleClass,
    floatingResizeHandles: FLOATING_RESIZE_HANDLES,
    rectFor
  }
}

function floatingPanelBounds(viewport: FloatingPanelViewport): FloatingPanelBounds {
  const margin = remToPx(FLOATING_PANEL_MARGIN_REM)
  const right = Math.max(margin, viewport.width - margin)
  const bottom = Math.max(margin, viewport.height - margin)
  return {
    left: margin,
    top: margin,
    right,
    bottom,
    minWidth: Math.min(remToPx(FLOATING_PANEL_MIN_WIDTH_REM), right - margin),
    minHeight: Math.min(remToPx(FLOATING_PANEL_MIN_HEIGHT_REM), bottom - margin)
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}
