<script setup lang="ts">
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarItemIndicator,
  MenubarMenu,
  MenubarPortal,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from 'reka-ui'
import { shallowRef, useTemplateRef } from 'vue'
import IconChevronRight from '~icons/lucide/chevron-right'

import type { MenuEntry } from '@open-pencil/vue/editor/menu-model'
import { useI18n } from '@open-pencil/vue/i18n'
import { vTestId } from '@open-pencil/vue/testing'

import { useEditorStore } from '@/app/editor/active-store'
import { openSettingsDialog } from '@/app/settings/dialog'
import { useAppMenu } from '@/app/shell/menu/app-menu'
import {
  hasMenuSubItems,
  isMenuCheckbox,
  isMenuSeparator,
  menuChecked,
  menuDisabled,
  menuLabel,
  menuShortcut,
  menuSubItems,
  runMenuAction,
  updateMenuChecked
} from '@/app/shell/menu/entry'
import { appMenuShortcutLabel } from '@/app/shell/menu/shortcut'
import { animationsEnabled } from '@/app/shell/motion'
import { resolvedAppTheme } from '@/app/shell/theme'
import BrandMark from '@/components/brand/BrandMark.vue'
import { CloudDocumentStatusHost, CloudReportButton } from '@/components/cloud/integration'
import CollabPanel from '@/components/collab-panel/CollabPanel.vue'
import IconButton from '@/components/ui/button/IconButton.vue'
import { useScrollOverflow } from '@/components/ui/list/useScrollOverflow'
import AppMenubarRoot from '@/components/ui/menu/AppMenubarRoot.vue'
import AppShortcutText from '@/components/ui/menu/AppShortcutText.vue'
import { useMenuUI } from '@/components/ui/menu/menu'
import MenuScrollArea from '@/components/ui/menu/MenuScrollArea.vue'
import { IS_TAURI } from '@/constants'

const { showEditorControls } = defineProps<{ showEditorControls: boolean }>()
const store = useEditorStore()

const { locale, menu: t, settings } = useI18n()

const { topMenus } = useAppMenu()
const menuCls = useMenuUI()
const mainMenuCls = useMenuUI({ content: 'min-w-52' })
const subMenuCls = useMenuUI({ content: 'min-w-44' })

// A narrow window clips the menubar; fade the clipped side and offer a chevron so it reads as scrollable.
const menubar = useTemplateRef<HTMLElement>('menubar')
const { overflowStart, overflowEnd, scrollTowardHidden } = useScrollOverflow(menubar, {
  smooth: animationsEnabled
})

/**
 * A chosen command runs once its menu has closed and returned focus to its button, as a native
 * menu's does; run sooner, a popover it opens, such as Insert Icon's picker, would take that
 * returning focus as focus outside and close.
 */
const chosen = shallowRef<MenuEntry | null>(null)

function chooseMenuAction(entry: MenuEntry) {
  chosen.value = entry
}

function runChosenAction() {
  const entry = chosen.value
  chosen.value = null
  if (entry) runMenuAction(entry)
}
</script>

