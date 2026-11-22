<script lang="ts">
export type WorkspaceDockItem =
  | 'design'
  | 'prototype'
  | 'code'
  | 'ai'
  | 'lint'
  | 'pages'
  | 'layers'
  | 'assets'
  | 'flow'
  | 'share'
  | 'preview'

export type WorkspaceDockAction = 'flow' | 'share' | 'preview'

export type WorkspaceDockPanel = Exclude<WorkspaceDockItem, WorkspaceDockAction>

export type WorkspaceDockEntry = {
  id: WorkspaceDockItem
  label: string
  ariaLabel?: string
  severity?: 'error' | 'warning'
}
</script>

<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import type { VNode } from 'vue'
import { useTemplateRef } from 'vue'

import { focusStyles } from '@open-pencil/theme'
import { useI18n } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { useInlineSide } from '@/components/ui/direction/inline-side'
import Tip from '@/components/ui/overlay/Tip.vue'
import splitterTheme from '@/theme/splitter'

import { PANEL_IDS } from './editor-workspace-panel-dock-model'
import { useEditorWorkspacePanelDock } from './useEditorWorkspacePanelDock'

const { entries, surface, railTarget } = defineProps<{
  entries: readonly WorkspaceDockEntry[]
  surface: HTMLElement | null
  railTarget: HTMLElement | null
}>()

const emit = defineEmits<{
  activate: [id: WorkspaceDockPanel]
}>()

defineSlots<{
  panel: (props: { id: WorkspaceDockPanel; active: boolean }) => VNode[]
  action: (props: {
    id: WorkspaceDockAction
    placement: 'rail' | 'top' | 'bottom' | 'floating'
  }) => VNode[]
  'top-override'?: () => VNode[]
}>()

const { common, panels } = useI18n()
const canvasSide = useInlineSide('start')
const topArea = useTemplateRef<HTMLElement>('topArea')
const bottomArea = useTemplateRef<HTMLElement>('bottomArea')
const rail = useTemplateRef<HTMLElement>('rail')
const splitter = tv(splitterTheme)({ direction: 'vertical' })
const tabBarClass = 'flex h-9 shrink-0 items-center gap-1 bg-panel-secondary pe-1'
const tabRowClass = 'flex h-full min-w-0 flex-1 items-end gap-1 overflow-x-auto'
const tabEntryClass = 'flex h-8 shrink-0 items-center first:[&>button]:ps-3'
const tabClass = [
  'relative flex h-8 cursor-default touch-none select-none items-center gap-1.5 rounded-t-md px-2 text-2xs font-medium text-muted/92 aria-pressed:bg-panel aria-pressed:font-semibold aria-pressed:text-surface',
  'aria-[pressed=false]:hover:bg-hover aria-[pressed=false]:hover:text-surface',
  focusStyles.ring
]
const {
  bottomPanel,
  beginFloatingResize,
  beginRailFlyoutResize,
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
  floatingResizeHandleClass,
  floatingResizeHandles,
  floatingStyle,
  frontFloating,
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
} = useEditorWorkspacePanelDock({
  entries: () => entries,
  surface: () => surface,
  railTarget: () => railTarget,
  topArea,
  bottomArea,
  rail,
  emitActivate: (id) => emit('activate', id)
})

defineExpose({ reveal })
</script>

