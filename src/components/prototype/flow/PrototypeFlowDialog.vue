<script setup lang="ts">
import { matchesKeyboardEvent } from '@tanstack/hotkeys'
import { DialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, shallowReactive, shallowRef, watch } from 'vue'

import { UndoManager } from '@open-pencil/scene-graph/undo'
import { editorCommandShortcuts } from '@open-pencil/vue/editor/commands'
import { isEditing } from '@open-pencil/vue/editor/keyboard'
import { useI18n } from '@open-pencil/vue/i18n'
import { useSceneComputed } from '@open-pencil/vue/internal/scene-computed'

import { useEditorStore } from '@/app/editor/active-store'
import {
  arrangePrototypeFlow,
  readPrototypeFlow,
  type FlowPoint,
  type PrototypeFlow
} from '@/app/editor/prototype-flow'
import { recentDocumentIdOfStore } from '@/app/recent-files'
import {
  loadPrototypeFlowLayout,
  prototypeFlowLayoutKey,
  savePrototypeFlowLayout
} from '@/app/shell/layout-storage'
import { AppDialogClose, AppDialogRoot } from '@/components/ui/dialog'

import PrototypeFlowBoard from './PrototypeFlowBoard.vue'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ openSource: [nodeId: string] }>()
const store = useEditorStore()
const { common, panels } = useI18n()
const pageId = computed(() => store.state.currentPageId)
const pageName = useSceneComputed(() => store.graph.getNode(pageId.value)?.name ?? '')
const emptyFlow: PrototypeFlow = { frames: [], edges: [] }
const flow = useSceneComputed(() =>
  open.value ? readPrototypeFlow(store.graph, pageId.value) : emptyFlow
)

const layouts = new Map<string, ReadonlyMap<string, FlowPoint>>()
const layoutHistories = new Map<string, UndoManager>()
const positions = shallowRef<ReadonlyMap<string, FlowPoint>>(new Map())

function currentLayoutKey() {
  const documentId = recentDocumentIdOfStore(store) ?? `recovery:${store.getRecoveryId()}`
  return prototypeFlowLayoutKey(documentId, pageId.value)
}

function rememberLayout(key: string, visiblePositions: ReadonlyMap<string, FlowPoint>) {
  const layout = new Map(layouts.get(key))
  for (const [id, point] of visiblePositions) layout.set(id, point)
  layouts.set(key, layout)
  savePrototypeFlowLayout(key, layout)
  return layout
}

watch(
  flow,
  (chart) => {
    if (!open.value) return
    const key = currentLayoutKey()
    const saved = layouts.get(key) ?? loadPrototypeFlowLayout(key)
    if (saved) layouts.set(key, saved)
    positions.value = arrangePrototypeFlow(chart, saved)
    if (saved && chart.frames.some(({ id }) => !saved.has(id))) rememberLayout(key, positions.value)
  },
  { immediate: true }
)

function recordLayoutChange(label: string, next: ReadonlyMap<string, FlowPoint>) {
  const before = new Map<string, FlowPoint>()
  const after = new Map<string, FlowPoint>()
  for (const [id, point] of next) {
    const previous = positions.value.get(id)
    if (!previous || (previous.x === point.x && previous.y === point.y)) continue
    before.set(id, previous)
    after.set(id, point)
  }
  const key = currentLayoutKey()
  if (after.size === 0) {
    rememberLayout(key, positions.value)
    return
  }

  let history = layoutHistories.get(key)
  if (!history) {
    history = new UndoManager()
    layoutHistories.set(key, history)
  }

  // Replay changes onto the live layout so frames added since the edit keep their positions.
  function applyLayout(changes: ReadonlyMap<string, FlowPoint>) {
    const next = new Map(positions.value)
    for (const [id, point] of changes) next.set(id, point)
    positions.value = arrangePrototypeFlow(flow.value, rememberLayout(key, next))
  }

  history.apply({
    label,
    forward: () => applyLayout(after),
    inverse: () => applyLayout(before)
  })
}

function moveCard(id: string, point: FlowPoint) {
  recordLayoutChange('Move flow frame', new Map([[id, point]]))
}

