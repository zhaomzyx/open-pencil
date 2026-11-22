import { matchesKeyboardEvent } from '@tanstack/hotkeys'

import type { SceneGraph } from '@open-pencil/scene-graph'
import { findLayerByPath } from '@open-pencil/scene-graph/behaviours'
import { readPrototype } from '@open-pencil/scene-graph/prototype'

export interface IslandPrototype {
  source: SceneGraph
  numbers: Record<string, number>
  activate: (sourceId: string) => void
}

const NATIVE_CONTROL = 'button,input,textarea,select,a[href],[data-island-control]'

export function prototypeLayer(
  run: IslandPrototype,
  rootId: string,
  projectedId: string,
  path: string,
  native: boolean
) {
  const node = run.source.getNode(projectedId) ?? findLayerByPath(run.source, rootId, path)
  if (!node) return undefined
  const props: Record<string, unknown> = { 'data-prototype-source': node.id }
  const spec = readPrototype(node)
  const binding = spec.textVariableId
  const text =
    node.type === 'TEXT' && binding && Object.hasOwn(run.numbers, binding)
      ? String(run.numbers[binding])
      : undefined
  if (spec.actions?.length) {
    props['data-prototype-hotspot'] = ''
    props.onClick = (event: MouseEvent) => {
      // A designed control inside a clickable card consumes its own click.
      for (const child of event.composedPath()) {
        if (child === event.currentTarget) break
        if (child instanceof Element && child.matches(NATIVE_CONTROL)) return
      }
      event.preventDefault()
      event.stopPropagation()
      run.activate(node.id)
    }
    if (!native) {
      props.role = 'button'
      props.tabindex = 0
      props['aria-label'] = node.name
      props.onKeydown = (event: KeyboardEvent) => {
        if (
          event.target !== event.currentTarget ||
          event.repeat ||
          !(matchesKeyboardEvent(event, 'Enter') || matchesKeyboardEvent(event, 'Space'))
        )
          return
        event.preventDefault()
        event.stopPropagation()
        run.activate(node.id)
      }
    }
  }
  return { props, text }
}
