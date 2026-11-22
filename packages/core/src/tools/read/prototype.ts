import * as v from 'valibot'

import { OpenPencilAPI } from '#core/openpencil-api'
import { defineTool, nodeIdInputSchema } from '#core/tools/schema'

export const getPrototype = defineTool({
  name: 'get_prototype',
  description:
    'Inspect a layer’s prototype trigger, ordered actions and conditions, text binding, and target and variable references. A reference with valid: false cannot run.',
  execution: { kind: 'async', mutation: 'none' },
  input: v.strictObject({ id: nodeIdInputSchema }),
  execute: async (figma, { id }) => {
    const node = await figma.getNodeByIdAsync(id)
    if (!node) return { error: `Node "${id}" not found` }
    return new OpenPencilAPI(figma).getPrototype(node)
  }
})
