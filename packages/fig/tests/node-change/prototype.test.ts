import { beforeAll, expect, test } from 'bun:test'

import { figArchiveOf } from '#fig-tests/helpers/fig-fixtures'
import { parseFigBuffer } from '#fig/archive/index'
import { nodeChangeToProps, sceneNodeToKiwi } from '#fig/node-change/index'
import { patchFigRecords } from '#fig/record-patch/index'

import { materializeDocument } from '@open-pencil/fig'
import { initCodec, type NodeChange } from '@open-pencil/kiwi/fig/codec'
import { SceneGraph } from '@open-pencil/scene-graph'
import {
  prototypePatch,
  readPrototype,
  type PrototypeSpec
} from '@open-pencil/scene-graph/prototype'
import { getNodeOrThrow } from '@open-pencil/test-support/assert'
import { guid } from '@open-pencil/test-support/fig/guid'

beforeAll(() => initCodec())

function imported(record: NodeChange) {
  const graph = new SceneGraph()
  const node = graph.createNode('FRAME', graph.getPages()[0].id, nodeChangeToProps(record, []))
  const write = () => sceneNodeToKiwi(node, guid(0), 0, { value: 100 }, graph, [])[0]
  return { node, graph, write }
}

const variant = {
  connectionType: 'INTERNAL_NODE',
  transitionNodeID: guid(42),
  navigationType: 'SWAP_STATE',
  transitionType: 'SMART_ANIMATE'
}
const url = { connectionType: 'URL', connectionURL: 'https://example.org/' }
const navigate = {
  connectionType: 'INTERNAL_NODE',
  navigationType: 'NAVIGATE',
  transitionNodeID: guid(2),
  transitionType: 'DISSOLVE',
  transitionDuration: 0.5
}
const click = (actions: unknown[]) => ({
  id: guid(7),
  event: { interactionType: 'ON_CLICK' },
  actions,
  stateManagementVersion: 1
})

test('editing and clearing known actions leaves mixed reaction records and transitions intact', async () => {
  const other = { event: { interactionType: 'ON_HOVER' }, actions: [navigate] }
  const raw = [other, click([variant, navigate, url, { connectionType: 'BACK' }])]
  const { node, graph, write } = imported({
    type: 'FRAME',
    guid: guid(1),
    prototypeInteractions: raw,
    prototypeStartingPoint: { name: 'Custom flow', description: 'Keep me' }
  })
  expect(readPrototype(node)).toEqual({
    start: true,
    actions: [{ type: 'navigate', targetId: '1:2' }, { type: 'back' }]
  })
  expect(write().prototypeInteractions).toEqual(raw)
  graph.updateNode(
    node.id,
    prototypePatch(node, { start: true, actions: [{ type: 'navigate', targetId: '1:3' }] })
  )
  const record = parseFigBuffer(await figArchiveOf([write()])).nodeChanges[0]
  expect(record.prototypeInteractions).toEqual([
    other,
    click([variant, { ...navigate, transitionNodeID: guid(3) }, url])
  ])
  expect(record.prototypeStartingPoint).toEqual({ name: 'Custom flow', description: 'Keep me' })
  graph.updateNode(node.id, prototypePatch(node, {}))
  expect(write().prototypeInteractions).toEqual([other, click([variant, url])])
  expect(write().prototypeStartingPoint).toBeUndefined()
})

test('binary archive round trip uses file GUIDs for screen, variable and preview text references', async () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const root = graph.createNode('FRAME', page.id)
  const stock = graph.createVariable('Stock', 'FLOAT', graph.createCollection('Game').id, 3)
  const node = graph.createNode('TEXT', root.id)
  const spec = (variableId: string, targetId: string): PrototypeSpec => ({
    textVariableId: variableId,
    actions: [
      {
        type: 'ifNumber',
        variableId,
        operator: 'gt',
        value: 0,
        actions: [
          { type: 'addNumber', variableId, value: -1 },
          { type: 'swapOverlay', targetId }
        ]
      },
      { type: 'setNumber', variableId, value: 3 },
      { type: 'closeOverlay' }
    ]
  })
  graph.updateNode(node.id, prototypePatch(node, spec(stock.id, root.id)))
  const records = sceneNodeToKiwi(root, guid(1), 0, { value: 100 }, graph, [], {
    nodeIdToGuid: new Map([[root.id, guid(3)]]),
    varIdToGuid: new Map([[stock.id, guid(4)]])
  })
  const decoded = parseFigBuffer(await figArchiveOf(records)).nodeChanges[1]
  expect(decoded.prototypeInteractions).toMatchObject([
    {
      actions: [
        { connectionType: 'CONDITIONAL' },
        { connectionType: 'SET_VARIABLE' },
        { connectionType: 'CLOSE' }
      ]
    }
  ])
  expect(readPrototype(imported(decoded).node)).toEqual(spec('1:4', '1:3'))
})

test('reordering known click actions carries their raw fields across an opaque action', () => {
  const back = { connectionType: 'BACK', transitionDuration: 0.75 }
  const { node, graph, write } = imported({
    guid: guid(1),
    prototypeInteractions: [click([navigate, url, back])]
  })
  graph.updateNode(
    node.id,
    prototypePatch(node, { actions: readPrototype(node).actions?.reverse() })
  )
  expect(write().prototypeInteractions).toEqual([click([back, url, navigate])])
})

test('a dangling non-GUID target survives a binary save alongside native actions', async () => {
  const { node, graph, write } = imported({ guid: guid(1) })
  const spec: PrototypeSpec = {
    actions: [{ type: 'navigate', targetId: 'missing-screen' }, { type: 'back' }]
  }
  graph.updateNode(node.id, prototypePatch(node, spec))
  const record = parseFigBuffer(await figArchiveOf([write()])).nodeChanges[0]
  expect(record.prototypeInteractions).toMatchObject([{ actions: [{ connectionType: 'BACK' }] }])
  expect(readPrototype(imported(record).node)).toEqual(spec)
})

test('a legacy canvas start resolves onto the named screen', () => {
  const records: NodeChange[] = [
    { type: 'CANVAS', guid: guid(1), prototypeStartNodeID: guid(2) },
    { type: 'FRAME', guid: guid(2), parentIndex: { guid: guid(1), position: '!' } }
  ]
  const { graph } = materializeDocument(records)
  expect(readPrototype(getNodeOrThrow(graph, '1:2')).start).toBe(true)
  const patched = patchFigRecords(records, {
    records: [],
    removed: [],
    replaceVariables: false,
    fields: [{ guid: guid(2), set: {}, unset: ['prototypeStartingPoint'] }]
  })
  expect(
    readPrototype(getNodeOrThrow(materializeDocument(patched).graph, '1:2')).start
  ).toBeUndefined()
})
