<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import { computed, nextTick, ref, useTemplateRef, watch, watchEffect } from 'vue'

import { resolveEditorProfile } from '@open-pencil/core'
import { formatShortcut } from '@open-pencil/vue/editor/commands'
import { useViewportKind } from '@open-pencil/vue/editor/viewport-kind'
import { useDesignCheckMessages, useI18n } from '@open-pencil/vue/i18n'

import { floatingChatOpen, propertiesTab } from '@/app/ai/chat/panel'
import { isVersionHistoryOpen } from '@/app/cloud/integration'
import { provideTabEditorStore } from '@/app/editor/active-store'
import { countIssues } from '@/app/editor/design-check/issues'
import { providePlayHotspotHints } from '@/app/editor/play-hotspot-hints'
import { appRuntimeConfig } from '@/app/runtime/config'
import { interfaceScaleFactor } from '@/app/shell/interface-scale'
import { loadEditorLayout, saveEditorLayout } from '@/app/shell/layout-storage'
import { appMenuShortcut } from '@/app/shell/menu/shortcut'
import { remToPx } from '@/app/shell/root-font-size'
import type { Tab } from '@/app/tabs'
import CanvasSplitRoot from '@/components/canvas/CanvasSplitRoot.vue'
import FloatingChat from '@/components/chat/FloatingChat.vue'
import ActiveRoomOverlay from '@/components/collab-room/ActiveRoomOverlay.vue'
import { useRoomActions } from '@/components/collab-room/useRoomActions'
import CommentDeleteDialog from '@/components/comments/CommentDeleteDialog.vue'
import EditorCanvas from '@/components/EditorCanvas.vue'
import LayersPanel, { type LayersPanelView } from '@/components/LayersPanel.vue'
import MobileDrawer from '@/components/MobileDrawer.vue'
import MobileHud from '@/components/MobileHud/MobileHud.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import PrototypeFlowDialog from '@/components/prototype/flow/PrototypeFlowDialog.vue'
import StatusesDialog from '@/components/statuses/StatusesDialog.vue'
import EditorToolbar from '@/components/toolbar/EditorToolbar.vue'
import VariablesDialog from '@/components/variables/VariablesDialog.vue'
import splitterTheme from '@/theme/splitter'

import EditorWorkspaceAction from './EditorWorkspaceAction.vue'
import EditorWorkspacePanelDock, {
  type WorkspaceDockEntry,
  type WorkspaceDockPanel
} from './EditorWorkspacePanelDock.vue'
import WorkspacePill from './WorkspacePill.vue'
import ZoomDropdown from './ZoomDropdown.vue'

const showChrome = appRuntimeConfig.showChrome
/**
 * The document tab this workspace edits. WorkspaceView keys the workspace by tab, so the tab and
 * its store are fixed for its lifetime, and its editor UI stays bound to that document rather
 * than following the active tab to the next document when this one closes.
 */