<template>
  <div
    data-test-id="workspace-panel-dock"
    class="flex min-h-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--color-panel-secondary),black_7%)] p-1"
  >
    <div :id="`${dockInstanceId}-hidden-panels`" class="hidden" />

    <SplitterGroup direction="vertical" auto-save-id="desktop-right-dock" class="min-h-0 flex-1">
      <SplitterPanel
        id="workspace-dock-top"
        :order="0"
        :default-size="52"
        :min-size="20"
        class="flex"
      >
        <section
          ref="topArea"
          data-dock-area="top"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-panel"
        >
          <template v-if="!$slots['top-override']">
            <header
              data-dock-toolbar="top"
              :class="tabBarClass"
              role="toolbar"
              aria-orientation="horizontal"
            >
              <div :class="tabRowClass">
                <span
                  v-for="id in itemsFor('top')"
                  :key="id"
                  :data-dock-entry="id"
                  :class="[tabEntryClass, { 'opacity-50': drag?.moved && drag.id === id }]"
                  @keydown="onEntryKeydown($event, id, 'top')"
                >
                  <span
                    v-if="isWorkspaceDockAction(id)"
                    data-dock-drag-host
                    class="relative inline-flex [&_button]:cursor-default"
                    @pointerdown="beginItemDrag($event, id)"
                  >
                    <slot name="action" :id="id" placement="top" />
                    <span
                      v-if="entryFor(id)?.severity"
                      aria-hidden="true"
                      class="pointer-events-none absolute -inset-e-0.5 -top-0.5 size-1.5 rounded-full"
                      :class="severityClass(id)"
                    />
                  </span>
                  <button
                    v-else
                    type="button"
                    v-test-id="legacyTestId(id)"
                    :aria-label="labelFor(id)"
                    :aria-pressed="panelForArea('top') === id ? 'true' : 'false'"
                    :class="tabClass"
                    @pointerdown="beginItemDrag($event, id)"
                    @click="clickPanel(id, 'top')"
                  >
                    <component
                      :is="iconById[id]"
                      v-if="id !== 'design'"
                      class="size-3 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{{ entryFor(id)?.label ?? id }}</span>
                    <span
                      v-if="entryFor(id)?.severity"
                      aria-hidden="true"
                      class="size-1.5 rounded-full"
                      :class="severityClass(id)"
                    />
                  </button>
                </span>
              </div>
            </header>
          </template>

          <div class="relative flex min-h-0 flex-1 flex-col">
            <div
              :id="`${dockInstanceId}-top-body`"
              class="absolute inset-0"
              :class="$slots['top-override'] ? 'invisible' : ''"
            />
            <div
              v-if="!topPanel && !$slots['top-override']"
              class="pointer-events-none absolute inset-1 flex items-center justify-center rounded-md border border-dashed border-border text-2xs text-muted"
            >
              <icon-lucide-plus class="me-1 size-3" aria-hidden="true" />
              <span>{{ panels.dockPanel }}</span>
            </div>
            <slot name="top-override" />
          </div>
        </section>
      </SplitterPanel>

      <SplitterResizeHandle
        data-test-id="dock-splitter-handle"
        :class="splitter.handle({ class: 'my-0 h-1' })"
      />

      <SplitterPanel
        id="workspace-dock-bottom"
        :order="1"
        :default-size="48"
        :min-size="20"
        class="flex"
      >
        <section
          ref="bottomArea"
          data-dock-area="bottom"
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-panel"
        >
          <header
            data-dock-toolbar="bottom"
            :class="tabBarClass"
            role="toolbar"
            aria-orientation="horizontal"
          >
            <div :class="tabRowClass">
              <span
                v-for="id in itemsFor('bottom')"
                :key="id"
                :data-dock-entry="id"
                :class="[tabEntryClass, { 'opacity-50': drag?.moved && drag.id === id }]"
                @keydown="onEntryKeydown($event, id, 'bottom')"
              >
                <span
                  v-if="isWorkspaceDockAction(id)"
                  data-dock-drag-host
                  class="relative inline-flex [&_button]:cursor-default"
                  @pointerdown="beginItemDrag($event, id)"
                >
                  <slot name="action" :id="id" placement="bottom" />
                  <span
                    v-if="entryFor(id)?.severity"
                    aria-hidden="true"
                    class="pointer-events-none absolute -inset-e-0.5 -top-0.5 size-1.5 rounded-full"
                    :class="severityClass(id)"
                  />
                </span>
                <button
                  v-else
                  type="button"
                  v-test-id="legacyTestId(id)"
                  :aria-label="labelFor(id)"
                  :aria-pressed="panelForArea('bottom') === id ? 'true' : 'false'"
                  :class="tabClass"
                  @pointerdown="beginItemDrag($event, id)"
                  @click="clickPanel(id, 'bottom')"
                >
                  <component
                    :is="iconById[id]"
                    v-if="id !== 'design'"
                    class="size-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{{ entryFor(id)?.label ?? id }}</span>
                  <span
                    v-if="entryFor(id)?.severity"
                    aria-hidden="true"
                    class="size-1.5 rounded-full"
                    :class="severityClass(id)"
                  />
                </button>
              </span>
            </div>
          </header>

          <div class="relative flex min-h-0 flex-1 flex-col">
            <div :id="`${dockInstanceId}-bottom-body`" class="absolute inset-0" />
            <div
              v-if="!bottomPanel"
              class="pointer-events-none absolute inset-1 flex items-center justify-center rounded-md border border-dashed border-border text-2xs text-muted"
            >
              <icon-lucide-plus class="me-1 size-3" aria-hidden="true" />
              <span>{{ panels.dockPanel }}</span>
            </div>
          </div>
        </section>
      </SplitterPanel>
    </SplitterGroup>

    <Teleport v-if="railTarget" :to="railTarget">
      <div
        ref="rail"
        data-test-id="workspace-action-rail"
        data-dock-area="rail"
        class="flex h-full w-11 min-h-0 shrink-0 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto border-s border-border bg-panel px-0.5 py-1"
        role="toolbar"
        aria-orientation="vertical"
        data-dock-toolbar="rail"
      >
        <span
          v-if="itemsFor('rail').length === 0"
          class="flex w-full flex-1 items-center justify-center rounded-md border border-dashed border-border p-1 text-center text-3xs leading-tight text-muted"
        >
          <icon-lucide-plus class="me-1 size-3 shrink-0" aria-hidden="true" />
          <span>{{ panels.dockPanel }}</span>
        </span>
        <span
          v-for="id in itemsFor('rail')"
          :key="id"
          :data-dock-entry="id"
          :data-workspace-rail-item="id"
          class="relative flex size-9 shrink-0 items-center justify-center"
          :class="{ 'opacity-50': drag?.moved && drag.id === id }"
          @keydown="onEntryKeydown($event, id, 'rail')"
        >
          <span
            v-if="isWorkspaceDockAction(id)"
            data-dock-drag-host
            class="inline-flex [&_button]:cursor-default"
            @pointerdown="beginItemDrag($event, id)"
          >
            <slot name="action" :id="id" placement="rail" />
          </span>
          <Tip
            v-else
            as-child
            :label="entryFor(id)?.label"
            :side="canvasSide"
            :disabled="drag?.moved === true"
          >
            <button
              type="button"
              v-test-id="legacyTestId(id)"
              :aria-label="labelFor(id)"
              :aria-pressed="railOpen === id ? 'true' : 'false'"
              class="relative flex size-9 cursor-default touch-none select-none items-center justify-center rounded-md text-muted hover:bg-panel-secondary hover:text-surface"
              :class="[focusStyles.ring, railOpen === id ? 'bg-panel-secondary text-surface' : '']"
              @pointerdown="beginItemDrag($event, id)"
              @click="clickPanel(id, 'rail')"
            >
              <component :is="iconById[id]" class="size-4" aria-hidden="true" />
              <span
                v-if="entryFor(id)?.severity"
                aria-hidden="true"
                class="absolute inset-e-1 top-1 size-1.5 rounded-full"
                :class="severityClass(id)"
              />
            </button>
          </Tip>
          <span
            v-if="isWorkspaceDockAction(id) && entryFor(id)?.severity"
            aria-hidden="true"
            class="pointer-events-none absolute inset-e-1 top-1 size-1.5 rounded-full"
            :class="severityClass(id)"
          />
        </span>
      </div>
    </Teleport>

    <Teleport v-if="surface" :to="surface">
      <div
        v-if="drag?.moved && (drag.source.kind === 'area' || drag.hit)"
        data-dock-drag-preview
        aria-hidden="true"
        class="pointer-events-none absolute z-50 flex h-7 max-w-48 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-md border border-border bg-panel px-2 text-2xs font-semibold text-surface opacity-80 shadow-md"
        :style="dragPreviewStyle()"
      >
        <component :is="iconById[drag.id]" class="size-3 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ entryFor(drag.id)?.label ?? drag.id }}</span>
      </div>

      <div
        v-if="drag?.moved && drag.hit?.changesPosition"
        aria-hidden="true"
        class="pointer-events-none absolute z-[60] rounded-full bg-accent shadow-sm"
        :style="dropLineStyle()"
      />

      <section
        v-if="railOpen && railPanel"
        data-dock-rail-flyout
        class="pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-md border border-border bg-panel shadow-lg"
        :style="railFlyoutStyle()"
      >
        <span
          v-for="handle in floatingResizeHandles"
          :key="handle"
          :data-dock-rail-flyout-resize="handle"
          aria-hidden="true"
          class="absolute z-10 touch-none"
          :class="floatingResizeHandleClass(handle)"
          @pointerdown.stop.prevent="beginRailFlyoutResize($event, railOpen, handle)"
        />
        <header class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <button
            type="button"
            data-dock-rail-title
            class="flex min-w-0 flex-1 cursor-default touch-none select-none items-center gap-2 rounded-md text-start text-xs font-semibold text-surface"
            :class="focusStyles.ring"
            @pointerdown="beginItemDrag($event, railOpen)"
          >
            <component
              :is="iconById[railOpen]"
              class="size-3.5 shrink-0 text-muted"
              aria-hidden="true"
            />
            <span class="truncate">{{ railPanel.label }}</span>
          </button>
          <button
            type="button"
            :aria-label="common.close"
            class="relative z-20 flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-secondary hover:text-surface"
            :class="focusStyles.ring"
            @click="railOpen = null"
          >
            <icon-lucide-x class="size-3.5" aria-hidden="true" />
          </button>
        </header>
        <div :id="`${dockInstanceId}-rail-body`" class="min-h-0 flex-1" />
      </section>

      <section
        v-for="entry in floatingEntries"
        :key="entry.id"
        :data-dock-floating="entry.id"
        class="pointer-events-auto absolute flex flex-col overflow-hidden rounded-md border border-border bg-panel shadow-xl"
        :class="{ 'opacity-50': drag?.moved && drag.hit && drag.id === entry.id }"
        :style="floatingStyle(entry)"
        @pointerdown.capture="frontFloating = entry.id"
      >
        <span
          v-for="handle in floatingResizeHandles"
          :key="handle"
          :data-dock-floating-resize="handle"
          aria-hidden="true"
          class="absolute z-10 touch-none"
          :class="floatingResizeHandleClass(handle)"
          @pointerdown.stop.prevent="beginFloatingResize($event, entry.id, handle)"
        />
        <header class="flex h-9 shrink-0 items-center gap-2 border-b border-border px-1">
          <button
            type="button"
            data-dock-floating-title
            v-test-id="legacyTestId(entry.id)"
            :aria-label="labelFor(entry.id)"
            class="flex min-w-0 flex-1 cursor-default touch-none select-none items-center gap-2 rounded-md px-1.5 text-start text-xs font-semibold text-surface"
            :class="focusStyles.ring"
            @pointerdown="beginItemDrag($event, entry.id)"
            @click="
              isWorkspaceDockPanel(entry.id)
                ? clickFloatingPanel(entry.id)
                : raiseFloating(entry.id)
            "
          >
            <component :is="iconById[entry.id]" class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ entryFor(entry.id)?.label ?? entry.id }}</span>
            <span
              v-if="entryFor(entry.id)?.severity"
              aria-hidden="true"
              class="size-1.5 shrink-0 rounded-full"
              :class="severityClass(entry.id)"
            />
          </button>
        </header>

        <div
          v-if="isWorkspaceDockPanel(entry.id)"
          :id="floatingBodyId(entry.id)"
          class="min-h-0 flex-1"
        />
        <div v-else class="flex min-h-0 flex-1 items-center justify-center p-3">
          <slot name="action" :id="entry.id" placement="floating" />
        </div>
      </section>
    </Teleport>

    <template v-for="id in PANEL_IDS" :key="id">
      <Teleport v-if="entryFor(id)" :to="panelTargetSelector(id)" defer>
        <div v-show="slotIsActive(id)" :data-dock-panel="id" class="flex h-full min-h-0 w-full">
          <slot name="panel" :id="id" :active="slotIsActive(id)" />
        </div>
      </Teleport>
    </template>
  </div>
</template>
