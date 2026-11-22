<script setup lang="ts">
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import {
  ToolbarButton,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from 'reka-ui'
import { tv } from 'tailwind-variants'
import { computed, onBeforeUnmount, ref } from 'vue'
import IconChevronDown from '~icons/lucide/chevron-down'

import type { EditorToolDef, Tool } from '@open-pencil/core'
import { useI18n } from '@open-pencil/vue/i18n'
import { isToolbarToolActive, toolbarPopupSide } from '@open-pencil/vue/primitives/Toolbar'
import type { ToolbarAlign, ToolbarSide } from '@open-pencil/vue/primitives/Toolbar'
import {
  toolbarFlyoutItemTestId,
  toolbarFlyoutTestId,
  toolbarToolTestId,
  vTestId
} from '@open-pencil/vue/testing'

import { toolTip } from '@/app/editor/toolbar/shortcuts'
import ToolButton from '@/components/toolbar/ToolButton.vue'
import type { ToolbarUI, ToolIconMap, ToolLabels } from '@/components/toolbar/types'
import AppDropdownMenuRoot from '@/components/ui/menu/AppDropdownMenuRoot.vue'
import AppShortcutText from '@/components/ui/menu/AppShortcutText.vue'
import { menu } from '@/components/ui/menu/menu'
import MenuScrollArea from '@/components/ui/menu/MenuScrollArea.vue'
import toolbarTheme from '@/theme/toolbar'

const {
  tool,
  activeTool,
  selectedTool,
  toolIcons,
  toolLabels,
  toolShortcuts,
  side = 'bottom',
  align = 'start',
  inRail = false,
  ui,
  mobile = false
} = defineProps<{
  tool: EditorToolDef
  activeTool: Tool
  selectedTool: Tool
  toolIcons: ToolIconMap
  toolLabels: ToolLabels
  toolShortcuts: Readonly<Record<Tool, string>>
  /** The canvas edge the toolbar is docked to; the menu opens away from it. */
  side?: ToolbarSide
  /** Where along its edge the toolbar sits. */
  align?: ToolbarAlign
  inRail?: boolean
  ui?: ToolbarUI
  mobile?: boolean
}>()

const toolbar = tv(toolbarTheme)
const { editor } = useI18n()
const triggerActive = computed(() => isToolbarToolActive(tool, activeTool))
const styles = computed(() => toolbar({ active: triggerActive.value, mobile, side, inRail }))
const popupSide = computed(() => toolbarPopupSide(side))
/** A toolbar at the far end of its edge opens menus back toward the canvas. */
const menuAlign = computed(() => (align === 'end' ? 'end' : 'start'))
const menuOpen = ref(false)

const emit = defineEmits<{
  select: [tool: Tool]
}>()

defineSlots<{
  default(props: { label: string }): unknown
}>()

function flyoutItemClass() {
  return menu({ justify: 'start' }).item({
    class: toolbar().flyoutItem({ class: ui?.flyoutItem })
  })
}

const LONG_PRESS_DELAY_MS = 400
const LONG_PRESS_MOVE_TOLERANCE = 6

let pressedPointerId: number | null = null
let pressStart = { x: 0, y: 0 }
let pressCancelled = false
let longPressTriggered = false
let suppressClick = false
let suppressionTimer: ReturnType<typeof setTimeout> | undefined

const { start: scheduleLongPress, stop: cancelLongPress } = useTimeoutFn(
  () => {
    longPressTriggered = true
    menuOpen.value = true
  },
  LONG_PRESS_DELAY_MS,
  { immediate: false }
)

function clearClickSuppression() {
  suppressClick = false
  if (suppressionTimer !== undefined) {
    clearTimeout(suppressionTimer)
    suppressionTimer = undefined
  }
}

function suppressNextClick() {
  clearClickSuppression()
  suppressClick = true
  suppressionTimer = setTimeout(clearClickSuppression, 0)
}

function resetPress() {
  cancelLongPress()
  pressedPointerId = null
  pressCancelled = false
  longPressTriggered = false
}

function onFlyoutPointerDown(event: PointerEvent) {
  if (!inRail || event.button !== 0 || !event.isPrimary) return

  clearClickSuppression()
  cancelLongPress()
  pressedPointerId = event.pointerId
  pressStart = { x: event.clientX, y: event.clientY }
  pressCancelled = false
  longPressTriggered = false
  scheduleLongPress()
}

function onFlyoutPointerLeave() {
  if (pressedPointerId === null || longPressTriggered) return
  pressCancelled = true
  cancelLongPress()
}

function onWindowPointerMove(event: PointerEvent) {
  if (event.pointerId !== pressedPointerId || longPressTriggered) return
  if (
    Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) >
    LONG_PRESS_MOVE_TOLERANCE
  ) {
    pressCancelled = true
    cancelLongPress()
  }
}

