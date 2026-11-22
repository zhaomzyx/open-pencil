import { clamp } from 'es-toolkit'
import type { Component } from 'vue'
import IconCode from '~icons/lucide/code'
import IconPages from '~icons/lucide/file'
import IconFlow from '~icons/lucide/git-branch'
import IconLayers from '~icons/lucide/layers-3'
import IconLint from '~icons/lucide/list-checks'
import IconPreview from '~icons/lucide/play'
import IconAssets from '~icons/lucide/shapes'
import IconShare from '~icons/lucide/share-2'
import IconDesign from '~icons/lucide/sliders-horizontal'
import IconAI from '~icons/lucide/sparkles'
import IconPrototype from '~icons/lucide/workflow'

import type { Vector } from '@open-pencil/scene-graph/primitives'

import type {
  WorkspaceDockArea,
  WorkspaceDockLayout,
  WorkspaceDockStoredItem
} from '@/app/shell/layout-storage'
import { remToPx } from '@/app/shell/root-font-size'

export type DockPlacement = 'rail' | 'top' | 'bottom' | 'floating'
export type DockAction = Extract<WorkspaceDockStoredItem, 'flow' | 'share' | 'preview'>
export type DockPanel = Exclude<WorkspaceDockStoredItem, DockAction>
export type DockHit = {
  area: WorkspaceDockArea
  index: number
  changesPosition: boolean
}

export type DockAreaElements = {
  rail: HTMLElement | null
  top: HTMLElement | null
  bottom: HTMLElement | null
}

export const PANEL_IDS: readonly DockPanel[] = [
  'design',
  'prototype',
  'code',
  'ai',
  'lint',
  'pages',
  'layers',
  'assets'
]
const ACTION_IDS: readonly DockAction[] = ['flow', 'share', 'preview']
const ACTION_ID_SET = new Set<WorkspaceDockStoredItem>(ACTION_IDS)
const PANEL_ID_SET = new Set<WorkspaceDockStoredItem>(PANEL_IDS)
const DOCK_ITEMS: readonly WorkspaceDockStoredItem[] = [...PANEL_IDS, ...ACTION_IDS]
const DOCK_ITEM_SET = new Set<WorkspaceDockStoredItem>(DOCK_ITEMS)
const DROP_LINE_PX = 2

export const iconById: Record<WorkspaceDockStoredItem, Component> = {
  design: IconDesign,
  prototype: IconPrototype,
  code: IconCode,
  ai: IconAI,
  lint: IconLint,
  pages: IconPages,
  layers: IconLayers,
  assets: IconAssets,
  flow: IconFlow,
  share: IconShare,
  preview: IconPreview
}

export const legacyTestIdById: Partial<Record<WorkspaceDockStoredItem, string>> = {
  design: 'properties-tab-design',
  prototype: 'properties-tab-prototype',
  code: 'properties-tab-code',
  ai: 'properties-tab-ai',
  lint: 'properties-tab-lint',
  pages: 'layers-tab-pages',
  layers: 'layers-tab-layers',
  assets: 'left-panel-assets-tab'
}

export function isWorkspaceDockAction(id: WorkspaceDockStoredItem): id is DockAction {
  return ACTION_ID_SET.has(id)
}

export function isWorkspaceDockPanel(id: WorkspaceDockStoredItem): id is DockPanel {
  return PANEL_ID_SET.has(id)
}

export function isKnownDockItem(value: string | undefined): value is WorkspaceDockStoredItem {
  return value !== undefined && DOCK_ITEM_SET.has(value as WorkspaceDockStoredItem)
}

export function cloneDockLayout(layout: WorkspaceDockLayout): WorkspaceDockLayout {
  return {
    version: 2,
    rail: [...layout.rail],
    top: [...layout.top],
    bottom: [...layout.bottom],
    floating: layout.floating.map((entry) => ({ ...entry }))
  }
}

export function removeDockItem(layout: WorkspaceDockLayout, id: WorkspaceDockStoredItem) {
  for (const area of ['rail', 'top', 'bottom'] as const) {
    layout[area] = layout[area].filter((item) => item !== id)
  }
  layout.floating = layout.floating.filter((entry) => entry.id !== id)
}

export function nextDockNavigationKey(
  event: KeyboardEvent,
  area: DockPlacement,
  current: number,
  length: number
): number | null {
  if (length === 0) return null
  const previousKey = area === 'rail' ? 'ArrowUp' : 'ArrowLeft'
  const nextKey = area === 'rail' ? 'ArrowDown' : 'ArrowRight'
  if (event.key === 'Home') return 0
  if (event.key === 'End') return length - 1
  if (event.key === previousKey) return (current - 1 + length) % length
  if (event.key === nextKey) return (current + 1) % length
  return null
}

