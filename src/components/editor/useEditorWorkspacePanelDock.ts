import { useElementBounding, useEventListener } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import {
  computed,
  type MaybeRefOrGetter,
  type ShallowRef,
  onBeforeUnmount,
  reactive,
  ref,
  toValue,
  useId,
  watch
} from 'vue'

import type { Vector } from '@open-pencil/scene-graph/primitives'

import {
  loadWorkspaceDockLayout,
  saveWorkspaceDockLayout,
  type WorkspaceDockArea,
  type WorkspaceDockLayout,
  type WorkspaceDockStoredItem
} from '@/app/shell/layout-storage'
import { remToPx } from '@/app/shell/root-font-size'

import {
  defaultFloatingPanelSize,
  FLOATING_PANEL_MARGIN_REM,
  useEditorWorkspaceFloatingResize,
  type FloatingPanelSize
} from './editor-workspace-floating-resize'
import {
  cloneDockLayout,
  dockDragPreviewStyle,
  dockDropLineStyle,
  dockHitAt as findDockHit,
  type DockHit,
  type DockPanel,
  type DockPlacement,
  iconById,
  isKnownDockItem,
  isWorkspaceDockAction,
  isWorkspaceDockPanel,
  legacyTestIdById,
  nextDockNavigationKey,
  removeDockItem
} from './editor-workspace-panel-dock-model'
import { useEditorWorkspaceRailFlyoutResize } from './editor-workspace-rail-flyout-resize'

type DockArea = WorkspaceDockArea
type PanelArea = Exclude<DockArea, 'rail'>
type DockEntry = {
  id: WorkspaceDockStoredItem
  label: string
  ariaLabel?: string
  severity?: 'error' | 'warning'
}
type DragSource =
  | {
      kind: 'area'
      area: DockArea
      size?: FloatingPanelSize
    }
  | {
      kind: 'floating'
      x: number
      y: number
      width: number
      height: number
    }

type DockDrag = {
  id: WorkspaceDockStoredItem
  pointerId: number
  captureTarget: HTMLButtonElement
  lostCaptureTarget: () => void
  start: Vector
  point: Vector
  offset: Vector
  source: DragSource
  moved: boolean
  hit: DockHit | null
}

type UseEditorWorkspacePanelDockOptions = {
  entries: MaybeRefOrGetter<readonly DockEntry[]>
  surface: MaybeRefOrGetter<HTMLElement | null>
  railTarget: MaybeRefOrGetter<HTMLElement | null>
  topArea: Readonly<ShallowRef<HTMLElement | null>>
  bottomArea: Readonly<ShallowRef<HTMLElement | null>>
  rail: Readonly<ShallowRef<HTMLElement | null>>
  emitActivate: (id: DockPanel) => void
}

const DRAG_THRESHOLD_PX = 5

