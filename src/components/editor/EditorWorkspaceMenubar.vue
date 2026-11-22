<script setup lang="ts">
import AppMenu from '@/components/shell/AppMenu.vue'

const { showEditorControls } = defineProps<{ showEditorControls: boolean }>()
</script>

<template>
  <AppMenu class="[&>div:empty]:hidden" :show-editor-controls="showEditorControls" />
</template>
