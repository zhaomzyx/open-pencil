import type { SceneGraph } from '../graph'
import { OPEN_PENCIL_PLUGIN_DATA, readPluginData, withPluginData } from '../plugin-data'
import type { SceneNode } from '../types'
import type { PrototypeSpec } from './schema'

export type { PrototypeAction, PrototypeSpec } from './schema'

export function readPrototype(node: SceneNode): PrototypeSpec {
  return readPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.prototype) ?? {}
}

/** Replace the layer's entire prototype definition, keeping other plugin content. */
export function prototypePatch(node: SceneNode, spec: PrototypeSpec): Partial<SceneNode> {
  const stored = Object.keys(spec).length ? spec : undefined
  return { pluginData: withPluginData(node.pluginData, OPEN_PENCIL_PLUGIN_DATA.prototype, stored) }
}

export function prototypeTarget(
  graph: Pick<SceneGraph, 'getNode'>,
  pageId: string,
  targetId: string
): SceneNode | undefined {
  const node = graph.getNode(targetId)
  return node?.type === 'FRAME' &&
    node.parentId === pageId &&
    graph.getNode(pageId)?.type === 'CANVAS'
    ? node
    : undefined
}

export function isPrototypeNumber(
  graph: Pick<SceneGraph, 'variables'>,
  variableId: string
): boolean {
  return graph.variables.get(variableId)?.type === 'FLOAT'
}
