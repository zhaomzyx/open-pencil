import { clamp } from 'es-toolkit'
import * as v from 'valibot'

import { IS_BROWSER } from '@open-pencil/core/constants'

import type { FlowPoint } from '@/app/editor/prototype-flow'

import { remToPx } from './root-font-size'

const EDITOR_LAYOUT_KEY = 'open-pencil:editor-layout'
/**
 * How wide the right panel opens, in rem, whatever the window's width: wide enough for its fields
 * and the AI chat at the interface size, without growing on a large screen as a share would.
 */
const DEFAULT_RIGHT_PANEL_REM = 16
/** The window width a layout is made for before there is a window, as in tests. */
const NOMINAL_WINDOW_WIDTH = 1280

function defaultEditorLayout(): number {
  const width = IS_BROWSER && window.innerWidth > 0 ? window.innerWidth : NOMINAL_WINDOW_WIDTH
  return clamp((remToPx(DEFAULT_RIGHT_PANEL_REM) / width) * 100, 10, 30)
}

const editorLayoutSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.union([
    v.number(),
    v.pipe(
      v.strictTuple([v.number(), v.number(), v.number()]),
      v.transform((layout) => layout[2])
    )
  ])
)

export function loadEditorLayout(): number {
  if (!IS_BROWSER) return defaultEditorLayout()
  try {
    const parsed = v.safeParse(editorLayoutSchema, window.localStorage.getItem(EDITOR_LAYOUT_KEY))
    return parsed.success ? parsed.output : defaultEditorLayout()
  } catch {
    return defaultEditorLayout()
  }
}

export function saveEditorLayout(layout: number): void {
  if (!IS_BROWSER) return
  window.localStorage.setItem(EDITOR_LAYOUT_KEY, JSON.stringify(layout))
}

const WORKSPACE_RAIL_ORDER_KEY = 'open-pencil:workspace-rail-order'
const workspaceRailItemSchema = v.picklist(['share', 'preview'])
const workspaceRailOrderSchema = v.pipe(v.string(), v.parseJson(), v.array(v.unknown()))

export type WorkspaceRailItem = v.InferOutput<typeof workspaceRailItemSchema>

const DEFAULT_WORKSPACE_RAIL_ORDER: WorkspaceRailItem[] = ['preview', 'share']

function isWorkspaceRailItem(value: unknown): value is WorkspaceRailItem {
  return value === 'share' || value === 'preview'
}

function normalizeWorkspaceRailOrder(order: readonly unknown[]): WorkspaceRailItem[] {
  const normalized: WorkspaceRailItem[] = []
  for (const value of order) {
    if (isWorkspaceRailItem(value) && !normalized.includes(value)) normalized.push(value)
  }
  for (const item of DEFAULT_WORKSPACE_RAIL_ORDER) {
    if (!normalized.includes(item)) normalized.push(item)
  }
  return normalized
}

export function loadWorkspaceRailOrder(): WorkspaceRailItem[] {
  if (!IS_BROWSER) return [...DEFAULT_WORKSPACE_RAIL_ORDER]
  try {
    const stored = v.safeParse(
      workspaceRailOrderSchema,
      window.localStorage.getItem(WORKSPACE_RAIL_ORDER_KEY)
    )
    return stored.success
      ? normalizeWorkspaceRailOrder(stored.output)
      : [...DEFAULT_WORKSPACE_RAIL_ORDER]
  } catch (error) {
    console.warn('Could not read the workspace rail order', error)
    return [...DEFAULT_WORKSPACE_RAIL_ORDER]
  }
}

export function saveWorkspaceRailOrder(order: WorkspaceRailItem[]): void {
  if (!IS_BROWSER) return
  try {
    window.localStorage.setItem(
      WORKSPACE_RAIL_ORDER_KEY,
      JSON.stringify(normalizeWorkspaceRailOrder(order))
    )
  } catch (error) {
    console.warn('Could not save the workspace rail order', error)
  }
}

const WORKSPACE_DOCK_LAYOUT_KEY = 'open-pencil:workspace-dock-layout:v2'
const LEGACY_PANEL_DOCK_KEY = 'open-pencil:panel-dock'

export const WORKSPACE_DOCK_ITEM_IDS = [
  'design',
  'prototype',
  'code',
  'ai',
  'lint',
  'pages',
  'layers',
  'assets',
  'flow',
  'share',
  'preview'
] as const

export type WorkspaceDockStoredItem = (typeof WORKSPACE_DOCK_ITEM_IDS)[number]
export type WorkspaceDockArea = 'rail' | 'top' | 'bottom'

