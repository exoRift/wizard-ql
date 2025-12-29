export type FieldType = 'boolean' | 'string' | 'number' | 'date'
type OperatorType = 'junction' | 'primitive' | 'boolean' | 'string' | 'number' | 'date' | 'numeric' | 'array'

interface OperatorDefinition {
  name: string
  negation: string
  type: OperatorType
}

interface OperatorRecordEntry<N extends string> {
  negationName: N
  type: OperatorType
  aliases?: ReadonlyArray<Uppercase<string>>
  negationAliases?: ReadonlyArray<Uppercase<string>>
}

// Helper to get all strings used in OTHER entries
type StringsInOtherEntries<T, CurrentK> = {
  [K in keyof T]: K extends CurrentK ? never : AllStringsInEntry<T[K]> | K
}[keyof T]

// Helper to get all strings in a single entry
type AllStringsInEntry<E> = E extends OperatorRecordEntry<infer N>
  ? N | (E['aliases'] extends ReadonlyArray<infer A> ? A : never)
      | (E['negationAliases'] extends ReadonlyArray<infer NA> ? NA : never)
  : never

// Validate that a keyword is not used anywhere twice (operator, negation, alias, negation alias)
type ValidationError<Msg extends string> = string & { __error: Msg }
type ValidateGlobalUniqueness<T> = {
  [K in keyof T]: T[K] extends OperatorRecordEntry<infer N>
    ? {
      negationName: N extends K | StringsInOtherEntries<T, K>
        ? ValidationError<`Error: '${N & string}' is already used as a Key or in another entry (or not all uppercase)`>
        : N

      aliases?: T[K] extends { aliases: ReadonlyArray<infer A> }
        ? {
          [I in keyof T[K]['aliases']]: T[K]['aliases'][I] extends K | N | StringsInOtherEntries<T, K> | Exclude<A, T[K]['aliases'][I]>
            ? ValidationError<`Error: Alias '${T[K]['aliases'][I] & string}' is a duplicate or used elsewhere (or not all uppercase)`>
            : T[K]['aliases'][I]
        }
        : never

      negationAliases?: T[K] extends { negationAliases: ReadonlyArray<infer NA> }
        ? {
          [I in keyof T[K]['negationAliases']]: T[K]['negationAliases'][I] extends K | N | (T[K] extends { aliases: ReadonlyArray<infer A> } ? A : never) | StringsInOtherEntries<T, K> | Exclude<NA, T[K]['negationAliases'][I]>
            ? ValidationError<`Error: NegationAlias '${T[K]['negationAliases'][I] & string}' is a duplicate or used elsewhere (or not all uppercase)`>
            : T[K]['negationAliases'][I]
        }
        : never

      type: T[K]['type']
    }
    : ValidationError<'Error: Invalid Operator Record key (is it all uppercase?)'>
}

export type FieldTypeRecord = Record<string, FieldType | FieldType[]>
type OperatorRecord = Record<Uppercase<string>, OperatorRecordEntry<Uppercase<string>>>

export interface WizardParserConfig<T extends FieldTypeRecord, O extends OperatorRecord, V extends boolean, D extends string> {
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
  restricted?: Partial<Record<keyof T | (string & {}), boolean | ['allow' | 'deny', Array<string | RegExp>]>>

  /**
   * The types of fields\
   * Either provide the field type singularly or permit multiple types with an array of field types\
   * A field with type 'date' will parse the value into a Date object if possible (Wizard will not attempt to do this otherwise)\
   * Type coercion priority: boolean -> date -> number -> string
   */
  types?: T

  /**
   * Field names in restriction checks and type checks are case insensitive
   * @note If enabled, all fields will be returned as their casing denoted by the types or restricted record
   * @warn Mismatching casing between the restricted record and the type record will prioritize the restricted record
   */
  caseInsensitive?: boolean

  /**
   * Disallow fields that are not present in the "restricted" record or the "types" record
   */
  disallowUnvalidated?: V

  /**
   * A callback that determines how dates are interpreted\
   * By default, uses `new Date()`
   */
  dateInterpreter?: (v: string | number) => Date

