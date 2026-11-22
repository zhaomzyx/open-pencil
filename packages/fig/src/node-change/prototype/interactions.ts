import { isEqual } from 'es-toolkit'

import type { PrototypeAction } from '@open-pencil/scene-graph/prototype'
import { isRecord } from '@open-pencil/std/records'

import { readAction, writeAction } from './action'

type Reaction = Record<string, unknown> & { actions: unknown[] }

function click(value: unknown): value is Reaction {
  return (
    isRecord(value) &&
    value.isDeleted !== true &&
    isRecord(value.event) &&
    value.event.interactionType === 'ON_CLICK' &&
    Array.isArray(value.actions)
  )
}

export function clickActions(reactions: readonly unknown[]): PrototypeAction[] {
  return reactions.flatMap((reaction) =>
    click(reaction) ? reaction.actions.flatMap((action) => readAction(action) ?? []) : []
  )
}

/** Keep untouched records verbatim, including transition options a target edit still applies to. */
function editedAction(raw: unknown, before: PrototypeAction, after: PrototypeAction) {
  if (isEqual(before, after)) return raw
  if ('targetId' in before && 'targetId' in after && isRecord(raw)) {
    const encoded = writeAction(after)
    return (
      encoded && {
        ...raw,
        transitionNodeID: encoded.transitionNodeID,
        navigationType: encoded.navigationType
      }
    )
  }
  return writeAction(after)
}

/** A known action occupies its own slot among unmodeled actions, across click reactions. */
export function replaceClickActions(
  reactions: readonly unknown[],
  desired: PrototypeAction[],
  makeReaction: (actions: unknown[]) => Reaction
): unknown[] {
  const original = reactions.flatMap((reaction) =>
    click(reaction)
      ? reaction.actions.flatMap((raw) => {
          const value = readAction(raw)
          return value ? [{ raw, value }] : []
        })
      : []
  )
  if (
    isEqual(
      original.map((slot) => slot.value),
      desired
    )
  )
    return [...reactions]

  // Match unchanged actions before reserving slots for edits, so removing an earlier action
  // leaves intervening URLs and component-state changes on the same side of the surviving one.
  const used = new Set<number>()
  const takeSlot = (matches: (slot: (typeof original)[number]) => boolean) => {
    const index = original.findIndex((slot, i) => !used.has(i) && matches(slot))
    if (index !== -1) used.add(index)
    return index
  }
  const slots = desired.map((value) => takeSlot((slot) => isEqual(slot.value, value)))
  for (let i = 0; i < desired.length; i++) {
    if (slots[i] < 0) slots[i] = takeSlot((slot) => slot.value.type === desired[i].type)
  }
  for (let i = 0; i < desired.length; i++) if (slots[i] < 0) slots[i] = takeSlot(() => true)
  const encoded = desired.map((value, i) =>
    slots[i] < 0
      ? writeAction(value)
      : editedAction(original[slots[i]].raw, original[slots[i]].value, value)
  )
  let next = 0
  let at = 0
  let last: Reaction | undefined
  const output: unknown[] = []
  for (const reaction of reactions) {
    if (!click(reaction)) {
      output.push(reaction)
      continue
    }
    const actions: unknown[] = []
    for (const raw of reaction.actions) {
      if (!readAction(raw)) {
        actions.push(raw)
        continue
      }
      if (!used.has(at++)) continue
      while (next < slots.length && slots[next] < 0) {
        if (encoded[next]) actions.push(encoded[next])
        next++
      }
      if (encoded[next]) actions.push(encoded[next])
      next++
    }
    if (actions.length || reaction.actions.length === 0) {
      last = { ...reaction, actions }
      output.push(last)
    }
  }
  const extra = encoded.slice(next).filter((action) => action !== undefined)
  if (extra.length) {
    if (last) last.actions = last.actions.concat(extra)
    else output.push(makeReaction(extra))
  }
  return output
}