<template>
  <header
    data-test-id="editor-workspace-menubar"
    class="flex min-w-0 shrink-0 items-center gap-2 border-b border-border bg-panel px-2 py-1"
  >
    <div class="flex shrink-0 items-center gap-1.5">
      <BrandMark
        data-test-id="app-logo"
        variant="app-icon"
        :appearance="resolvedAppTheme"
        class="size-6"
      />
      <span class="text-xs font-semibold whitespace-nowrap text-surface">
        {{ locale === 'zh-CN' ? '白盒工作台' : 'OpenPencil' }}
      </span>
    </div>
    <div v-if="showEditorControls && !IS_TAURI" class="flex min-w-0 items-center">
      <div
        ref="menubar"
        class="scrollbar-none min-w-0 flex-1 overflow-x-auto ltr:data-overflow-end:mask-r-from-[calc(100%-2rem)] ltr:data-overflow-start:mask-l-from-[calc(100%-2rem)] rtl:data-overflow-end:mask-l-from-[calc(100%-2rem)] rtl:data-overflow-start:mask-r-from-[calc(100%-2rem)]"
        :data-overflow-start="overflowStart || undefined"
        :data-overflow-end="overflowEnd || undefined"
      >
        <AppMenubarRoot class="flex w-max items-center gap-0.5">
          <MenubarMenu v-for="menu in topMenus" :key="menu.label">
            <MenubarTrigger
              v-test-id="`menubar-${menu.label.toLowerCase()}`"
              class="flex cursor-pointer items-center rounded px-2 py-1 text-2xs text-surface/80 transition-colors select-none hover:bg-hover hover:text-surface data-[state=open]:bg-hover data-[state=open]:text-surface"
            >
              {{ menu.label }}
            </MenubarTrigger>

            <MenubarPortal>
              <MenubarContent
                :side-offset="4"
                align="start"
                :class="mainMenuCls.content"
                @close-auto-focus="runChosenAction"
              >
                <MenuScrollArea>
                  <template v-for="(item, i) in menu.items" :key="i">
                    <MenubarSeparator v-if="isMenuSeparator(item)" :class="menuCls.separator" />
                    <MenubarSub v-else-if="hasMenuSubItems(item)">
                      <MenubarSubTrigger :class="menuCls.item" :disabled="menuDisabled(item)">
                        <span class="flex-1">{{ menuLabel(item) }}</span>
                        <IconChevronRight data-direction="reading" class="size-3 text-muted" />
                      </MenubarSubTrigger>
                      <MenubarPortal>
                        <MenubarSubContent :side-offset="4" :class="subMenuCls.content">
                          <MenuScrollArea>
                            <template v-for="(sub, j) in menuSubItems(item)" :key="j">
                              <MenubarSeparator
                                v-if="isMenuSeparator(sub)"
                                :class="menuCls.separator"
                              />
                              <MenubarCheckboxItem
                                v-else-if="isMenuCheckbox(sub)"
                                :model-value="menuChecked(sub)"
                                :class="menuCls.item"
                                @update:model-value="updateMenuChecked(sub, $event === true)"
                              >
                                <span class="flex-1">{{ menuLabel(sub) }}</span>
                                <MenubarItemIndicator class="text-surface">
                                  <icon-lucide-check class="size-3.5" />
                                </MenubarItemIndicator>
                              </MenubarCheckboxItem>
                              <MenubarItem
                                v-else
                                :class="menuCls.item"
                                :disabled="menuDisabled(sub)"
                                @select="chooseMenuAction(sub)"
                              >
                                <span class="flex-1">{{ menuLabel(sub) }}</span>
                                <AppShortcutText v-if="menuShortcut(sub)">{{
                                  menuShortcut(sub)
                                }}</AppShortcutText>
                              </MenubarItem>
                            </template>
                          </MenuScrollArea>
                        </MenubarSubContent>
                      </MenubarPortal>
                    </MenubarSub>
                    <MenubarCheckboxItem
                      v-else-if="isMenuCheckbox(item)"
                      :model-value="menuChecked(item)"
                      :class="menuCls.item"
                      @update:model-value="updateMenuChecked(item, $event === true)"
                    >
                      <span class="flex-1">{{ menuLabel(item) }}</span>
                      <MenubarItemIndicator class="text-surface">
                        <icon-lucide-check class="size-3.5" />
                      </MenubarItemIndicator>
                    </MenubarCheckboxItem>
                    <MenubarItem
                      v-else
                      :class="menuCls.item"
                      :disabled="menuDisabled(item)"
                      @select="chooseMenuAction(item)"
                    >
                      <span class="flex-1">{{ menuLabel(item) }}</span>
                      <AppShortcutText v-if="menuShortcut(item)">{{
                        menuShortcut(item)
                      }}</AppShortcutText>
                    </MenubarItem>
                  </template>
                </MenuScrollArea>
              </MenubarContent>
            </MenubarPortal>
          </MenubarMenu>
        </AppMenubarRoot>
      </div>
      <!-- Sits beside the hidden menus; it keeps its width when it switches sides, so the bar's overflow never flips back.
           Pointer affordance only: arrow keys already move through the menus and scroll them into view. -->
      <button
        v-if="overflowStart || overflowEnd"
        type="button"
        tabindex="-1"
        aria-hidden="true"
        data-test-id="app-menubar-scroll"
        class="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-hover hover:text-surface data-start:order-first"
        :data-start="!overflowEnd || undefined"
        @click="scrollTowardHidden"
      >
        <icon-lucide-chevron-right data-direction="reading" v-if="overflowEnd" class="size-3.5" />
        <icon-lucide-chevron-left data-direction="reading" v-else class="size-3.5" />
      </button>
    </div>
    <div v-if="showEditorControls" class="flex shrink-0 items-center border-s border-border ps-2">
      <slot />
    </div>
    <div class="ms-auto flex shrink-0 items-center gap-0.5">
      <CloudDocumentStatusHost v-if="showEditorControls" />
      <CloudReportButton v-if="showEditorControls" />
      <CollabPanel class="me-1" />
      <IconButton
        :label="settings.title"
        data-test-id="app-settings-trigger"
        @click="openSettingsDialog()"
      >
        <icon-lucide-settings class="size-3.5" />
      </IconButton>
      <IconButton
        v-if="showEditorControls"
        :label="`${t.toggleUI} (${appMenuShortcutLabel('toggle-ui')})`"
        data-test-id="app-toggle-ui"
        @click="store.state.showUI = !store.state.showUI"
      >
        <icon-lucide-sidebar class="size-3.5" />
      </IconButton>
    </div>
  </header>
</template>
