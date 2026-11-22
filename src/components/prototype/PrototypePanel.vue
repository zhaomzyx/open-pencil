<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

import { getNodeEditCapability } from '@open-pencil/core'
import {
  prototypeTarget,
  readPrototype,
  type PrototypeAction
} from '@open-pencil/scene-graph/prototype'
import { useSelectionState } from '@open-pencil/vue/editor/selection-state'
import { useI18n } from '@open-pencil/vue/i18n'
import { useSceneComputed } from '@open-pencil/vue/internal/scene-computed'

import { useEditorStore } from '@/app/editor/active-store'
import AppPlaceholder from '@/components/ui/feedback/AppPlaceholder.vue'
import PanelHeader from '@/components/ui/panel/PanelHeader.vue'

import PrototypeActions from './PrototypeActions.vue'
import PrototypeInternalActions from './PrototypeInternalActions.vue'
import PrototypePicker from './PrototypePicker.vue'

interface PrototypeInternalSource {
  nodeId: string
  nodeName: string
  actions: PrototypeAction[]
}

interface PrototypeInternalInteraction {
  nodeId: string
  nodeName: string
  actions: Array<{ key: string; text: string; depth: number }>
}

const { active } = defineProps<{ active: boolean }>()
const store = useEditorStore()
const { panels } = useI18n()
const { selectedNode, selectedCount } = useSelectionState()
const node = useSceneComputed(() => {
  const layer = selectedNode.value
  return selectedCount.value === 1 &&
    layer &&
    !layer.internalOnly &&
    store.graph.closest(
      layer.id,
      (ancestor) => !!prototypeTarget(store.graph, store.state.currentPageId, ancestor.id)
    )
    ? layer
    : null
})
const spec = useSceneComputed(() => (node.value ? readPrototype(node.value) : {}))
const editable = useSceneComputed(
  () =>
    !!node.value &&
    !store.graph.closest(node.value.id, (layer) => layer.locked) &&
    getNodeEditCapability(store.graph, node.value.id).editable
)
const frames = useSceneComputed(() =>
  store.graph
    .getChildren(store.state.currentPageId)
    .filter((layer) => prototypeTarget(store.graph, store.state.currentPageId, layer.id))
    .map((layer) => ({ value: layer.id, label: layer.name }))
)
const isTopLevelFrame = computed(() => frames.value.some((frame) => frame.value === node.value?.id))
const variables = useSceneComputed(() =>
  store
    .getVariablesByType('FLOAT')
    .map((variable) => ({ value: variable.id, label: variable.name }))
)
const internalSources = useSceneComputed<PrototypeInternalSource[]>(() => {
  if (!node.value) return []

  return store.graph.flattenTree(node.value.id).flatMap(({ node: layer }) => {
    if (layer.internalOnly) return []
    const actions = readPrototype(layer).actions ?? []
    return actions.length ? [{ nodeId: layer.id, nodeName: layer.name, actions }] : []
  })
})
const actionLabels = computed<Record<PrototypeAction['type'], string>>(() => ({
  navigate: panels.value.prototypeNavigate,
  back: panels.value.prototypeBack,
  openOverlay: panels.value.prototypeOpenOverlay,
  swapOverlay: panels.value.prototypeSwapOverlay,
  closeOverlay: panels.value.prototypeCloseOverlay,
  setNumber: panels.value.prototypeSetNumber,
  addNumber: panels.value.prototypeAddNumber,
  ifNumber: panels.value.prototypeIfNumber
}))
const operatorLabels = {
  gt: '>',
  eq: '=',
  lt: '<'
} as const
function actionWithDetail(action: PrototypeAction, detail: string) {
  return panels.value.prototypeInternalAction({
    action: actionLabels.value[action.type],
    detail
  })
}
function targetName(targetId: string) {
  return store.graph.getNode(targetId)?.name ?? targetId
}
function variableName(variableId: string) {
  return store.graph.variables.get(variableId)?.name ?? variableId
}
function summarizeAction(action: PrototypeAction): string {
  switch (action.type) {
    case 'navigate':
    case 'openOverlay':
    case 'swapOverlay':
      return actionWithDetail(action, targetName(action.targetId))
    case 'setNumber':
      return actionWithDetail(
        action,
        `${variableName(action.variableId)} = ${String(action.value)}`
      )
    case 'addNumber':
      return actionWithDetail(
        action,
        `${variableName(action.variableId)} ${action.value < 0 ? '−' : '+'} ${String(
          Math.abs(action.value)
        )}`
      )
    case 'ifNumber':
      return actionWithDetail(
        action,
        `${variableName(action.variableId)} ${operatorLabels[action.operator]} ${String(
          action.value
        )}`
      )
    case 'back':
    case 'closeOverlay':
      return actionLabels.value[action.type]
  }
}
function summarizeActions(
  actions: PrototypeAction[],
  depth = 0,
  path: number[] = []
): PrototypeInternalInteraction['actions'] {
  return actions.flatMap((action, index) => {
    const nextPath = [...path, index]
    const actionText = summarizeAction(action)
    const row = {
      key: nextPath.join('.'),
      depth,
      text:
        depth === 0
          ? actionText
          : panels.value.prototypeInternalRow({
              trigger: panels.value.prototypeThen,
              action: actionText
            })
    }
    return action.type === 'ifNumber'
      ? [row, ...summarizeActions(action.actions, depth + 1, nextPath)]
      : [row]
  })
}
const internalInteractions = computed<PrototypeInternalInteraction[]>(() =>
  internalSources.value.map((source) => ({
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    actions: summarizeActions(source.actions)
  }))
)
const textChoices = computed(() => [{ value: '', label: panels.value.none }, ...variables.value])
const start = computed({
  get: () => !!spec.value.start,
  set: (enabled: boolean) => {
    if (node.value) store.setPrototypeStart(node.value.id, enabled)
  }
})
let sourceHover: { nodeId: string; paneId: string } | null = null
function clearSourceHover() {
  const hovered = sourceHover
  sourceHover = null
  if (!hovered) return
  const pane = store.getPaneView(hovered.paneId)
  if (pane?.hoveredNodeId !== hovered.nodeId) return
  if (hovered.paneId === store.activePaneId.value) store.setHoveredNode(null)
  else {
    pane.hoveredNodeId = null
    store.requestRepaint()
  }
}

