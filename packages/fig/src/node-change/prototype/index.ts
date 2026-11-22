import type { NodeChange } from '@open-pencil/kiwi/fig/codec'
import { guidToString } from '@open-pencil/kiwi/fig/guid'
import type { PluginDataEntry, SceneNode } from '@open-pencil/scene-graph'
import {
  OPEN_PENCIL_PLUGIN_DATA,
  readPluginData,
  withPluginData
} from '@open-pencil/scene-graph/plugin-data'
import type { GUID } from '@open-pencil/scene-graph/primitives'
import {
  mapPrototypeReferences,
  readPrototype,
  type PrototypeSpec
} from '@open-pencil/scene-graph/prototype'

import { writeAction } from './action'
import { clickActions, replaceClickActions } from './interactions'

const field = OPEN_PENCIL_PLUGIN_DATA.prototype

export function importedPrototype(nc: NodeChange, entries: PluginDataEntry[]): PluginDataEntry[] {
  const actions = clickActions(nc.prototypeInteractions ?? [])
  if (!actions.length && !nc.prototypeStartingPoint) return entries
  const stored = readPluginData(entries, field)
  return withPluginData(entries, field, {
    ...(actions.length > 0 && { actions }),
    ...stored,
    ...(nc.prototypeStartingPoint && { start: true })
  })
}

/** Only values Kiwi cannot express need a plugin-data copy. Native edits then win on reopen. */
export function serializePrototype(
  node: SceneNode,
  nc: NodeChange,
  layer: (id: string) => GUID | undefined,
  variable: (id: string) => GUID | undefined,
  nextId: () => GUID
): void {
  const local = readPrototype(node)
  if (!Object.keys(local).length && !nc.prototypeInteractions && !nc.prototypeStartingPoint) return
  const fileId = (guid: GUID | undefined, fallback: string) =>
    guid ? guidToString(guid) : fallback
  const spec = mapPrototypeReferences(
    local,
    (id) => fileId(layer(id), id),
    (id) => fileId(variable(id), id)
  )
  if (spec.start) nc.prototypeStartingPoint ??= { name: node.name }
  else delete nc.prototypeStartingPoint
  const actions = spec.actions ?? []
  const reactions = replaceClickActions(nc.prototypeInteractions ?? [], actions, (entries) => ({
    id: nextId(),
    event: { interactionType: 'ON_CLICK' },
    actions: entries,
    isDeleted: false,
    stateManagementVersion: 1
  }))
  if (reactions.length) nc.prototypeInteractions = reactions
  else delete nc.prototypeInteractions
  const stored: PrototypeSpec = {}
  if (spec.textVariableId) stored.textVariableId = spec.textVariableId
  if (actions.some((action) => !writeAction(action))) stored.actions = actions
  node.pluginData = withPluginData(
    node.pluginData,
    field,
    Object.keys(stored).length ? stored : undefined
  )
}
