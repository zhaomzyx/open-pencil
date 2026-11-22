import type { VariableDataEntry } from '@open-pencil/kiwi/fig/codec'
import { guidToString, isUnsetGuid } from '@open-pencil/kiwi/fig/guid'
import type { PrototypeAction } from '@open-pencil/scene-graph/prototype'
import { isRecord } from '@open-pencil/std/records'

import { parseGuidOrNull } from '../export/context'

const operators = { gt: 'GREATER_THAN', lt: 'LESS_THAN', eq: 'EQUALS' } as const
const navigation = { navigate: 'NAVIGATE', openOverlay: 'OVERLAY', swapOverlay: 'SWAP' } as const

function field(object: unknown, key: string): unknown {
  return isRecord(object) ? object[key] : undefined
}

function id(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const { sessionID, localID } = value
  if (
    typeof sessionID !== 'number' ||
    typeof localID !== 'number' ||
    !Number.isSafeInteger(sessionID) ||
    !Number.isSafeInteger(localID)
  )
    return undefined
  const guid = { sessionID, localID }
  return isUnsetGuid(guid) ? undefined : guidToString(guid)
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function binary(data: unknown) {
  const expression = field(field(data, 'value'), 'expressionValue')
  const args = field(expression, 'expressionArguments')
  if (!Array.isArray(args) || args.length !== 2) return undefined
  const variableId = id(field(field(field(args[0], 'value'), 'alias'), 'guid'))
  const value = number(field(field(args[1], 'value'), 'floatValue'))
  return variableId && value !== undefined
    ? { fn: field(expression, 'expressionFunction'), variableId, value }
    : undefined
}

function readAssignment(raw: Record<string, unknown>): PrototypeAction | undefined {
  const variableId = id(field(field(raw.targetVariable, 'id'), 'guid') ?? raw.targetVariableID)
  if (!variableId) return undefined
  const data = raw.targetVariableData
  const value = number(
    field(data === undefined ? raw.targetVariableValue : field(data, 'value'), 'floatValue')
  )
  if (value !== undefined) return { type: 'setNumber', variableId, value }
  const sum = binary(data)
  return sum?.fn === 'ADDITION' && sum.variableId === variableId
    ? { type: 'addNumber', variableId, value: sum.value }
    : undefined
}

function readCondition(raw: Record<string, unknown>): PrototypeAction | undefined {
  const branches = raw.conditionalActions
  if (!Array.isArray(branches) || branches.length !== 1) return undefined
  const clause = branches[0]
  const condition = binary(field(clause, 'condition'))
  const operator = (Object.keys(operators) as Array<keyof typeof operators>).find(
    (key) => operators[key] === condition?.fn
  )
  const children = field(clause, 'actions')
  if (!condition || !operator || !Array.isArray(children)) return undefined
  const actions = children.flatMap((child) => readAction(child) ?? [])
  // A branch with additional behavior is opaque as a unit, including its guard.
  if (actions.length !== children.length) return undefined
  return {
    type: 'ifNumber',
    variableId: condition.variableId,
    operator,
    value: condition.value,
    actions
  }
}

export function readAction(raw: unknown): PrototypeAction | undefined {
  if (!isRecord(raw)) return undefined
  switch (raw.connectionType) {
    case 'BACK':
      return { type: 'back' }
    case 'CLOSE':
      return { type: 'closeOverlay' }
    case 'INTERNAL_NODE': {
      const targetId = id(raw.transitionNodeID)
      if (!targetId) return undefined
      switch (raw.navigationType) {
        case undefined:
        case 'NAVIGATE':
          return { type: 'navigate', targetId }
        case 'OVERLAY':
          return { type: 'openOverlay', targetId }
        case 'SWAP':
          return { type: 'swapOverlay', targetId }
        default:
          return undefined
      }
    }
    case 'SET_VARIABLE':
      return readAssignment(raw)
    case 'CONDITIONAL':
      return readCondition(raw)
    default:
      return undefined
  }
}

function numeric(value: number): VariableDataEntry {
  return { dataType: 'FLOAT', resolvedDataType: 'FLOAT', value: { floatValue: value } }
}

export function writeAction(action: PrototypeAction): Record<string, unknown> | undefined {
  if ('targetId' in action) {
    const guid = parseGuidOrNull(action.targetId, { wholeParts: true })
    return guid
      ? {
          connectionType: 'INTERNAL_NODE',
          navigationType: navigation[action.type],
          transitionNodeID: guid,
          transitionType: 'INSTANT_TRANSITION'
        }
      : undefined
  }
  if (!('variableId' in action))
    return { connectionType: action.type === 'back' ? 'BACK' : 'CLOSE' }
  const guid = parseGuidOrNull(action.variableId, { wholeParts: true })
  if (!guid) return undefined
  const literal = numeric(action.value)
  const expression = (fn: string, result: string): VariableDataEntry => ({
    dataType: 'EXPRESSION',
    resolvedDataType: result,
    value: {
      expressionValue: {
        expressionFunction: fn,
        expressionArguments: [
          { dataType: 'ALIAS', resolvedDataType: 'FLOAT', value: { alias: { guid } } },
          literal
        ]
      }
    }
  })
  if (action.type === 'ifNumber') {
    const actions = action.actions.map(writeAction)
    if (actions.some((child) => !child)) return undefined
    return {
      connectionType: 'CONDITIONAL',
      conditionalActions: [
        { condition: expression(operators[action.operator], 'BOOLEAN'), actions }
      ]
    }
  }
  return {
    connectionType: 'SET_VARIABLE',
    targetVariable: { id: { guid } },
    targetVariableData: action.type === 'setNumber' ? literal : expression('ADDITION', 'FLOAT')
  }
}
