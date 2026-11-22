import { clamp } from 'es-toolkit'
import { ref, toValue, type MaybeRefOrGetter } from 'vue'

import type { WorkspaceDockStoredItem } from '@/app/shell/layout-storage'
import { remToPx } from '@/app/shell/root-font-size'

import {
  defaultFloatingPanelSize,
  FLOATING_PANEL_MARGIN_REM,
  useEditorWorkspaceFloatingResize,
  type FloatingPanelRect,
  type FloatingPanelSize,
  type FloatingPanelViewport
} from './editor-workspace-floating-resize'
import type { DockPanel } from './editor-workspace-panel-dock-model'

type RailFlyoutResizeOptions = {
  panel: MaybeRefOrGetter<DockPanel | null>
  viewport: MaybeRefOrGetter<FloatingPanelViewport>
  surfaceRect: {
    left: MaybeRefOrGetter<number>
    top: MaybeRefOrGetter<number>
    width: MaybeRefOrGetter<number>
    height: MaybeRefOrGetter<number>
  }
  railRect: {
    left: MaybeRefOrGetter<number>
    top: MaybeRefOrGetter<number>
    width: MaybeRefOrGetter<number>
  }
  isBlocked: () => boolean
}

export function useEditorWorkspaceRailFlyoutResize(options: RailFlyoutResizeOptions) {
  const bounds = ref<Partial<Record<DockPanel, FloatingPanelRect>>>({})
  const resize = useEditorWorkspaceFloatingResize({
    viewport: options.viewport,
    entryFor: railFlyoutEntry,
    isBlocked: options.isBlocked,
    onRaise: () => undefined,
    onCommit: (id, rect) => {
      if (!isCurrentPanel(id)) return
      bounds.value = { ...bounds.value, [id]: rect }
    }
  })

  function railFlyoutEntry(id: WorkspaceDockStoredItem) {
    if (!isCurrentPanel(id)) return undefined
    const surface = {
      left: toValue(options.surfaceRect.left),
      top: toValue(options.surfaceRect.top),
      width: toValue(options.surfaceRect.width),
      height: toValue(options.surfaceRect.height)
    }
    const rail = {
      left: toValue(options.railRect.left),
      top: toValue(options.railRect.top),
      width: toValue(options.railRect.width)
    }
    const margin = remToPx(FLOATING_PANEL_MARGIN_REM)
    const { width, height } = defaultFloatingPanelSize(toValue(options.viewport))
    const availableWidth = Math.max(1, surface.width - margin * 2)
    const availableHeight = Math.max(1, surface.height - margin * 2)
    const leftOfRail = rail.left - surface.left - width - margin
    const rightOfRail = rail.left - surface.left + rail.width + margin
    const left = leftOfRail >= margin ? leftOfRail : rightOfRail
    return {
      id,
      x: clamp(left, margin, Math.max(margin, availableWidth - width + margin)),
      y: clamp(rail.top - surface.top, margin, Math.max(margin, availableHeight - height + margin)),
      width,
      height,
      ...bounds.value[id]
    }
  }

  function isCurrentPanel(id: WorkspaceDockStoredItem): id is DockPanel {
    return id === toValue(options.panel)
  }

  function styleFor(panel: DockPanel | null) {
    if (!panel) return undefined
    const entry = railFlyoutEntry(panel)
    if (!entry) return undefined
    const rect = resize.rectFor(entry)
    return {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    }
  }

  function sizeFor(id: WorkspaceDockStoredItem): FloatingPanelSize | undefined {
    const entry = railFlyoutEntry(id)
    if (!entry) return undefined
    const { width, height } = resize.rectFor(entry)
    return { width, height }
  }

  return {
    active: resize.active,
    beginResize: resize.beginFloatingResize,
    sizeFor,
    styleFor
  }
}
