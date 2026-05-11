type FieldType = 'boolean' | 'string' | 'number' | 'date'
type ComparisonOperatorType = 'primitive' | 'boolean' | 'string' | 'number' | 'date' | 'numeric' | 'array'
type JunctionOperatorType = 'sumjunction' | 'productjunction'
type OperatorType = JunctionOperatorType | ComparisonOperatorType

type FieldTypeRecord = Record<string, FieldType | FieldType[]>
type OperatorRecord = Record<Uppercase<string>, OperatorRecordEntry>

interface OperatorRecordEntry {
  negationName: Uppercase<string>
  type: OperatorType
  aliases?: ReadonlyArray<Uppercase<string>>
  negationAliases?: ReadonlyArray<Uppercase<string>>
}

type GetConditionOperators<O extends OperatorRecord> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? O[K] extends { type: JunctionOperatorType }
      ? never
      : K | O[K]['negationName']
    : never
}[keyof O]

type GetJunctionOperators<O extends OperatorRecord> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? O[K] extends { type: JunctionOperatorType }
      ? K | O[K]['negationName']
      : never
    : never
}[keyof O]

type GetOperators<O extends OperatorRecord> = GetConditionOperators<O> | GetJunctionOperators<O>

type GetOperatorDefinition<O extends OperatorRecord, P extends GetOperators<O>> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? K extends P | O[K]['negationName'] | (O[K]['aliases'] extends ReadonlyArray<infer A> ? A : never) | (O[K]['negationAliases'] extends ReadonlyArray<infer NA> ? NA : never)
      ? O[K]
      : never
    : never
}[keyof O]

type Unroll<T> = T extends ReadonlyArray<infer U> ? U : T
type GetFieldTSType<T extends FieldType | FieldType[]> = {
  boolean: boolean
  string: string
  number: number
  date: Date
}[Unroll<T>]

type Primitive = GetFieldTSType<FieldType>

type GetConditionTSType<T extends ComparisonOperatorType> = {
  primitive: Primitive
  boolean: boolean
  string: string
  number: number
  date: Date
  numeric: number | Date
  array: Primitive[]
}[T]

interface Condition<F extends FieldTypeRecord, O extends OperatorRecord, I extends keyof F, P extends GetConditionOperators<O>> {
  type: 'condition'
  operation: P
  field: I
  value: GetOperatorDefinition<O, P>['type'] extends 'array'
    ? Array<GetFieldTSType<F[I]>>
    : Extract<GetConditionTSType<GetOperatorDefinition<O, P>['type'] & ComparisonOperatorType>, GetFieldTSType<F[I]>>
}

interface Group<F extends FieldTypeRecord, O extends OperatorRecord> {
  type: 'group'
  operation: GetJunctionOperators<O>
  constituents: Array<Expression<F, O>>
}

type Expression<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord> = Condition<F, O, keyof F, GetConditionOperators<O>> | Group<F, O>

interface WizardParserConfig<F extends FieldTypeRecord, O extends OperatorRecord> {
  /**
   * Restricted fields.\
   * Restrict an entire field by setting it to true.\
   * Restrict an exact value by providing a string.\
   * Restrict a pattern by providing a Regex expression.\
   * By default allow any value and restrict a collection of values by passing ['deny', VALUES[]]\
   * By default restrict any value and allow a collection of values by passing ['allow', VALUES[]]\
   * If the query value is of array type, it will check all entries of the array and ensure they're all allowed.\
   * This check runs before type coercion so the value checked will always be a string. However, quotes and escapes WILL be removed
   */
  restricted?: Partial<Record<keyof F | (string & {}), boolean | ['allow' | 'deny', Array<string | RegExp>]>>

  /**
   * The types of fields\
   * Either provide the field type singularly or permit multiple types with an array of field types\
   * A field with type 'date' will parse the value into a Date object if possible (Wizard will not attempt to do this otherwise)\
   * Type coercion priority: boolean -> date -> number -> string
   */
  types?: F