const { tab, canvasAlone, showPanels } = defineProps<{
  tab: Tab
  canvasAlone: boolean
  showPanels: boolean
}>()
const store = tab.store
provideTabEditorStore(store)
const playHotspotHints = providePlayHotspotHints()
const { isMobile } = useViewportKind()
/** Whether the AI chat floats over the canvas while the panels are hidden; Toggle AI chat opens it too. */
const floatingChat = floatingChatOpen(store)
const interfaceScale = computed(interfaceScaleFactor)
const workspace = useTemplateRef('workspace')
const floatingPanels = useTemplateRef('floatingPanels')
const railTarget = useTemplateRef('railTarget')
const panelDock = useTemplateRef('panelDock')
const { width: workspaceWidth } = useElementSize(() => {
  const element: unknown = workspace.value?.$el
  return element instanceof HTMLElement ? element : null
})
/** The narrowest a sidebar may get at a larger interface size, in rem so it grows with it. */
const MIN_SIDEBAR_REM = 15
const MAX_SCALED_SIDEBAR_PERCENT = 35
// Retain usable fields at larger scales, while leaving at least 30% for the canvas.
const sidebarMinimum = computed(() =>
  interfaceScale.value > 1 && workspaceWidth.value > 0
    ? Math.min(MAX_SCALED_SIDEBAR_PERCENT, (remToPx(MIN_SIDEBAR_REM) * 100) / workspaceWidth.value)
    : 10
)
const sidebarMaximum = computed(() => (interfaceScale.value > 1 ? MAX_SCALED_SIDEBAR_PERCENT : 30))
const preferredWidth = ref(loadEditorLayout())
const rightSize = computed(() =>
  clamp(preferredWidth.value, sidebarMinimum.value, sidebarMaximum.value)
)
let displayedLayout: number[] = []
let startSize: number | undefined
/** How far apart two sizes, in percent, still count as one; the splitter rounds sizes finer. */
const LAYOUT_TOLERANCE = 1e-6
function beginResize() {
  startSize = displayedLayout[1]
}
function finishResize() {
  const before = startSize
  startSize = undefined
  const size = displayedLayout[1]
  if (before === undefined || size === undefined || Math.abs(size - before) < LAYOUT_TOLERANCE)
    return
  preferredWidth.value = size
  saveEditorLayout(size)
}
function onDragging(dragging: boolean) {
  if (dragging) beginResize()
  else finishResize()
}
function isResizeKey(event: KeyboardEvent) {
  return ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
}
function onResizeKeyDown(event: KeyboardEvent) {
  if (isResizeKey(event)) beginResize()
}
function onResizeKeyHandled(event: KeyboardEvent) {
  // Reka emits layout synchronously at the handle, between capture and group bubbling.
  if (isResizeKey(event)) finishResize()
}
const horizontalSplitterStyles = tv(splitterTheme)({ direction: 'horizontal' })
/**
 * A canvas whose view hides the panels takes the whole window when it is the only one shown, in the
 * canvas-only layout; split view keeps the panels for the other panes.
 */
// The view being worked in runs its design, which the Play button shows pressed.
const live = computed(() => resolveEditorProfile(store.state).live)
const previewing = computed(() => live.value !== null)
const preparingDocument = computed(
  () => !!store.state.preparation && store.state.preparation.kind !== 'font-retry'
)
watch(preparingDocument, (preparing) => {
  // A keyboard shortcut can enter preview before a lazily imported page has its layers.
  if (!preparing && previewing.value) store.resetPlay()
})
const canGoBack = computed(
  () => !!(live.value?.player?.history.length || live.value?.player?.overlays.length)
)
// A board keeps its tools when its panels are away, as FigJam always shows them, while they
// draw: a pan-only preview has none. A phone keeps its drawer, which holds the panels and chat.
const toolsStay = computed(() => {
  const profile = resolveEditorProfile(store.state)
  return !profile.panelsOpen && profile.pointer === 'tools'
})
/**
 * Reka (2.11) attaches a resize handle's arrow-key listener in an effect that runs before a
 * handle mounted into an existing splitter is in the document, and never again, so handles that
 * come back with the panels could not be resized from the keyboard. They start disabled and are
 * enabled once rendered, which runs that effect again. Remove once
 * https://github.com/unovue/reka-ui/issues/3160 is fixed.
 */
const handlesReady = ref(false)
watch(
  () => showPanels,
  (shown) => {
    handlesReady.value = false
    if (shown) void nextTick(() => (handlesReady.value = true))
  },
  { immediate: true }
)
const { panels, collaboration, editor } = useI18n()
const checkMessages = useDesignCheckMessages()
const layersPanel = defineModel<LayersPanelView>('layersPanel', { required: true })
const profile = computed(() => resolveEditorProfile(store.state))
const canPrototype = computed(() => {
  const { framesOpen, edits, layerEdits, live } = profile.value
  return framesOpen && edits && layerEdits === 'all' && !live
})
const showLint = computed(() => profile.value.lint)
const sidebarOverride = computed(() => {
  if (isVersionHistoryOpen(store)) return 'history'
  return store.state.activeTool === 'COMMENT' ? 'comments' : null
})

