<script setup lang="ts">
import { vTestId } from '@open-pencil/vue/testing'

import type { PropertiesTab } from '@/app/ai/chat/panel'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { CloudVersionHistory } from '@/components/cloud/integration'

import CodePanel from './CodePanel.vue'
import CommentsPanel from './comments/CommentsPanel.vue'
import DesignCheckPanel from './design-check/DesignCheckPanel.vue'
import DesignPanel from './DesignPanel.vue'
import PrototypePanel from './prototype/PrototypePanel.vue'

const { view, active } = defineProps<{
  view: PropertiesTab | 'history' | 'comments'
  active: boolean
}>()
</script>

<template>
  <aside
    v-test-id="active ? 'properties-panel' : undefined"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel"
    style="contain: paint layout style"
  >
    <CloudVersionHistory v-if="view === 'history'" />
    <CommentsPanel v-else-if="view === 'comments'" />
    <DesignPanel v-else-if="view === 'design'" />
    <PrototypePanel v-else-if="view === 'prototype'" :active="active" />
    <CodePanel v-else-if="view === 'code'" :active="active" />
    <DesignCheckPanel v-else-if="view === 'lint'" :active="active" />
    <ChatPanel v-else />
  </aside>
</template>