function onWindowPointerUp(event: PointerEvent) {
  if (event.pointerId !== pressedPointerId) return

  const shouldSuppressClick = pressCancelled || longPressTriggered
  resetPress()
  if (shouldSuppressClick) suppressNextClick()
}

function onWindowPointerCancel(event: PointerEvent) {
  if (event.pointerId === pressedPointerId) resetPress()
}

function onWindowBlur() {
  clearClickSuppression()
  resetPress()
}

function onFlyoutClickCapture(event: MouseEvent) {
  if (suppressClick) {
    if (event.detail === 0) {
      clearClickSuppression()
      return
    }

    clearClickSuppression()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (
    // The rail triangle advertises the flyout; a pointer click still picks the current tool.
    !inRail ||
    event.detail === 0 ||
    !(event.target instanceof Element) ||
    !event.target.closest('[data-tool-flyout-trigger]')
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  emit('select', selectedTool)
}

function onFlyoutContextMenu(event: MouseEvent) {
  if (!inRail) return
  event.preventDefault()
  event.stopPropagation()
  menuOpen.value = true
}

useEventListener(window, 'pointermove', onWindowPointerMove)
useEventListener(window, 'pointerup', onWindowPointerUp)
useEventListener(window, 'pointercancel', onWindowPointerCancel)
useEventListener(window, 'blur', onWindowBlur)
onBeforeUnmount(clearClickSuppression)
</script>

<template>
  <div
    :class="styles.flyoutGroup({ class: ui?.flyoutGroup })"
    @pointerdown="onFlyoutPointerDown"
    @pointerleave="onFlyoutPointerLeave"
    @click.capture="onFlyoutClickCapture"
    @contextmenu="onFlyoutContextMenu"
  >
    <div class="flex">
      <slot :label="toolTip(toolLabels[selectedTool], toolShortcuts[selectedTool])">
        <ToolButton
          :data-test-id="toolbarToolTestId(selectedTool, mobile)"
          :icon="toolIcons[selectedTool]"
          :label="toolLabels[selectedTool]"
          :active="triggerActive"
          :mobile="mobile"
          :ui="ui"
          @click="emit('select', selectedTool)"
        />
      </slot>
    </div>

    <AppDropdownMenuRoot v-model:open="menuOpen">
      <DropdownMenuTrigger as-child>
        <ToolbarButton
          v-test-id="toolbarFlyoutTestId(tool.key, mobile)"
          data-tool-flyout-trigger
          :data-mobile="mobile || undefined"
          :aria-label="editor.toolOptions({ tool: toolLabels[tool.key] })"
          :class="styles.flyoutTrigger({ class: ui?.flyoutTrigger })"
        >
          <span
            v-if="inRail"
            aria-hidden="true"
            :class="styles.flyoutTriggerIcon({ class: ui?.flyoutTriggerIcon })"
          />
          <IconChevronDown
            v-else
            :class="styles.flyoutTriggerIcon({ class: ui?.flyoutTriggerIcon })"
          />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent
          :side="popupSide"
          :side-offset="8"
          :align="menuAlign"
          :side-flip="!inRail"
          :align-flip="!inRail"
          :class="styles.flyoutContent({ class: ui?.flyoutContent })"
        >
          <MenuScrollArea>
            <DropdownMenuRadioGroup :model-value="selectedTool">
              <DropdownMenuRadioItem
                v-for="sub in tool.flyout"
                :key="sub"
                v-test-id="toolbarFlyoutItemTestId(sub, mobile)"
                :value="sub"
                :data-active="sub === selectedTool || undefined"
                :class="flyoutItemClass()"
                @select="emit('select', sub)"
              >
                <span
                  data-slot="flyout-item-indicator"
                  :class="styles.flyoutItemIndicator({ class: ui?.flyoutItemIndicator })"
                  aria-hidden="true"
                >
                  <DropdownMenuItemIndicator>
                    <icon-lucide-check class="size-3.5" />
                  </DropdownMenuItemIndicator>
                </span>
                <component
                  :is="toolIcons[sub]"
                  :class="styles.flyoutItemIcon({ class: ui?.flyoutItemIcon })"
                />
                <span :class="styles.flyoutItemLabel({ class: ui?.flyoutItemLabel })">
                  {{ toolLabels[sub] }}
                </span>
                <AppShortcutText v-if="!mobile && toolShortcuts[sub]">
                  {{ toolShortcuts[sub] }}
                </AppShortcutText>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </MenuScrollArea>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </AppDropdownMenuRoot>
  </div>
</template>
