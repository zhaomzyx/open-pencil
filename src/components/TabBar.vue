<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { tv } from 'tailwind-variants'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
  type ComponentPublicInstance,
  type CSSProperties
} from 'vue'

import { resolveEditorProfile } from '@open-pencil/core'
import { focusStyles } from '@open-pencil/theme'
import { useI18n } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { useActiveEditorStoreRef, useEditorStore } from '@/app/editor/active-store'
import { useDocumentNameRename } from '@/app/shell/menu/document-name'
import { animationsEnabled } from '@/app/shell/motion'
import { activeTab, openNewFileTab, useTabsStore } from '@/app/tabs'
import { DOCUMENT_KIND_ICONS } from '@/components/document/kinds'
import PreparationIndicator from '@/components/preparation/tab/PreparationIndicator.vue'
import { useScrollOverflow } from '@/components/ui/list/useScrollOverflow'
import Tip from '@/components/ui/overlay/Tip.vue'
import { useTooltipUI } from '@/components/ui/overlay/tooltip'
import tabBarTheme from '@/theme/tabs/bar'

const { files, rename: renameText } = useI18n()

const { tabs, activeTabId, switchTab, closeTab } = useTabsStore()
const tabBarStyles = tv(tabBarTheme)
const baseStyles = tabBarStyles()
const tabTitleTooltipUI = useTooltipUI({
  content: 'fixed pointer-events-none max-w-[calc(100vw-1rem)]'
})

interface TabTitleSource {
  id: string
  isHome: boolean
  isNewFile: boolean
  name: string
}

interface TabTitleTooltip {
  tabId: string
  label: string
  x: number
  y: number
}

const TAB_TITLE_TOOLTIP_GAP = 12
const TAB_TITLE_TOOLTIP_PADDING = 8

const tabTitleTooltip = ref<TabTitleTooltip>()
const tabTitleTooltipElement = useTemplateRef<HTMLElement>('tabTitleTooltipElement')
const tabTitleTooltipPosition = ref<{ left: number; top: number }>()
let tabTitleTooltipFrame: number | undefined

function placeTabTitleTooltip() {
  tabTitleTooltipFrame = undefined
  const tooltip = tabTitleTooltip.value
  const element = tabTitleTooltipElement.value
  if (!tooltip || !element) return

  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  const bounds = element.getBoundingClientRect()

  let left = tooltip.x + TAB_TITLE_TOOLTIP_GAP
  if (left + bounds.width > viewportWidth - TAB_TITLE_TOOLTIP_PADDING) {
    left = tooltip.x - bounds.width - TAB_TITLE_TOOLTIP_GAP
  }
  left = Math.max(
    TAB_TITLE_TOOLTIP_PADDING,
    Math.min(left, viewportWidth - bounds.width - TAB_TITLE_TOOLTIP_PADDING)
  )

  let top = tooltip.y + TAB_TITLE_TOOLTIP_GAP
  if (top + bounds.height > viewportHeight - TAB_TITLE_TOOLTIP_PADDING) {
    top = tooltip.y - bounds.height - TAB_TITLE_TOOLTIP_GAP
  }
  top = Math.max(
    TAB_TITLE_TOOLTIP_PADDING,
    Math.min(top, viewportHeight - bounds.height - TAB_TITLE_TOOLTIP_PADDING)
  )

  tabTitleTooltipPosition.value = { left, top }
}

function queueTabTitleTooltipPlacement() {
  if (tabTitleTooltipFrame !== undefined) cancelAnimationFrame(tabTitleTooltipFrame)
  tabTitleTooltipFrame = requestAnimationFrame(placeTabTitleTooltip)
}

function showTabTitleTooltip(event: PointerEvent, tab: TabTitleSource) {
  if (tab.isHome || tab.isNewFile || editingName.value || event.pointerType === 'touch') return
  tabTitleTooltipPosition.value = undefined
  tabTitleTooltip.value = {
    tabId: tab.id,
    label: tab.name,
    x: event.clientX,
    y: event.clientY
  }
  void nextTick(queueTabTitleTooltipPlacement)
}

