import { isEqual } from 'es-toolkit'

import type { SceneNode } from '../types'
import { readPrototype, prototypePatch, type PrototypeAction, type PrototypeSpec } from './model'

/** Visit all identities, including those inside conditions, in execution order. */
export function mapPrototypeReferences(
  spec: PrototypeSpec,
  layer: (id: string) => string,
  variable: (id: string) => string
): PrototypeSpec {
  const map = (action: PrototypeAction): PrototypeAction => {
    if ('targetId' in action) return { ...action, targetId: layer(action.targetId) }
    if (!('variableId' in action)) return action
    const variableId = variable(action.variableId)
    return action.type === 'ifNumber'
      ? { ...action, variableId, actions: action.actions.map(map) }
      : { ...action, variableId }
  }
  return {
    ...spec,
    ...(spec.actions && { actions: spec.actions.map(map) }),
    ...(spec.textVariableId && { textVariableId: variable(spec.textVariableId) })
  }
}

export function remappedPrototype(
  node: SceneNode,
  layer: (id: string) => string,
  variable: (id: string) => string
): Partial<SceneNode> {
  const spec = readPrototype(node)
  const mapped = mapPrototypeReferences(spec, layer, variable)
  return isEqual(spec, mapped) ? {} : prototypePatch(node, mapped)
}

export function prototypeReferences(node: SceneNode): { layers: string[]; variables: string[] } {
  const layers: string[] = []
  const variables: string[] = []
  const collect = (ids: string[]) => (id: string) => {
    ids.push(id)
    return id
  }
  mapPrototypeReferences(readPrototype(node), collect(layers), collect(variables))
  return { layers, variables }
}