const problemCount = computed(() => {
  const snapshot = store.designCheck.snapshot.value
  if (!snapshot || snapshot.pageId !== store.state.currentPageId) return null
  const { error, warning } = countIssues(snapshot.issues)
  return { total: error + warning, severity: error > 0 ? 'error' : 'warning' } as const
})
const dockEntries = computed((): WorkspaceDockEntry[] => {
  const messages = panels.value
  const issues = problemCount.value
  const entries: WorkspaceDockEntry[] = [{ id: 'design', label: messages.design }]
  if (canPrototype.value) entries.push({ id: 'prototype', label: messages.prototypeTab })
  entries.push({ id: 'code', label: messages.code }, { id: 'ai', label: messages.ai })
  if (showLint.value)
    entries.push({
      id: 'lint',
      label: checkMessages.value.tab,
      ariaLabel: issues?.total
        ? `${checkMessages.value.tab}, ${checkMessages.value.tabCount({ count: issues.total })}`
        : undefined,
      severity: issues?.total ? issues.severity : undefined
    })
  entries.push(
    { id: 'pages', label: messages.pages },
    { id: 'layers', label: messages.layers },
    { id: 'assets', label: messages.assets }
  )
  if (canPrototype.value) {
    entries.push({ id: 'flow', label: panels.value.prototypeViewFlow })
  }
  entries.push(
    { id: 'share', label: collaboration.value.share },
    {
      id: 'preview',
      label: editor.value.startPreview({
        shortcut: formatShortcut(appMenuShortcut('toggle-preview')) ?? ''
      })
    }
  )
  return entries
})

function isNavigationPanel(id: WorkspaceDockPanel): id is LayersPanelView {
  return id === 'pages' || id === 'layers' || id === 'assets'
}

function activateDockPanel(id: WorkspaceDockPanel) {
  if (isNavigationPanel(id)) layersPanel.value = id
  else propertiesTab.value = id
}

const flowOpen = ref(false)

watchEffect(() => {
  if (
    (!showLint.value && propertiesTab.value === 'lint') ||
    (!canPrototype.value && propertiesTab.value === 'prototype')
  )
    propertiesTab.value = 'design'
})
watch(propertiesTab, (id) => panelDock.value?.reveal(id), { flush: 'post' })
watch(layersPanel, (id) => panelDock.value?.reveal(id), { flush: 'post' })
watch(
  panelDock,
  (dock) => {
    dock?.reveal(layersPanel.value)
    dock?.reveal(propertiesTab.value)
  },
  { flush: 'post' }
)
// Until a room's document arrives there is nothing to edit, so its screen replaces the editor.
const { pending: roomPending } = useRoomActions()
</script>

