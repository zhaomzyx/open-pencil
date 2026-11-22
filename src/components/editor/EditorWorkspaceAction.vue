<script setup lang="ts">
import { computed } from 'vue'

import { formatShortcut } from '@open-pencil/vue/editor/commands'
import { useI18n } from '@open-pencil/vue/i18n'

import { isCloudBinding } from '@/app/cloud/integration'
import { useEditorStore } from '@/app/editor/active-store'
import { appMenuShortcut } from '@/app/shell/menu/shortcut'
import { CloudShareButton } from '@/components/cloud/integration'
import CollabSharePopover from '@/components/collab-panel/CollabSharePopover.vue'
import { provideCollabPanel } from '@/components/collab-panel/context'
import IconButton from '@/components/ui/button/IconButton.vue'
import { useInlineSide } from '@/components/ui/direction/inline-side'
import Tip from '@/components/ui/overlay/Tip.vue'

import { iconById } from './editor-workspace-panel-dock-model'
import type { WorkspaceDockAction } from './EditorWorkspacePanelDock.vue'

const { item, placement, previewing, previewDisabled } = defineProps<{
  item: WorkspaceDockAction
  placement: 'rail' | 'top' | 'bottom' | 'floating'
  previewing: boolean
  previewDisabled: boolean
}>()

const emit = defineEmits<{ openFlow: []; togglePreview: [] }>()
const store = useEditorStore()
const { collaboration, editor, panels } = useI18n()
const canvasSide = useInlineSide('start')
const cloud = computed(() => isCloudBinding(store.getStorageBinding()))
if (item === 'share') provideCollabPanel()
</script>

<template>
  <template v-if="item === 'share'">
    <Tip v-if="cloud" :label="collaboration.share" :side="canvasSide" as-child>
      <CloudShareButton :aria-label="collaboration.share" data-icon-only />
    </Tip>
    <CollabSharePopover v-else />
  </template>
  <IconButton
    v-else-if="item === 'flow'"
    :label="panels.prototypeViewFlow"
    :side="canvasSide"
    data-test-id="prototype-open-flow"
    :size="placement === 'top' || placement === 'bottom' ? 'sm' : 'md'"
    @click="emit('openFlow')"
  >
    <component :is="iconById.flow" class="size-4" />
  </IconButton>
  <IconButton
    v-else
    :label="
      editor.startPreview({ shortcut: formatShortcut(appMenuShortcut('toggle-preview')) ?? '' })
    "
    :side="canvasSide"
    data-test-id="editor-start-preview"
    :size="placement === 'top' || placement === 'bottom' ? 'sm' : 'md'"
    :disabled="previewDisabled"
    :class="previewDisabled ? 'pointer-events-none' : ''"
    toggle
    :active="previewing"
    @click="emit('togglePreview')"
  >
    <icon-lucide-play class="size-4" />
  </IconButton>
</template>