function hoverSource(nodeId: string, on: boolean) {
  if (!on) {
    if (sourceHover?.nodeId === nodeId) clearSourceHover()
    return
  }
  if (!active || store.graph.closest(nodeId, (layer) => !layer.visible || layer.internalOnly))
    return
  clearSourceHover()
  sourceHover = { nodeId, paneId: store.activePaneId.value }
  store.setHoveredNode(nodeId)
}

watch([() => active, () => node.value?.id, store.activePaneId], clearSourceHover)
onBeforeUnmount(clearSourceHover)

function selectSource(nodeId: string) {
  clearSourceHover()
  store.select([nodeId])
  store.revealNodes([nodeId])
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto" data-test-id="prototype-panel">
    <AppPlaceholder v-if="!node" :label="panels.prototypeSelect" size="compact" />
    <template v-else>
      <PanelHeader>{{ node.name }}</PanelHeader>
      <fieldset :disabled="!editable" class="grid min-w-0 gap-3 px-3 py-3 text-xs">
        <label v-if="isTopLevelFrame" class="flex items-center gap-2">
          <input v-model="start" type="checkbox" class="accent-accent" />{{ panels.prototypeStart }}
        </label>
        <div v-if="node.type === 'TEXT'" class="grid gap-1">
          <span class="text-muted">{{ panels.prototypeText }}</span>
          <PrototypePicker
            :label="panels.prototypeText"
            :items="textChoices"
            :value="spec.textVariableId ?? ''"
            @choose="store.bindPrototypeText(node.id, $event || null)"
          />
        </div>
        <section class="grid gap-2" :aria-label="panels.prototypeClick">
          <h3 class="font-medium">{{ panels.prototypeClick }}</h3>
          <PrototypeActions
            :key="node.id"
            :actions="spec.actions ?? []"
            :frames="frames"
            :variables="variables"
            @update="store.setPrototypeActions(node.id, $event)"
          />
        </section>
      </fieldset>
      <PrototypeInternalActions
        v-if="isTopLevelFrame || internalInteractions.length > 0"
        :interactions="internalInteractions"
        @hover="hoverSource"
        @select="selectSource"
      />
    </template>
  </div>
</template>