export type WorkspaceDockFloating = {
  id: WorkspaceDockStoredItem
  x: number
  y: number
  width?: number
  height?: number
}

export type WorkspaceDockLayout = {
  version: 2
  rail: WorkspaceDockStoredItem[]
  top: WorkspaceDockStoredItem[]
  bottom: WorkspaceDockStoredItem[]
  floating: WorkspaceDockFloating[]
}

const workspaceDockItemSchema = v.picklist(WORKSPACE_DOCK_ITEM_IDS)
const workspaceDockFloatingSchema = v.object({
  id: workspaceDockItemSchema,
  x: v.pipe(v.number(), v.finite()),
  y: v.pipe(v.number(), v.finite()),
  width: v.optional(v.pipe(v.number(), v.finite(), v.minValue(1))),
  height: v.optional(v.pipe(v.number(), v.finite(), v.minValue(1)))
})
const workspaceDockLayoutValueSchema = v.object({
  version: v.literal(2),
  rail: v.array(workspaceDockItemSchema),
  top: v.array(workspaceDockItemSchema),
  bottom: v.array(workspaceDockItemSchema),
  floating: v.array(workspaceDockFloatingSchema)
})
const workspaceDockLayoutSchema = v.pipe(v.string(), v.parseJson(), workspaceDockLayoutValueSchema)

const legacyPanelPlacementSchema = v.variant('kind', [
  v.object({ kind: v.literal('docked') }),
  v.object({
    kind: v.literal('floating'),
    x: v.pipe(v.number(), v.finite()),
    y: v.pipe(v.number(), v.finite())
  })
])
const legacyPanelDockSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    first: v.picklist(['properties', 'layers']),
    properties: legacyPanelPlacementSchema,
    layers: legacyPanelPlacementSchema
  })
)

const PROPERTY_DOCK_ITEMS = ['design', 'prototype', 'code', 'ai', 'lint'] as const
const LAYER_DOCK_ITEMS = ['pages', 'layers', 'assets'] as const
const propertyDockItemSet = new Set<WorkspaceDockStoredItem>(PROPERTY_DOCK_ITEMS)
const layerDockItemSet = new Set<WorkspaceDockStoredItem>(LAYER_DOCK_ITEMS)
const DEFAULT_FLOATING: WorkspaceDockFloating[] = []

function insertMissingFlowIntoRail(
  rail: readonly WorkspaceDockStoredItem[]
): WorkspaceDockStoredItem[] {
  const next = [...rail]
  if (next.includes('flow')) return next
  const previewIndex = next.indexOf('preview')
  if (previewIndex !== -1) {
    next.splice(previewIndex + 1, 0, 'flow')
    return next
  }
  const shareIndex = next.indexOf('share')
  if (shareIndex !== -1) next.splice(shareIndex, 0, 'flow')
  else next.unshift('flow')
  return next
}

function defaultWorkspaceDockLayout(
  rail: readonly WorkspaceDockStoredItem[] = ['preview', 'flow', 'share'],
  topFirst = true
): WorkspaceDockLayout {
  return {
    version: 2,
    rail: insertMissingFlowIntoRail(rail),
    top: [...(topFirst ? PROPERTY_DOCK_ITEMS : LAYER_DOCK_ITEMS)],
    bottom: [...(topFirst ? LAYER_DOCK_ITEMS : PROPERTY_DOCK_ITEMS)],
    floating: DEFAULT_FLOATING.map((entry) => ({ ...entry }))
  }
}

function normalizeWorkspaceDockLayout(candidate: WorkspaceDockLayout): WorkspaceDockLayout {
  const seen = new Set<WorkspaceDockStoredItem>()
  const normalizeGroup = (items: readonly WorkspaceDockStoredItem[]) => {
    const normalized: WorkspaceDockStoredItem[] = []
    for (const id of items) {
      if (!seen.has(id)) {
        seen.add(id)
        normalized.push(id)
      }
    }
    return normalized
  }
  const floating: WorkspaceDockFloating[] = []
  for (const entry of candidate.floating) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id)
      floating.push({ ...entry })
    }
  }
  const rail = normalizeGroup(candidate.rail)
  const top = normalizeGroup(candidate.top)
  const bottom = normalizeGroup(candidate.bottom)

  if (!seen.has('flow')) {
    const previewIndex = rail.indexOf('preview')
    const shareIndex = rail.indexOf('share')
    if (previewIndex !== -1) rail.splice(previewIndex + 1, 0, 'flow')
    else if (shareIndex !== -1) rail.splice(shareIndex, 0, 'flow')
    else rail.unshift('flow')
    seen.add('flow')
  }

  const completed = { version: 2 as const, rail, top, bottom, floating }
  for (const id of WORKSPACE_DOCK_ITEM_IDS) {
    if (seen.has(id)) continue
    seen.add(id)
    if (id === 'share' || id === 'preview') completed.rail.push(id)
    else if (propertyDockItemSet.has(id)) completed.top.push(id)
    else completed.bottom.push(id)
  }
  return completed
}

