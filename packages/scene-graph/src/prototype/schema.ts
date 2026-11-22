import * as v from 'valibot'

const idSchema = v.pipe(v.string(), v.nonEmpty())
const valueSchema = v.pipe(v.number(), v.finite())
const targetSchema = v.object({
  type: v.picklist(['navigate', 'openOverlay', 'swapOverlay']),
  targetId: idSchema
})
const historySchema = v.object({ type: v.picklist(['back', 'closeOverlay']) })
const numberSchema = v.object({
  type: v.picklist(['setNumber', 'addNumber']),
  variableId: idSchema,
  value: valueSchema
})
const conditionSchema = v.object({
  type: v.literal('ifNumber'),
  variableId: idSchema,
  operator: v.picklist(['gt', 'eq', 'lt']),
  value: valueSchema
})

export type PrototypeAction =
  | v.InferOutput<typeof targetSchema | typeof historySchema | typeof numberSchema>
  | (v.InferOutput<typeof conditionSchema> & { actions: PrototypeAction[] })

const actionSchema: v.GenericSchema<unknown, PrototypeAction> = v.lazy(() =>
  v.variant('type', [
    targetSchema,
    historySchema,
    numberSchema,
    v.object({ ...conditionSchema.entries, actions: v.array(actionSchema) })
  ])
)

export const prototypeSpecSchema = v.object({
  start: v.optional(v.boolean()),
  actions: v.optional(v.array(actionSchema)),
  textVariableId: v.optional(idSchema)
})

export type PrototypeSpec = v.InferOutput<typeof prototypeSpecSchema>
