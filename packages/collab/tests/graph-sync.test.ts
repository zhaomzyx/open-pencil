import { describe, expect, test } from 'bun:test'

import { createYjsGraphSync, registerYjsObservers, type CollabEditor } from '#collab/index'
import * as Y from 'yjs'

import { SceneGraph } from '@open-pencil/scene-graph'
import { prototypePatch, readPrototype } from '@open-pencil/scene-graph/prototype'

/** An editor with nothing to redraw and no edits of its own, as a server reading a room has. */
function headlessEditor(graph: SceneGraph): CollabEditor {
  return {
    graph,
    isReadOnly: () => true,
    onEditorEvent: () => () => undefined,
    requestRender: () => undefined,
    refreshVariables: () => undefined,
    refreshDocumentSettings: () => undefined
  }
}

function graphSync(ydoc: Y.Doc, editor: CollabEditor) {
  return createYjsGraphSync({
    getEditor: () => editor,
    getYdoc: () => ydoc,
    getYnodes: () => ydoc.getMap('nodes'),
    getYimages: () => ydoc.getMap('images'),
    setSuppressYjsEvents: () => undefined
  })
}

describe('room document to graph', () => {
  test('reads a room saved as a Yjs update into a graph without an editor', () => {
    const source = new SceneGraph()
    const page = source.addPage('Cover')
    const frame = source.createNode('FRAME', page.id, { name: 'Hero', width: 320, height: 200 })
    const badge = source.createNode('RECTANGLE', frame.id, { name: 'Badge', x: 12, y: 8 })
    const details = source.createNode('FRAME', page.id, { name: 'Details' })
    source.updateNode(frame.id, prototypePatch(frame, { start: true }))
    source.updateNode(
      badge.id,
      prototypePatch(badge, {
        actions: [{ type: 'navigate', targetId: details.id }]
      })
    )
    const room = new Y.Doc()
    graphSync(room, headlessEditor(source)).syncAllNodesToYjs()

    // What a relay stores, read back by something that never saw the editor.
    const saved = Y.encodeStateAsUpdate(room)
    const ydoc = new Y.Doc()
    const graph = new SceneGraph()
    const editor = headlessEditor(graph)
    const sync = graphSync(ydoc, editor)
    registerYjsObservers({
      editor,
      ynodes: ydoc.getMap<Y.Map<unknown>>('nodes'),
      yimages: ydoc.getMap('images'),
      getSuppressYjsEvents: () => false,
      setSuppressGraphSync: () => undefined,
      applyYjsToGraph: sync.applyYjsToGraph
    })
    Y.applyUpdate(ydoc, saved)

    const cover = graph.getPages().find((candidate) => candidate.name === 'Cover')
    expect(cover?.id).toBe(page.id)
    const hero = graph.getNode(frame.id)
    expect(hero).toMatchObject({ name: 'Hero', width: 320, height: 200, parentId: page.id })
    const [remoteBadge] = graph.getChildren(frame.id)
    expect(remoteBadge?.name).toBe('Badge')
    expect(hero && readPrototype(hero).start).toBe(true)
    expect(graph.getNode(details.id)).toBeDefined()
    expect(remoteBadge && readPrototype(remoteBadge).actions).toEqual([
      { type: 'navigate', targetId: details.id }
    ])
  })
})