function arrangeFlow() {
  recordLayoutChange('Arrange flow', arrangePrototypeFlow(flow.value))
}

function onLayoutKeydown(event: KeyboardEvent) {
  if (!open.value) return
  const pressed = (id: 'edit.undo' | 'edit.redo') =>
    editorCommandShortcuts(id).some((shortcut) => matchesKeyboardEvent(event, shortcut))
  const redoing = pressed('edit.redo')
  if (!redoing && !pressed('edit.undo')) return

  event.stopPropagation()
  if (event.defaultPrevented || event.isComposing || isEditing(event)) return
  event.preventDefault()
  const history = layoutHistories.get(currentLayoutKey())
  if (redoing) history?.redo()
  else history?.undo()
}

function playFlow(frameId: string | null) {
  const { frames } = flow.value
  const start =
    frames.find(({ id }) => id === frameId) ?? frames.find((frame) => frame.start) ?? frames[0]
  if (!start) return
  open.value = false
  store.startPlay(start.id)
}

const thumbnails = shallowReactive(new Map<string, string>())
const THUMBNAIL_EDGE = 1152
let thumbnailPage: string | undefined
let thumbnailRevision: number | undefined

function clearThumbnails() {
  for (const url of thumbnails.values()) URL.revokeObjectURL(url)
  thumbnails.clear()
}

watch(
  [open, pageId, () => store.state.sceneVersion],
  async ([shown, page, revision], _, onCleanup) => {
    if (!shown) return
    if (thumbnailPage !== page) {
      clearThumbnails()
      thumbnailPage = page
      thumbnailRevision = undefined
    }
    const frames = flow.value.frames
    if (revision === thumbnailRevision && frames.every((frame) => thumbnails.has(frame.id))) return

    let canceled = false
    onCleanup(() => {
      canceled = true
    })
    const frameIds = new Set(frames.map((frame) => frame.id))
    for (const [id, url] of thumbnails) {
      if (frameIds.has(id)) continue
      URL.revokeObjectURL(url)
      thumbnails.delete(id)
    }

    for (const frame of frames) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      if (canceled) return
      const scale = Math.min(2, THUMBNAIL_EDGE / Math.max(1, frame.width, frame.height))
      let png: Uint8Array<ArrayBuffer> | null
      try {
        png = await store.renderExportImage([frame.id], scale, 'PNG', page)
      } catch {
        png = null
      }
      if (canceled) return
      if (!png) continue
      const previous = thumbnails.get(frame.id)
      thumbnails.set(frame.id, URL.createObjectURL(new Blob([png], { type: 'image/png' })))
      if (previous) URL.revokeObjectURL(previous)
    }
    thumbnailRevision = revision
  },
  { immediate: true }
)
onBeforeUnmount(clearThumbnails)

function openSource(nodeId: string) {
  open.value = false
  emit('openSource', nodeId)
}
</script>

<template>
  <AppDialogRoot
    v-model:open="open"
    size="screen"
    height="screen"
    :aria-describedby="undefined"
    data-test-id="prototype-flow-dialog"
    @keydown="onLayoutKeydown"
  >
    <header class="flex h-11 min-w-0 shrink-0 items-center gap-3 border-b border-border px-4">
      <DialogTitle class="min-w-0 flex-1 truncate text-sm font-semibold text-surface">
        {{ panels.prototypeFlowTitle({ page: pageName }) }}
      </DialogTitle>
      <AppDialogClose :ariaLabel="common.close" data-test-id="prototype-flow-close" />
    </header>
    <PrototypeFlowBoard
      v-if="flow.frames.length"
      :flow="flow"
      :positions="positions"
      :thumbnails="thumbnails"
      @move="moveCard"
      @arrange="arrangeFlow"
      @play="playFlow"
      @open-source="openSource"
    />
    <div v-else class="grid flex-1 place-items-center bg-panel-secondary px-4 text-sm text-muted">
      {{ panels.prototypeFlowEmpty }}
    </div>
  </AppDialogRoot>
</template>
