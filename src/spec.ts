export type FieldType = 'boolean' | 'string' | 'number' | 'date'
export type ConditionOperatorComparisonType = 'primitive' | 'boolean' | 'string' | 'number' | 'date' | 'numeric' | 'array'
export type JunctionOperatorType = 'sumjunction' | 'productjunction'
export type OperatorType = JunctionOperatorType | ConditionOperatorComparisonType
export type FieldTypeRecord = Record<string, FieldType | FieldType[]>

export interface OperatorRecordEntry {
  /** The negation of this operator */
  negationName: Uppercase<string>
  /** The data type this operator acts upon */
  type: OperatorType
  /** Aliases for this operator */
  aliases?: ReadonlyArray<Uppercase<string>>
  /** Aliases for the negation of this operator */
  negationAliases?: ReadonlyArray<Uppercase<string>>
  /**
   * Does this operator exclude the value being provided?\
   * The negation's exclusionary trait will be the opposite of this
   * @default false
   */
  exclusionary?: boolean
}
export type OperatorRecord = Record<Uppercase<string>, OperatorRecordEntry>

export type GetConditionOperators<O extends OperatorRecord> = string & {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? O[K] extends { type: JunctionOperatorType }
      ? never
      : K | O[K]['negationName']
    : never
}[keyof O]
export type GetJunctionOperators<O extends OperatorRecord> = string & {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? O[K] extends { type: JunctionOperatorType }
      ? K | O[K]['negationName']
      : never
    : never
}[keyof O]
export type GetOperators<O extends OperatorRecord> = GetConditionOperators<O> | GetJunctionOperators<O>

export type GetOperatorDefinition<O extends OperatorRecord, P extends GetOperators<O>> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? P extends K | O[K]['negationName'] | (O[K]['aliases'] extends ReadonlyArray<infer A> ? A : never) | (O[K]['negationAliases'] extends ReadonlyArray<infer NA> ? NA : never)
      ? O[K]
      : never
    : never
}[keyof O]

type Unroll<T> = T extends ReadonlyArray<infer U> ? U : T
export type GetFieldTSType<T extends FieldType | FieldType[]> = {
  boolean: boolean
  string: string
  number: number
  date: Date
}[Unroll<T>]

export type Primitive = GetFieldTSType<FieldType>

export type GetConditionTSType<T extends ConditionOperatorComparisonType> = {
  primitive: Primitive
  boolean: boolean
  string: string
  number: number
  date: Date
  numeric: number | Date
  array: Primitive[]
}[T]

export interface CheckedCondition<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord, I extends keyof F = keyof F, P extends GetConditionOperators<O> = GetConditionOperators<O>> {
  type: 'condition'
  operation: P
  field: I
  value: GetOperatorDefinition<O, P>['type'] extends 'array'
    ? Array<GetFieldTSType<F[I]>>
    : Extract<GetConditionTSType<GetOperatorDefinition<O, P>['type'] & ConditionOperatorComparisonType>, GetFieldTSType<F[I]>>
  validated: true
}

export interface UncheckedCondition<O extends OperatorRecord = OperatorRecord, P extends GetConditionOperators<O> = GetConditionOperators<O>> {
  type: 'condition'
  operation: P
  field: string
  value: GetOperatorDefinition<O, P>['type'] extends 'array'
    ? Primitive[]
    : GetConditionTSType<GetOperatorDefinition<O, P>['type'] & ConditionOperatorComparisonType>
  validated: false
}

export interface Group<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord, V extends boolean = false> {
  type: 'group'
  operation: GetJunctionOperators<O> & string
  constituents: Array<Expression<F, O, V>>
}

/** Create a union of conditions; an intersection of the operation type validation and constraint type validation */
type CheckedConditionSpread<
  F extends FieldTypeRecord,
  O extends OperatorRecord
> = {
  [I in keyof F]: {
    [P in GetConditionOperators<O>]: [CheckedCondition<F, O, I, P>['value']] extends [never]
      ? never
      : CheckedCondition<F, O, I, P>
  }[GetConditionOperators<O>]
}[keyof F]

/** Create a union of conditions that are operation type validated */
type UncheckedConditionSpread<O extends OperatorRecord> = {
  [P in GetConditionOperators<O>]: [UncheckedCondition<O, P>['value']] extends [never]
    ? never
    : UncheckedCondition<O, P>
}[GetConditionOperators<O>]

export type Expression<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord, V extends boolean = false> =
  Group<F, O, V>
  | (V extends true
    ? CheckedConditionSpread<F, O>
    : CheckedConditionSpread<F, O> | UncheckedConditionSpread<O>)

export const TYPE_PRIORITY = ['boolean', 'date', 'number', 'string'] as const satisfies FieldType[]

export interface Token {
  /** The text content of the token */
  content: string
  /** The index in the original expression this token originates from */
  index: number
}