function moveTabTitleTooltip(event: PointerEvent, tab: TabTitleSource) {
  const tooltip = tabTitleTooltip.value
  if (!tooltip || tooltip.tabId !== tab.id) return
  tooltip.label = tab.name
  tooltip.x = event.clientX
  tooltip.y = event.clientY
  queueTabTitleTooltipPlacement()
}

function hideTabTitleTooltip(tabId?: string) {
  if (tabId && tabTitleTooltip.value?.tabId !== tabId) return
  if (tabTitleTooltipFrame !== undefined) cancelAnimationFrame(tabTitleTooltipFrame)
  tabTitleTooltipFrame = undefined
  tabTitleTooltip.value = undefined
  tabTitleTooltipPosition.value = undefined
}

const tabTitleTooltipStyle = computed<CSSProperties>(() => ({
  left: `${tabTitleTooltipPosition.value?.left ?? 0}px`,
  top: `${tabTitleTooltipPosition.value?.top ?? 0}px`,
  visibility: tabTitleTooltipPosition.value ? 'visible' : 'hidden'
}))

const shownStore = useActiveEditorStoreRef()
const { rename, editingName, startRename, commitRename } = useDocumentNameRename(useEditorStore())
const editableTabId = computed(() => {
  const tab = activeTab.value
  if (
    tab?.kind === 'document' &&
    tab.store === shownStore.value &&
    resolveEditorProfile(tab.store.state).edits &&
    !tab.store.state.preparation
  ) {
    return tab.id
  }
  return null
})

watch(editableTabId, rename.cancel, { flush: 'sync' })
watch(editingName, (editing) => {
  if (editing) hideTabTitleTooltip()
})
watch(
  () => tabs.value.some((tab) => tab.id === tabTitleTooltip.value?.tabId),
  (exists) => {
    if (tabTitleTooltip.value && !exists) hideTabTitleTooltip()
  }
)
onBeforeUnmount(() => hideTabTitleTooltip())

function focusNameInput(element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLInputElement) void rename.focusInput(element)
}

const scroller = useTemplateRef<HTMLElement>('scroller')
const { overflowing, overflowStart, overflowEnd, scrollTowardHidden } = useScrollOverflow(
  scroller,
  {
    smooth: animationsEnabled
  }
)

// Keep the active tab in view when it opens, when another one is chosen, and when the row starts
// or stops overflowing, since the chevron that appears then narrows the visible row. Scrolling
// alone never triggers it.
watch(
  [activeTabId, overflowing],
  () => {
    scroller.value?.querySelector('[data-slot="tab-item"][data-active]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: animationsEnabled.value ? 'smooth' : 'auto'
    })
  },
  { flush: 'post' }
)

const modelValue = computed({
  get: () => activeTabId.value,
  set: (id: string) => switchTab(id)
})

/** A New file tab, as Figma's + opens: what to create, and the recent files. */
function createNewTab(event: MouseEvent): void {
  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  openNewFileTab()
}

function onMiddleClick(e: MouseEvent, tabId: string, isHome: boolean) {
  if (e.button === 1 && !isHome) {
    e.preventDefault()
    void closeTab(tabId)
  }
}

function onClose(e: MouseEvent, tabId: string) {
  e.stopPropagation()
  void closeTab(tabId)
}
</script>