  operators?: (O | ValidateGlobalUniqueness<O>) & ValidateGlobalUniqueness<O>

  dialects?: Record<D, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>
}

class WizardParser<const T extends FieldTypeRecord, const O extends OperatorRecord, const V extends boolean, const D extends string> {
  static readonly DEFAULT_OPERATORS = {
    AND: {
      negationName: 'OR',
      type: 'junction',
      aliases: ['&&', '&', '^'],
      negationAliases: ['||', '|', 'V']
    },

    EQUAL: {
      negationName: 'NOTEQUAL',
      type: 'primitive',
      aliases: ['EQUALS', 'EQ', 'IS', '=', '=='],
      negationAliases: ['NOTEQUAL', 'NOTEQUALS', 'NEQ', 'ISNT', '!=', '!==']
    },
    LESS: {
      negationName: 'GEQ',
      type: 'numeric',
      aliases: ['<'],
      negationAliases: ['>=', '=>']
    },
    GREATER: {
      negationName: 'LEQ',
      type: 'numeric',
      aliases: ['>', 'MORE', 'MORETHAN'],
      negationAliases: ['<=', '=<']
    },
    IN: {
      negationName: 'NOTIN',
      type: 'array',
      aliases: [':'],
      negationAliases: ['!:']
    },
    MATCH: {
      negationName: 'NOTMATCE',
      type: 'string',
      aliases: ['MATCHES', '~'],
      negationAliases: ['NOTMATCHES', '!~']
    }
  } as const satisfies OperatorRecord

  protected static readonly QUOTES = ['\'', '"', '`']
  protected static readonly NEGATORS = ['!']
  protected static readonly ARRAY_DELIMITERS = [',']

  protected static readonly ARRAY_BRACKETS: Array<[open: string, close: string]> = [
    ['[', ']'],
    ['{', '}']
  ]

  protected static readonly GROUP_PARENS: Array<[open: string, close: string]> = [
    ['(', ')']
  ]

  protected readonly OPERATION_DICTIONARY: Record<string, OperatorDefinition>
  protected readonly DIALECT_DICTIONARY: Record<D, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>

  protected readonly CONFIG: WizardParserConfig<T, O, V, D>

  constructor (config: WizardParserConfig<T, O, V, D>) {
    this.CONFIG = config

    // TODO: default definitions
    if (!config.operators) throw Error('replace this with default operation definition')

    this.OPERATION_DICTIONARY = {}
    this.OPERATION_DICTIONARY = {}
    // this.DIALECT_DICTIONARY = {}
    for (const operationName in config.operators) {
      // TODO: Remove this cast
      const operation = config.operators[operationName as keyof typeof config.operators] as OperatorRecordEntry<string>

      const opDef = {
        name: operationName,
        type: operation.type,
        negation: operation.negationName
      }
      const negOpDef = {
        name: operation.negationName,
        type: operation.type,
        negation: operationName
      }

      if (operationName in this.OPERATION_DICTIONARY) throw Error(`Two operator definitions have been supplied with the same name "${operationName}"`)
      this.OPERATION_DICTIONARY[operationName] = opDef

      if (operation.negationName in this.OPERATION_DICTIONARY) throw Error(`An operator definition shares a negation name with another operator's definition "${operation.negationName}"`)
      this.OPERATION_DICTIONARY[operation.negationName] = negOpDef

      if (operation.aliases) {
        for (const alias of operation.aliases) {
          if (alias in this.OPERATION_DICTIONARY) throw Error(`An operator definition has an alias that refers to another operator "${alias}"`)
          this.OPERATION_DICTIONARY[alias] = opDef
        }
      }

      if (operation.negationAliases) {
        for (const alias of operation.negationAliases) {
          if (alias in this.OPERATION_DICTIONARY) throw Error(`An operator definition has a negation alias that refers to another operator "${alias}"`)
          this.OPERATION_DICTIONARY[alias] = negOpDef
        }
      }
    }

    if (config.dialects) this.DIALECT_DICTIONARY = structuredClone(config.dialects)
    else this.DIALECT_DICTIONARY = {} as any
  }
}