function migrateWorkspaceDockLayout(): WorkspaceDockLayout {
  const layout = defaultWorkspaceDockLayout(loadWorkspaceRailOrder())
  if (!IS_BROWSER) return layout

  try {
    const raw = window.localStorage.getItem(LEGACY_PANEL_DOCK_KEY)
    const stored = v.safeParse(legacyPanelDockSchema, raw)
    if (!stored.success) return layout

    const topFirst = stored.output.first === 'properties'
    if (!topFirst) {
      layout.top = [...LAYER_DOCK_ITEMS]
      layout.bottom = [...PROPERTY_DOCK_ITEMS]
    }

    for (const groupId of ['properties', 'layers'] as const) {
      const placement = stored.output[groupId]
      if (placement.kind !== 'floating') continue
      const id = groupId === 'properties' ? 'design' : 'layers'
      const groupItems = groupId === 'properties' ? propertyDockItemSet : layerDockItemSet
      layout.top = layout.top.filter((item) => !groupItems.has(item))
      layout.bottom = layout.bottom.filter((item) => !groupItems.has(item))
      layout.floating.push({ id, x: placement.x, y: placement.y })
    }
    return normalizeWorkspaceDockLayout(layout)
  } catch (error) {
    console.warn('Could not migrate the workspace dock layout', error)
    return normalizeWorkspaceDockLayout(layout)
  }
}

export function loadWorkspaceDockLayout(): WorkspaceDockLayout {
  if (!IS_BROWSER) return defaultWorkspaceDockLayout()
  try {
    const stored = v.safeParse(
      workspaceDockLayoutSchema,
      window.localStorage.getItem(WORKSPACE_DOCK_LAYOUT_KEY)
    )
    if (stored.success) return normalizeWorkspaceDockLayout(stored.output)
  } catch (error) {
    console.warn('Could not read the workspace dock layout', error)
  }
  return migrateWorkspaceDockLayout()
}

export function saveWorkspaceDockLayout(layout: WorkspaceDockLayout): void {
  if (!IS_BROWSER) return
  const normalized = normalizeWorkspaceDockLayout(layout)
  const validated = v.safeParse(workspaceDockLayoutValueSchema, normalized)
  if (!validated.success) {
    console.warn('Could not save the workspace dock layout because it was invalid')
    return
  }
  try {
    window.localStorage.setItem(WORKSPACE_DOCK_LAYOUT_KEY, JSON.stringify(validated.output))
  } catch (error) {
    console.warn('Could not save the workspace dock layout', error)
  }
}

const prototypeFlowLayoutSchema = v.object({
  version: v.literal(1),
  positions: v.record(
    v.string(),
    v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) })
  )
})

export function prototypeFlowLayoutKey(documentId: string, pageId: string): string {
  return `open-pencil:prototype-flow-layout:v1:${encodeURIComponent(documentId)}:${encodeURIComponent(pageId)}`
}

export function loadPrototypeFlowLayout(key: string): Map<string, FlowPoint> | undefined {
  if (!IS_BROWSER) return undefined
  try {
    const parsed = v.safeParse(
      v.pipe(v.string(), v.parseJson(), prototypeFlowLayoutSchema),
      window.localStorage.getItem(key)
    )
    return parsed.success ? new Map(Object.entries(parsed.output.positions)) : undefined
  } catch (error) {
    console.warn('Could not read prototype flow layout', error)
    return undefined
  }
}

export function savePrototypeFlowLayout(
  key: string,
  positions: ReadonlyMap<string, FlowPoint>
): void {
  if (!IS_BROWSER) return
  const layout = { version: 1, positions: Object.fromEntries(positions) }
  if (!v.safeParse(prototypeFlowLayoutSchema, layout).success) return
  try {
    window.localStorage.setItem(key, JSON.stringify(layout))
  } catch (error) {
    console.warn('Could not save prototype flow layout', error)
  }
}
