<script setup lang="ts">
import { computed, ref } from 'vue'

import type { PrototypeAction } from '@open-pencil/scene-graph/prototype'
import { useI18n } from '@open-pencil/vue/i18n'

import NumberField from '@/components/inputs/NumberField.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'
import type { AppPickerItem } from '@/components/ui/select/AppPicker.vue'

import PrototypePicker from './PrototypePicker.vue'

const { actions, frames, variables } = defineProps<{
  actions: PrototypeAction[]
  frames: AppPickerItem[]
  variables: AppPickerItem[]
}>()
const emit = defineEmits<{ update: [actions: PrototypeAction[]] }>()
const { panels, common } = useI18n()
type Kind = PrototypeAction['type']
const pending = ref<Kind | null>(null)
const labels = computed(
  () =>
    ({
      navigate: panels.value.prototypeNavigate,
      back: panels.value.prototypeBack,
      openOverlay: panels.value.prototypeOpenOverlay,
      swapOverlay: panels.value.prototypeSwapOverlay,
      closeOverlay: panels.value.prototypeCloseOverlay,
      setNumber: panels.value.prototypeSetNumber,
      addNumber: panels.value.prototypeAddNumber,
      ifNumber: panels.value.prototypeIfNumber
    }) satisfies Record<Kind, string>
)
function frameAction(kind: Kind | null) {
  return kind === 'navigate' || kind === 'openOverlay' || kind === 'swapOverlay'
}
const kinds = computed(() =>
  Object.entries(labels.value).map(([value, label]) => ({ value, label }))
)
const operators = [
  { value: 'gt', label: '>' },
  { value: 'eq', label: '=' },
  { value: 'lt', label: '<' }
]
function append(action: PrototypeAction) {
  emit('update', [...actions, action])
  pending.value = null
}
function begin(value: string) {
  if (value === 'back' || value === 'closeOverlay') append({ type: value })
  else if (Object.hasOwn(labels.value, value)) pending.value = value as Kind
}
function choose(id: string) {
  const type = pending.value
  if (type === 'navigate' || type === 'openOverlay' || type === 'swapOverlay')
    append({ type, targetId: id })
  else if (type === 'ifNumber')
    append({ type, variableId: id, operator: 'gt', value: 0, actions: [] })
  else if (type === 'addNumber' || type === 'setNumber')
    append({ type, variableId: id, value: type === 'addNumber' ? 1 : 0 })
}
function replace(index: number, action: PrototypeAction) {
  emit(
    'update',
    actions.map((item, i) => (i === index ? action : item))
  )
}
function move(from: number, to: number) {
  const next = [...actions]
  const [action] = next.splice(from, 1)
  if (!action || to < 0 || to >= actions.length) return
  next.splice(to, 0, action)
  emit('update', next)
}
function updateOperator(
  index: number,
  action: Extract<PrototypeAction, { type: 'ifNumber' }>,
  value: string
) {
  if (value === 'gt' || value === 'eq' || value === 'lt')
    replace(index, { ...action, operator: value })
}
</script>

<template>
  <ol v-if="actions.length" class="grid gap-2">
    <li
      v-for="(action, index) in actions"
      :key="index"
      class="grid min-w-0 gap-1.5 rounded border border-border p-2"
    >
      <div class="flex items-center gap-0.5">
        <span class="me-auto min-w-0">{{ index + 1 }}. {{ labels[action.type] }}</span>
        <IconButton
          :label="panels.prototypeUp"
          :disabled="index === 0"
          @click="move(index, index - 1)"
          ><icon-lucide-arrow-up class="size-3"
        /></IconButton>
        <IconButton
          :label="panels.prototypeDown"
          :disabled="index === actions.length - 1"
          @click="move(index, index + 1)"
          ><icon-lucide-arrow-down class="size-3"
        /></IconButton>
        <IconButton
          :label="panels.prototypeRemove"
          @click="
            emit(
              'update',
              actions.filter((_, i) => i !== index)
            )
          "
          ><icon-lucide-x class="size-3"
        /></IconButton>
      </div>
      <PrototypePicker
        v-if="'targetId' in action"
        :label="panels.prototypeFrame"
        :items="frames"
        :value="action.targetId"
        @choose="replace(index, { ...action, targetId: $event })"
      />
      <template v-if="'variableId' in action">
        <PrototypePicker
          :label="panels.prototypeVariable"
          :items="variables"
          :value="action.variableId"
          @choose="replace(index, { ...action, variableId: $event })"
        />
        <PrototypePicker
          v-if="action.type === 'ifNumber'"
          :label="panels.prototypeCompare"
          :items="operators"
          :value="action.operator"
          @choose="updateOperator(index, action, $event)"
        />
        <NumberField
          :label="panels.prototypeValue"
          :model-value="action.value"
          @commit="replace(index, { ...action, value: $event })"
        />
      </template>
      <div v-if="action.type === 'ifNumber'" class="grid gap-1.5 border-s-2 border-border ps-2">
        <span class="text-muted">{{ panels.prototypeThen }}</span>
        <PrototypeActions
          :actions="action.actions"
          :frames="frames"
          :variables="variables"
          @update="replace(index, { ...action, actions: $event })"
        />
      </div>
    </li>
  </ol>
  <div v-if="pending" class="grid gap-1">
    <div class="flex items-center justify-between">
      <span>{{ labels[pending] }}</span
      ><AppButton size="xs" @click="pending = null">{{ common.cancel }}</AppButton>
    </div>
    <PrototypePicker
      v-if="frameAction(pending)"
      :label="panels.prototypeFrame"
      :items="frames"
      value=""
      @choose="choose"
    />
    <PrototypePicker
      v-else-if="variables.length"
      :label="panels.prototypeVariable"
      :items="variables"
      value=""
      @choose="choose"
    />
    <p v-else class="text-muted">{{ panels.prototypeNeedVariable }}</p>
  </div>
  <PrototypePicker v-else :label="panels.prototypeAdd" :items="kinds" value="" @choose="begin" />
</template>