<template>
  <TabsRoot
    v-if="tabs.length > 0"
    v-model="modelValue"
    data-slot="tab-bar"
    activation-mode="automatic"
    :class="baseStyles.root()"
  >
    <div
      ref="scroller"
      :class="baseStyles.scroller()"
      :data-overflow-start="overflowStart || undefined"
      :data-overflow-end="overflowEnd || undefined"
    >
      <TabsList :class="baseStyles.list()">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          data-slot="tab-item"
          class="relative"
          :data-active="tab.isActive || undefined"
          :class="tabBarStyles({ active: tab.isActive, home: tab.isHome }).item()"
          @mousedown="onMiddleClick($event, tab.id, tab.isHome)"
          @pointerenter="showTabTitleTooltip($event, tab)"
          @pointermove="moveTabTitleTooltip($event, tab)"
          @pointerleave="hideTabTitleTooltip(tab.id)"
        >
          <TabsTrigger
            :value="tab.id"
            data-test-id="tabbar-tab"
            :class="tabBarStyles({ active: tab.isActive, home: tab.isHome }).trigger()"
            :aria-label="tab.isHome ? files.home : undefined"
            :data-active="tab.isActive || undefined"
            :data-dirty="tab.isDirty || undefined"
          >
            <icon-lucide-house v-if="tab.isHome" :class="baseStyles.icon()" />
            <PreparationIndicator v-else-if="tab.isPreparing" :progress="tab.preparationProgress" />
            <component
              :is="DOCUMENT_KIND_ICONS[tab.fileKind]"
              v-else-if="tab.fileKind"
              :class="baseStyles.icon()"
            />
            <icon-lucide-file v-else :class="baseStyles.icon()" />
            <span v-if="!tab.isHome" class="flex min-w-0 items-start gap-0.5">
              <span
                v-test-id="tab.isActive && !tab.isNewFile ? 'app-document-name' : undefined"
                :class="baseStyles.label()"
                @dblclick="tab.id === editableTabId && startRename()"
              >
                {{ tab.isNewFile ? files.newFile : tab.name }}
              </span>
              <Tip v-if="tab.isDirty" :label="files.unsavedChanges" side="bottom">
                <span
                  role="img"
                  :aria-label="files.unsavedChanges"
                  class="mt-0.5 shrink-0 text-xs leading-none text-muted"
                >
                  *
                </span>
              </Tip>
            </span>
          </TabsTrigger>
          <input
            v-if="editingName && tab.id === editableTabId"
            :ref="focusNameInput"
            data-test-id="app-document-name-input"
            :aria-label="renameText.title"
            :class="[
              'absolute inset-s-2 inset-e-9 top-1/2 min-w-0 -translate-y-1/2 rounded border border-accent bg-input px-1 py-0.5 text-2xs text-surface',
              focusStyles.ringInset
            ]"
            :value="tab.name"
            @blur="commitRename"
            @keydown.stop="rename.onKeydown"
          />
          <Tip
            v-if="!tab.isHome"
            :label="files.closeTab({ name: tab.isNewFile ? files.newFile : tab.name })"
            side="bottom"
          >
            <button
              type="button"
              data-test-id="tabbar-close"
              :class="tabBarStyles({ active: tab.isActive }).close()"
              :data-active="tab.isActive || undefined"
              :aria-label="files.closeTab({ name: tab.isNewFile ? files.newFile : tab.name })"
              tabindex="-1"
              @click="onClose($event, tab.id)"
            >
              <icon-lucide-x :class="baseStyles.closeIcon()" />
            </button>
          </Tip>
        </div>
      </TabsList>
    </div>
    <!-- Sits beside the hidden tabs; it keeps its width when it switches sides, so the overflow never flips back.
         Pointer affordance only: arrow keys move between tabs and the active tab scrolls into view. -->
    <button
      v-if="overflowStart || overflowEnd"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      data-test-id="tabbar-scroll"
      :class="baseStyles.scroll()"
      :data-start="!overflowEnd || undefined"
      @click="scrollTowardHidden"
    >
      <icon-lucide-chevron-right
        v-if="overflowEnd"
        data-direction="reading"
        :class="baseStyles.scrollIcon()"
      />
      <icon-lucide-chevron-left v-else data-direction="reading" :class="baseStyles.scrollIcon()" />
    </button>
    <Tip :label="files.newFile" side="bottom">
      <button
        type="button"
        data-test-id="tabbar-new"
        :aria-label="files.newFile"
        :class="baseStyles.newTab()"
        @click="createNewTab"
      >
        <icon-lucide-plus :class="baseStyles.newIcon()" />
      </button>
    </Tip>
  </TabsRoot>
  <Teleport to="body">
    <div
      v-if="tabTitleTooltip"
      ref="tabTitleTooltipElement"
      role="tooltip"
      :class="tabTitleTooltipUI.content"
      :style="tabTitleTooltipStyle"
    >
      {{ tabTitleTooltip.label }}
    </div>
  </Teleport>
</template>