<template>
  <div v-if="roomPending" :key="'room-' + tab.id" class="relative flex flex-1 overflow-hidden">
    <ActiveRoomOverlay />
  </div>

  <SplitterGroup
    v-else-if="!isMobile && showChrome"
    :key="tab.id"
    ref="workspace"
    direction="horizontal"
    class="relative min-h-0 flex-1 overflow-hidden"
    @layout="displayedLayout = $event"
    @keydown="onResizeKeyHandled"
  >
    <!-- Let the canvas take the remainder; its cached default must not outlive sidebar changes. -->
    <SplitterPanel id="canvas" :order="1" :min-size="30" class="flex">
      <EditorToolbar v-if="showPanels" in-rail />
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex min-h-0 flex-1">
          <div class="relative flex min-w-0 flex-1">
            <CanvasSplitRoot />
            <ActiveRoomOverlay />
            <template v-if="!showPanels">
              <WorkspacePill
                v-if="canvasAlone"
                mode="preview"
                :document-name="store.state.documentName"
                :shortcut="formatShortcut(appMenuShortcut('toggle-preview')) ?? ''"
                :can-go-back="canGoBack"
                @show-interactions="playHotspotHints.request(store.activePaneId.value)"
                @back="store.backPlay()"
                @reset="store.resetPlay()"
                @leave="store.stopPlay()"
              />
              <div v-else class="pointer-events-none absolute inset-0 flex flex-col">
                <WorkspacePill
                  mode="collapsed"
                  :document-name="store.state.documentName"
                  :shortcut="formatShortcut(appMenuShortcut('toggle-ui')) ?? ''"
                  :chat-open="floatingChat"
                  @show-ui="store.state.showUI = true"
                  @toggle-chat="floatingChat = !floatingChat"
                />
                <div
                  v-if="toolsStay"
                  class="relative min-h-0 flex-1 [&_[data-canvas-obstacle]]:pointer-events-auto [&_[data-canvas-obstacle][data-side=top]]:top-2 [&_[data-canvas-obstacle][data-orientation=vertical][data-align=start]]:top-2"
                >
                  <EditorToolbar />
                </div>
              </div>
              <FloatingChat v-if="!canvasAlone && floatingChat" @close="floatingChat = false" />
            </template>
          </div>
          <div v-if="showPanels" ref="railTarget" class="flex w-11 min-h-0 shrink-0 flex-col" />
        </div>
        <div
          v-if="showPanels"
          data-test-id="workspace-bottom-bar"
          class="flex h-7 shrink-0 items-center border-t border-border bg-panel-secondary px-1"
        >
          <ZoomDropdown side="top" align="start" />
        </div>
      </div>
    </SplitterPanel>
    <template v-if="showPanels">
      <SplitterResizeHandle
        data-test-id="right-splitter-handle"
        :disabled="!handlesReady"
        :class="horizontalSplitterStyles.handle()"
        @dragging="onDragging"
        @keydown.capture="onResizeKeyDown"
      />
      <SplitterPanel
        id="properties"
        :order="2"
        :default-size="rightSize"
        :min-size="sidebarMinimum"
        :max-size="sidebarMaximum"
        class="flex flex-col"
      >
        <EditorWorkspacePanelDock
          ref="panelDock"
          :entries="dockEntries"
          :surface="floatingPanels"
          :rail-target="railTarget"
          @activate="activateDockPanel"
        >
          <template #panel="{ id, active }">
            <LayersPanel v-if="isNavigationPanel(id)" :view="id" :active="active" />
            <PropertiesPanel v-else :view="id" :active="active" />
          </template>
          <template #action="{ id, placement }">
            <EditorWorkspaceAction
              :item="id"
              :placement="placement"
              :previewing="previewing"
              :preview-disabled="preparingDocument && !previewing"
              @open-flow="flowOpen = true"
              @toggle-preview="store.togglePlay()"
            />
          </template>
          <template v-if="sidebarOverride" #top-override>
            <PropertiesPanel :view="sidebarOverride" active />
          </template>
        </EditorWorkspacePanelDock>
      </SplitterPanel>
    </template>
    <div
      ref="floatingPanels"
      class="pointer-events-none absolute inset-x-0 top-0 z-20"
      :class="showPanels ? 'bottom-7' : 'bottom-0'"
    />
  </SplitterGroup>

  <div
    v-else-if="isMobile && showChrome"
    :key="'mobile-' + tab.id"
    class="flex flex-1 overflow-hidden"
  >
    <div class="relative flex min-w-0 flex-1">
      <EditorCanvas />
      <ActiveRoomOverlay />
      <WorkspacePill
        v-if="previewing"
        mode="preview"
        :document-name="store.state.documentName"
        :shortcut="formatShortcut(appMenuShortcut('toggle-preview')) ?? ''"
        :can-go-back="canGoBack"
        @show-interactions="playHotspotHints.request()"
        @back="store.backPlay()"
        @reset="store.resetPlay()"
        @leave="store.stopPlay()"
      />
      <template v-else>
        <MobileHud />
        <EditorToolbar />
      </template>
    </div>
    <MobileDrawer v-if="!previewing" />
  </div>

  <div v-else :key="'bare-' + tab.id" class="flex flex-1 overflow-hidden">
    <div class="relative flex min-w-0 flex-1">
      <EditorCanvas />
      <ActiveRoomOverlay />
    </div>
  </div>

  <PrototypeFlowDialog v-model:open="flowOpen" />
  <VariablesDialog />
  <StatusesDialog />
  <CommentDeleteDialog />
</template>
