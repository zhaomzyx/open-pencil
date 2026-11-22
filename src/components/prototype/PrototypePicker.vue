<script setup lang="ts">
import { useI18n } from '@open-pencil/vue/i18n'

import type { AppPickerItem } from '@/components/ui/select/AppPicker.vue'
import AppPickerField from '@/components/ui/select/AppPickerField.vue'

const { label, items, value } = defineProps<{
  label: string
  items: AppPickerItem[]
  value: string
}>()
const emit = defineEmits<{ choose: [value: string] }>()
const { common } = useI18n()
</script>

<template>
  <AppPickerField
    :label="label"
    :placeholder="value || label"
    :model-value="value"
    :items="items"
    :search-placeholder="label"
    :empty-label="common.noResults"
    :close-label="common.close"
    @update:model-value="emit('choose', $event)"
  />
</template>