export function dockHitAt(
  elements: DockAreaElements,
  clientX: number,
  clientY: number,
  id: WorkspaceDockStoredItem
): DockHit | null {
  const target = areaEntries(elements).find(({ element }) => {
    const bounds = element.getBoundingClientRect()
    return (
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    )
  })
  if (!target) return null

  const targetEntries = dockAreaEntries(target.element)
  const sourceIndex = targetEntries.findIndex((entry) => entry.dataset.dockEntry === id)
  const entries = targetEntries.filter((_, index) => index !== sourceIndex)
  const inRail = target.area === 'rail'
  const coordinate = inRail ? clientY : clientX
  const direction = inRail ? 1 : inlineDirection(target.element)
  let index = entries.length
  for (const [entryIndex, entry] of entries.entries()) {
    const bounds = entry.getBoundingClientRect()
    const midpoint = inRail ? bounds.top + bounds.height / 2 : bounds.left + bounds.width / 2
    if ((coordinate - midpoint) * direction < 0) {
      index = entryIndex
      break
    }
  }
  return { area: target.area, index, changesPosition: index !== sourceIndex }
}

export function dockDragPreviewStyle(point: Vector, bounds: DOMRect) {
  return {
    left: `${point.x - bounds.left}px`,
    top: `${point.y - bounds.top}px`
  }
}

export function dockDropLineStyle(
  area: HTMLElement,
  surface: HTMLElement,
  id: WorkspaceDockStoredItem,
  hit: DockHit
) {
  const entries = dockAreaEntries(area).filter((entry) => entry.dataset.dockEntry !== id)
  const next = entries.at(hit.index)
  // The dragged tab still occupies its slot. Use the visible seam next to the insertion target.
  const previous = next ? next.previousElementSibling : entries.at(-1)
  const track =
    (next ?? previous)?.parentElement ?? area.querySelector('[data-dock-toolbar]') ?? area
  const bounds: DockLineBounds = {
    next: next?.getBoundingClientRect(),
    previous: previous?.getBoundingClientRect(),
    track: track.getBoundingClientRect(),
    surface: surface.getBoundingClientRect()
  }
  return hit.area === 'rail'
    ? railDropLineStyle(bounds)
    : panelDropLineStyle(bounds, inlineDirection(area))
}

type DockLineBounds = {
  next: DOMRect | undefined
  previous: DOMRect | undefined
  track: DOMRect
  surface: DOMRect
}

function railDropLineStyle({ next, previous, track, surface }: DockLineBounds) {
  const adjacent = next ?? previous
  const inset = remToPx(0.25)
  const center = gapCenter(previous?.bottom, next?.top, track.top + inset)
  const top = lineStart(center, track.top, track.bottom)
  return {
    left: `${(adjacent?.left ?? track.left + inset) - surface.left}px`,
    top: `${top - surface.top}px`,
    width: `${adjacent?.width ?? Math.max(DROP_LINE_PX, track.width - 2 * inset)}px`,
    height: `${DROP_LINE_PX}px`
  }
}

function panelDropLineStyle({ next, previous, track, surface }: DockLineBounds, direction: 1 | -1) {
  const adjacent = next ?? previous
  const inset = remToPx(0.25)
  const rtl = direction === -1
  const center = gapCenter(
    rtl ? previous?.left : previous?.right,
    rtl ? next?.right : next?.left,
    rtl ? track.right - inset : track.left + inset,
    direction
  )
  const left = lineStart(center, track.left, track.right)
  return {
    left: `${left - surface.left}px`,
    top: `${(adjacent?.top ?? track.top + inset) - surface.top}px`,
    width: `${DROP_LINE_PX}px`,
    height: `${adjacent?.height ?? remToPx(1.75)}px`
  }
}

function areaEntries(
  elements: DockAreaElements
): Array<{ area: WorkspaceDockArea; element: HTMLElement }> {
  const entries: Array<{ area: WorkspaceDockArea; element: HTMLElement | null }> = [
    { area: 'rail', element: elements.rail },
    { area: 'top', element: elements.top },
    { area: 'bottom', element: elements.bottom }
  ]
  return entries.filter(
    (entry): entry is { area: WorkspaceDockArea; element: HTMLElement } => entry.element !== null
  )
}

function inlineDirection(area: HTMLElement): 1 | -1 {
  return getComputedStyle(area).direction === 'rtl' ? -1 : 1
}

function lineStart(center: number, start: number, end: number): number {
  return clamp(center - DROP_LINE_PX / 2, start, Math.max(start, end - DROP_LINE_PX))
}

function gapCenter(
  previousEdge: number | undefined,
  nextEdge: number | undefined,
  emptyPosition: number,
  direction = 1
) {
  if (previousEdge !== undefined && nextEdge !== undefined) return (previousEdge + nextEdge) / 2
  const halfGap = remToPx(0.125) * direction
  if (nextEdge !== undefined) return nextEdge - halfGap
  if (previousEdge !== undefined) return previousEdge + halfGap
  return emptyPosition
}

function dockAreaEntries(area: HTMLElement): HTMLElement[] {
  return Array.from(area.querySelectorAll<HTMLElement>('[data-dock-entry]'))
}