  /**
   * Field names in restriction checks and type checks are case insensitive
   * @note If enabled, all fields will be returned as their casing denoted by the types or restricted record
   * @warn Mismatching casing between the restricted record and the type record will prioritize the restricted record
   */
  caseInsensitive?: boolean

  /**
   * Disallow fields that are not present in the "restricted" record or the "types" record
   */
  disallowUnvalidated?: boolean

  /**
   * Should standalone field names be parsed as EQUAL operations (Or !field as NOTEQUAL)?\
   * These don't trigger if the operations don't exist
   */
  parseImplicitEqual?: boolean

  /**
   * A callback that determines how dates are interpreted\
   * By default, uses `new Date()`
   */
  dateInterpreter?: (v: string | number) => Date

  operators?: (O | ValidateGlobalUniqueness<O>) & ValidateGlobalUniqueness<O>

  dialects?: Record<string, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>
}



function test<F extends FieldTypeRecord, O extends OperatorRecord> (cfg: WizardParserConfig<F, O>): Expression<F, O> {

}

const testType = test({
  operators: {
    FOO: {
      negationName: 'BAR',
      type: 'string'
    }
  }
})

if (testType.type === 'group') {
  if (testType.operation === 'bruh')
} else {
  if (testType.operation === 'moment')
}

const testUnnarrowing: Expression = testType

if (testUnnarrowing.type === 'condition') {
  testUnnarrowing.value
}

// Helper to get all strings used in OTHER entries
type StringsInOtherEntries<O extends OperatorRecord, CurrentK> = {
  [K in keyof O]: K extends CurrentK ? never : AllStringsInEntry<O[K] & OperatorRecordEntry> | K
}[keyof O]

// Helper to get all strings in a single entry
type AllStringsInEntry<E extends OperatorRecordEntry> = E extends OperatorRecordEntry
  ? E['negationName'] | (E['aliases'] extends ReadonlyArray<infer A> ? A : never)
      | (E['negationAliases'] extends ReadonlyArray<infer NA> ? NA : never)
  : never

// Validate that a keyword is not used anywhere twice (operator, negation, alias, negation alias)
type ValidationError<Msg extends string> = string & { __error: Msg }
type ValidateGlobalUniqueness<O extends OperatorRecord> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? O[K] & ({
      negationName: O[K]['negationName'] extends (K | StringsInOtherEntries<O, K>)
        ? ValidationError<`Error: '${O[K]['negationName'] & string}' is already used as a Key or in another entry (or not all uppercase)`>
        : O[K]['negationName']

      aliases?: O[K] extends (OperatorRecordEntry & { aliases: ReadonlyArray<infer A> })
        ? {
          [I in keyof O[K]['aliases']]: O[K]['aliases'][I] extends K | O[K]['negationName'] | StringsInOtherEntries<O, K> | Exclude<A, O[K]['aliases'][I]>
            ? ValidationError<`Error: Alias '${O[K]['aliases'][I] & string}' is a duplicate or used elsewhere (or not all uppercase)`>
            : O[K]['aliases'][I]
        }
        : never

      negationAliases?: O[K] extends (OperatorRecordEntry & { negationAliases: ReadonlyArray<infer NA> })
        ? {
          [I in keyof O[K]['negationAliases']]: O[K]['negationAliases'][I] extends K | O[K]['negationName'] | (O[K] extends { aliases: ReadonlyArray<infer A> } ? A : never) | StringsInOtherEntries<O, K> | Exclude<NA, O[K]['negationAliases'][I]>
            ? ValidationError<`Error: NegationAlias '${O[K]['negationAliases'][I] & string}' is a duplicate or used elsewhere (or not all uppercase)`>
            : O[K]['negationAliases'][I]
        }
        : never
    })
    : ValidationError<'Error: Invalid Operator Record key (is it all uppercase?)'>
}
