<script lang="ts">
export type LayersPanelView = 'pages' | 'layers' | 'assets'
</script>

<script setup lang="ts">
import { vTestId } from '@open-pencil/vue/testing'

import AssetsPanel from './assets-panel/AssetsPanel.vue'
import LayerTree from './LayerTree/LayerTree.vue'
import PagesPanel from './PagesPanel.vue'

const { view, active } = defineProps<{ view: LayersPanelView; active: boolean }>()
</script>

<template>
  <aside
    v-test-id="active ? 'layers-panel' : undefined"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel"
    style="contain: paint layout style"
  >
    <PagesPanel v-if="view === 'pages'" embedded />
    <LayerTree v-else-if="view === 'layers'" data-test-id="layers-tree" />
    <AssetsPanel v-else />
  </aside>
</template>
