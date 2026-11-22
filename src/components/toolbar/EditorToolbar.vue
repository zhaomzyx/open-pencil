<script setup lang="ts">
import { computed } from 'vue'

import { useViewportKind } from '@open-pencil/vue/editor/viewport-kind'
import { ToolbarRoot } from '@open-pencil/vue/primitives/Toolbar'

import { useEditorStore } from '@/app/editor/active-store'
import { useToolbarCanvasRoom, type ToolbarDock } from '@/app/editor/toolbar/dock'
import { appPreferences, updateToolbarDock } from '@/app/settings/preferences/store'
import { toolIcons } from '@/components/icons'
import { useToolbarContents } from '@/components/toolbar/contents'
import DesktopToolbar from '@/components/toolbar/DesktopToolbar.vue'
import MobileToolbar from '@/components/toolbar/MobileToolbar.vue'
import ToolbarAction from '@/components/toolbar/ToolbarAction.vue'
import ToolbarContextMenu from '@/components/toolbar/ToolbarContextMenu.vue'
import { useInlineSide } from '@/components/ui/direction/inline-side'
import { useMenuUI } from '@/components/ui/menu/menu'

/** A phone's toolbar sits along the bottom, wherever the desktop one is docked. */
const PHONE_DOCK: Readonly<ToolbarDock> = { side: 'bottom', align: 'center' }

const { inRail = false } = defineProps<{
  /** Use an in-flow column at the canvas's inline start on desktop. */
  inRail?: boolean
}>()

const store = useEditorStore()
const { isMobile } = useViewportKind()
const railSide = useInlineSide('start')
const showRail = computed(() => inRail && !isMobile.value)
const desktopDock = computed<ToolbarDock>(() =>
  showRail.value ? { side: railSide.value, align: 'start' } : appPreferences.value.toolbarDock
)
const { toolLabels, toolShortcuts, items, tools, actions, hiddenActions, customizable } =
  useToolbarContents(store)

useToolbarCanvasRoom(store, () => {
  if (showRail.value) return null
  return isMobile.value ? PHONE_DOCK : desktopDock.value
})

const flyoutMenuCls = useMenuUI({ content: 'min-w-32' })
const toolbarUI = { flyoutContent: flyoutMenuCls.content }
</script>

<template>
  <ToolbarRoot
    v-slot="{ activeTool, flyoutSelections, actions: toolbar }"
    :tools="tools"
    :side="desktopDock.side"
    :align="desktopDock.align"
    @update:side="updateToolbarDock({ side: $event })"
    @update:align="updateToolbarDock({ align: $event })"
  >
    <ToolbarContextMenu :disabled="!customizable" :dockable="!isMobile && !showRail">
      <DesktopToolbar
        v-if="!isMobile"
        :items="items"
        :active-tool="activeTool"
        :flyout-selections="flyoutSelections"
        :tool-icons="toolIcons"
        :tool-labels="toolLabels"
        :tool-shortcuts="toolShortcuts"
        :side="desktopDock.side"
        :align="desktopDock.align"
        :in-rail="showRail"
        :ui="toolbarUI"
        @set-tool="toolbar.setTool"
      >
        <template #action="{ action, side, align }">
          <ToolbarAction :action="action" :side="side" :align="align" :ui="toolbarUI" />
        </template>
        <template #hidden="{ side, align }">
          <ToolbarAction
            v-for="action in hiddenActions"
            :key="action"
            :action="action"
            anchored
            :side="side"
            :align="align"
          />
        </template>
      </DesktopToolbar>

      <MobileToolbar
        v-else
        :tools="tools"
        :active-tool="activeTool"
        :flyout-selections="flyoutSelections"
        :tool-icons="toolIcons"
        :tool-labels="toolLabels"
        :tool-shortcuts="toolShortcuts"
        :ui="toolbarUI"
        @set-tool="toolbar.setTool"
      >
        <template #end>
          <ToolbarAction
            v-for="action in actions"
            :key="action"
            :action="action"
            mobile
            :ui="toolbarUI"
          />
          <ToolbarAction v-for="action in hiddenActions" :key="action" :action="action" anchored />
        </template>
      </MobileToolbar>
    </ToolbarContextMenu>
  </ToolbarRoot>
</template>