export function useEditorWorkspacePanelDock(options: UseEditorWorkspacePanelDockOptions) {
  const dockInstanceId = `workspace-dock-${useId().replaceAll(':', '')}`
  const layout = ref(loadWorkspaceDockLayout())
  const drag = ref<DockDrag | null>(null)
  const railOpen = ref<DockPanel | null>(null)
  const selected = reactive<Record<PanelArea, DockPanel | null>>({
    top: null,
    bottom: null
  })
  const frontFloating = ref<WorkspaceDockStoredItem | null>(null)
  const { topArea, bottomArea, rail } = options
  const railBounding = useElementBounding(options.railTarget)
  const surfaceBounding = useElementBounding(options.surface)

  const entryById = computed(
    () => new Map(toValue(options.entries).map((entry) => [entry.id, entry]))
  )
  const placementById = computed(() => {
    const placements = new Map<WorkspaceDockStoredItem, DockPlacement>()
    for (const area of ['rail', 'top', 'bottom'] as const) {
      for (const id of layout.value[area]) placements.set(id, area)
    }
    for (const entry of layout.value.floating) placements.set(entry.id, 'floating')
    return placements
  })
  const floatingEntries = computed(() =>
    layout.value.floating.filter((entry) => entryById.value.has(entry.id))
  )
  const floatingById = computed(
    () => new Map(floatingEntries.value.map((entry) => [entry.id, entry]))
  )
  const topPanel = computed(() => panelForArea('top'))
  const bottomPanel = computed(() => panelForArea('bottom'))
  const railPanel = computed(() =>
    railOpen.value && layout.value.rail.includes(railOpen.value)
      ? (entryById.value.get(railOpen.value) ?? null)
      : null
  )
  const floatingViewport = () => ({
    width: surfaceBounding.width.value,
    height: surfaceBounding.height.value
  })
  const floatingResize = useEditorWorkspaceFloatingResize({
    viewport: floatingViewport,
    entryFor: (id) => floatingById.value.get(id),
    isBlocked: () => drag.value !== null,
    onRaise: (id) => (frontFloating.value = id),
    onCommit: (id, rect) => {
      const next = cloneDockLayout(layout.value)
      const entry = next.floating.find((candidate) => candidate.id === id)
      if (!entry) return
      Object.assign(entry, rect)
      layout.value = next
      frontFloating.value = id
      saveWorkspaceDockLayout(next)
    }
  })
  const railFlyoutResize = useEditorWorkspaceRailFlyoutResize({
    panel: railOpen,
    viewport: floatingViewport,
    surfaceRect: surfaceBounding,
    railRect: railBounding,
    isBlocked: () => drag.value !== null
  })

  watch(
    layout,
    (next) => {
      for (const area of ['top', 'bottom'] as const) {
        if (
          !selected[area] ||
          !next[area].includes(selected[area]) ||
          !entryById.value.has(selected[area])
        )
          selected[area] = panelForArea(area)
      }
      if (railOpen.value && !next.rail.includes(railOpen.value)) railOpen.value = null
      if (frontFloating.value && !next.floating.some((entry) => entry.id === frontFloating.value)) {
        frontFloating.value = next.floating.at(-1)?.id ?? null
      }
    },
    { deep: true, immediate: true }
  )

  function entryFor(id: WorkspaceDockStoredItem): DockEntry | undefined {
    return entryById.value.get(id)
  }

  function labelFor(id: WorkspaceDockStoredItem): string {
    return entryFor(id)?.ariaLabel ?? entryFor(id)?.label ?? id
  }

  function itemIsAvailable(id: WorkspaceDockStoredItem): boolean {
    return entryById.value.has(id)
  }

  function itemsFor(area: DockArea): WorkspaceDockStoredItem[] {
    return layout.value[area].filter(itemIsAvailable)
  }

  function panelForArea(area: PanelArea): DockPanel | null {
    const active = selected[area]
    if (active && layout.value[area].includes(active) && entryById.value.has(active)) return active
    return (
      layout.value[area].find(
        (id): id is DockPanel => isWorkspaceDockPanel(id) && entryById.value.has(id)
      ) ?? null
    )
  }

  function slotIsActive(id: DockPanel): boolean {
    const placement = placementById.value.get(id)
    if (placement === 'rail') return railOpen.value === id
    if (placement === 'floating') return true
    if (placement === 'top' || placement === 'bottom') return panelForArea(placement) === id
    return false
  }

  function selectPanel(id: DockPanel, area: DockPlacement, announce: boolean) {
    if (area === 'floating') {
      raiseFloating(id)
    } else if (area === 'rail') {
      railOpen.value = id
    } else {
      selected[area] = id
    }
    if (announce) options.emitActivate(id)
  }

  function clickPanel(id: DockPanel, area: DockPlacement) {
    if (area === 'rail' && railOpen.value === id) {
      railOpen.value = null
      return
    }
    selectPanel(id, area, true)
  }

  function clickFloatingPanel(id: DockPanel) {
    selectPanel(id, 'floating', true)
  }

  function raiseFloating(id: WorkspaceDockStoredItem) {
    const entry = layout.value.floating.find((candidate) => candidate.id === id)
    if (!entry) return
    const next = cloneDockLayout(layout.value)
    next.floating = [...next.floating.filter((candidate) => candidate.id !== id), { ...entry }]
    layout.value = next
    frontFloating.value = id
  }

  function reveal(id: DockPanel) {
    const placement = placementById.value.get(id)
    if (placement === 'floating') {
      raiseFloating(id)
      return
    }
    if (placement === 'rail') {
      railOpen.value = id
      return
    }
    if (placement === 'top' || placement === 'bottom') selected[placement] = id
  }

  function legacyTestId(id: WorkspaceDockStoredItem): string | undefined {
    return legacyTestIdById[id]
  }

  function panelTargetSelector(id: DockPanel): string {
    const placement = placementById.value.get(id)
    if (placement === 'rail' && railOpen.value === id && toValue(options.surface)) {
      return `#${dockInstanceId}-rail-body`
    }
    if (placement === 'top') return `#${dockInstanceId}-top-body`
    if (placement === 'bottom') return `#${dockInstanceId}-bottom-body`
    if (placement === 'floating' && floatingById.value.has(id) && toValue(options.surface)) {
      return `#${dockInstanceId}-floating-${id}-body`
    }
    return `#${dockInstanceId}-hidden-panels`
  }

  function floatingBodyId(id: WorkspaceDockStoredItem): string {
    return `${dockInstanceId}-floating-${id}-body`
  }

  function severityClass(id: WorkspaceDockStoredItem): string {
    const severity = entryFor(id)?.severity
    if (severity === 'error') return 'bg-error'
    if (severity === 'warning') return 'bg-warning'
    return ''
  }

  function onEntryKeydown(event: KeyboardEvent, id: WorkspaceDockStoredItem, area: DockPlacement) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!(event.currentTarget instanceof HTMLElement)) return
    const toolbar = event.currentTarget.closest<HTMLElement>('[data-dock-toolbar]')
    if (!toolbar) return
    const entries = Array.from(toolbar.querySelectorAll<HTMLElement>('[data-dock-entry]'))
    const current = entries.findIndex((entry) => entry.dataset.dockEntry === id)
    if (current === -1) return
    const nextIndex = nextDockNavigationKey(event, area, current, entries.length)
    if (nextIndex === null) return
    const nextEntry = entries.at(nextIndex)
    const nextId = nextEntry?.dataset.dockEntry
    if (!nextEntry || !isKnownDockItem(nextId)) return

    event.preventDefault()
    nextEntry.querySelector<HTMLElement>('button')?.focus()
    if (isWorkspaceDockPanel(nextId) && (area === 'top' || area === 'bottom')) {
      selected[area] = nextId
      options.emitActivate(nextId)
    }
  }

  function beginItemDrag(event: PointerEvent, id: WorkspaceDockStoredItem) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      drag.value ||
      floatingResize.active.value ||
      railFlyoutResize.active.value
    )
      return
    const button =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
    if (!button) return
    const placement = placementById.value.get(id)
    if (!placement) return

    suppressDragClick = false
    const point = { x: event.clientX, y: event.clientY }
    let source: DragSource
    let origin: DOMRect
    if (placement === 'floating') {
      const floating = floatingById.value.get(id)
      const element = button.closest<HTMLElement>('[data-dock-floating]')
      if (!floating || !element) return
      origin = element.getBoundingClientRect()
      source = {
        kind: 'floating',
        x: floating.x,
        y: floating.y,
        width: origin.width,
        height: origin.height
      }
    } else {
      const size = placement === 'rail' ? railFlyoutResize.sizeFor(id) : undefined
      origin = button.getBoundingClientRect()
      source = { kind: 'area', area: placement, size }
    }

    try {
      button.setPointerCapture(event.pointerId)
    } catch {
      return
    }
    const lostCaptureTarget = cancelDrag
    button.addEventListener('lostpointercapture', lostCaptureTarget)
    drag.value = {
      id,
      pointerId: event.pointerId,
      captureTarget: button,
      lostCaptureTarget,
      start: point,
      point,
      offset: {
        x: point.x - origin.left,
        y: point.y - origin.top
      },
      source,
      moved: false,
      hit: null
    }
  }

  function updateDrag(event: PointerEvent) {
    const active = drag.value
    if (!active || active.pointerId !== event.pointerId) return
    active.point = { x: event.clientX, y: event.clientY }
    if (!active.moved) {
      const distance = Math.hypot(active.point.x - active.start.x, active.point.y - active.start.y)
      if (distance < DRAG_THRESHOLD_PX) return
      active.moved = true
    }
    event.preventDefault()
    active.hit = dockHitAt(active.point.x, active.point.y, active.id)
  }

  function finishDrag(event: PointerEvent) {
    const active = drag.value
    if (!active || active.pointerId !== event.pointerId) return
    updateDrag(event)
    if (!active.moved) {
      clearDrag(false)
      return
    }

    event.preventDefault()
    const hit = active.hit
    if (hit?.changesPosition) {
      moveToArea(active.id, hit.area, hit.index)
    } else if (!hit) {
      const size = active.source.kind === 'floating' ? active.source : active.source.size
      moveToFloating(active.id, floatingPoint(active.point, active.offset, size), size)
    }
    clearDrag(true)
  }

  function cancelDrag() {
    const active = drag.value
    if (active) clearDrag(active.moved)
  }

  function clearDrag(suppressClick: boolean) {
    const active = drag.value
    drag.value = null
    if (!active) return
    active.captureTarget.removeEventListener('lostpointercapture', active.lostCaptureTarget)
    if (active.captureTarget.hasPointerCapture(active.pointerId)) {
      try {
        active.captureTarget.releasePointerCapture(active.pointerId)
      } catch (error) {
        console.warn('Could not release the workspace dock pointer capture', error)
      }
    }
    if (suppressClick) suppressDragClick = true
  }

  function dockHitAt(
    clientX: number,
    clientY: number,
    id: WorkspaceDockStoredItem
  ): DockHit | null {
    return findDockHit(
      { rail: rail.value, top: topArea.value, bottom: bottomArea.value },
      clientX,
      clientY,
      id
    )
  }

  function moveToArea(id: WorkspaceDockStoredItem, area: DockArea, index: number) {
    const next = cloneDockLayout(layout.value)
    removeDockItem(next, id)
    const target = next[area]
    const visible = target.filter(itemIsAvailable)
    const before = visible.at(index)
    const after = visible.at(index - 1)
    let targetIndex = target.length
    if (before) targetIndex = target.indexOf(before)
    else if (after) targetIndex = target.indexOf(after) + 1
    target.splice(clamp(targetIndex, 0, target.length), 0, id)
    layout.value = next
    saveWorkspaceDockLayout(next)
  }

  function moveToFloating(id: WorkspaceDockStoredItem, point: Vector, size?: FloatingPanelSize) {
    const next = cloneDockLayout(layout.value)
    removeDockItem(next, id)
    next.floating.push({ id, ...point, width: size?.width, height: size?.height })
    layout.value = next
    frontFloating.value = id
    saveWorkspaceDockLayout(next)
  }

  function floatingPoint(
    point: Vector,
    offset: Vector,
    size = defaultFloatingPanelSize(floatingViewport())
  ): Vector {
    const bounds = toValue(options.surface)?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    const margin = remToPx(FLOATING_PANEL_MARGIN_REM)
    const maxX = Math.max(margin, bounds.width - size.width - margin)
    const maxY = Math.max(margin, bounds.height - size.height - margin)
    return {
      x: clamp(point.x - bounds.left - offset.x, margin, maxX),
      y: clamp(point.y - bounds.top - offset.y, margin, maxY)
    }
  }

  function floatingStyle(entry: WorkspaceDockLayout['floating'][number]) {
    const rect = floatingResize.rectFor(entry)
    const active = drag.value
    const point =
      active?.source.kind === 'floating' && active.id === entry.id && active.moved && !active.hit
        ? floatingPoint(active.point, active.offset, rect)
        : { x: rect.x, y: rect.y }
    return {
      left: `${point.x}px`,
      top: `${point.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: 30 + Math.max(0, frontIndex(entry.id))
    }
  }

  function dragPreviewStyle() {
    const active = drag.value
    const surface = toValue(options.surface)
    if (!active?.moved || !surface) return undefined
    return dockDragPreviewStyle(active.point, surface.getBoundingClientRect())
  }

  function frontIndex(id: WorkspaceDockStoredItem): number {
    if (frontFloating.value === id) return floatingEntries.value.length
    return floatingEntries.value.findIndex((entry) => entry.id === id)
  }

  function railFlyoutStyle() {
    return railFlyoutResize.styleFor(railOpen.value)
  }

  function dropLineStyle() {
    const active = drag.value
    const surface = toValue(options.surface)
    if (!active?.moved || !active.hit || !surface) return undefined
    const area = areaElement(active.hit.area)
    if (!area) return undefined
    return dockDropLineStyle(area, surface, active.id, active.hit)
  }

  function areaElement(area: DockArea): HTMLElement | null {
    if (area === 'rail') return rail.value
    if (area === 'top') return topArea.value
    return bottomArea.value
  }

  function onDocumentPointerDown(event: PointerEvent) {
    suppressDragClick = false
    if (!railOpen.value || !(event.target instanceof Node)) return
    if (rail.value?.contains(event.target)) return
    if (
      toValue(options.surface)
        ?.querySelector<HTMLElement>('[data-dock-rail-flyout]')
        ?.contains(event.target)
    )
      return
    railOpen.value = null
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !drag.value) return
    event.preventDefault()
    event.stopImmediatePropagation()
    cancelDrag()
  }

  let suppressDragClick = false
  useEventListener(document, 'pointerdown', onDocumentPointerDown, { capture: true })
  useEventListener(window, 'pointermove', updateDrag, { capture: true, passive: false })
  useEventListener(window, 'pointerup', finishDrag, { capture: true })
  useEventListener(window, 'pointercancel', cancelDrag, { capture: true })
  useEventListener(window, 'keydown', onWindowKeydown, { capture: true })
  useEventListener(window, 'blur', cancelDrag)
  useEventListener(
    window,
    'click',
    (event) => {
      if (!suppressDragClick || event.detail === 0) return
      suppressDragClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    { capture: true }
  )
  onBeforeUnmount(cancelDrag)
  return {
    bottomPanel,
    beginFloatingResize: floatingResize.beginFloatingResize,
    beginRailFlyoutResize: railFlyoutResize.beginResize,
    beginItemDrag,
    clickFloatingPanel,
    clickPanel,
    dockInstanceId,
    drag,
    dragPreviewStyle,
    dropLineStyle,
    entryFor,
    floatingBodyId,
    floatingEntries,
    floatingResizeHandleClass: floatingResize.floatingResizeHandleClass,
    floatingResizeHandles: floatingResize.floatingResizeHandles,
    frontFloating,
    floatingStyle,
    iconById,
    isWorkspaceDockAction,
    isWorkspaceDockPanel,
    itemsFor,
    labelFor,
    legacyTestId,
    onEntryKeydown,
    panelForArea,
    panelTargetSelector,
    railFlyoutStyle,
    railOpen,
    railPanel,
    raiseFloating,
    reveal,
    severityClass,
    slotIsActive,
    topPanel
  }
}
