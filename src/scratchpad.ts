import { ConstraintError, ParseError } from './errors'
import { createArrayDelimitRegexString, createQuoteRegexString, createTokenRegexString, ESCAPE_REGEX } from './regex'
import type { Token } from './spec'

export type FieldType = 'boolean' | 'string' | 'number' | 'date'
type OperatorType = 'junction' | 'primitive' | 'boolean' | 'string' | 'number' | 'date' | 'numeric' | 'array'

interface OperatorDefinition {
  name: string
  negation: string
  type: OperatorType
}

interface OperatorRecordEntry<N extends Uppercase<string>> {
  negationName: N
  type: OperatorType
  aliases?: ReadonlyArray<Uppercase<string>>
  negationAliases?: ReadonlyArray<Uppercase<string>>
}



export type FieldTypeRecord = Record<string, FieldType | FieldType[]>
type OperatorRecord = Record<Uppercase<string>, OperatorRecordEntry<Uppercase<string>>>

// Convert a field type string to its TypeScript representation
export type FieldTypeToTSType<T extends FieldType> = {
  boolean: boolean
  string: string
  number: number
  date: Date
}[T]

// Primitive values that can be used in comparisons
export type Primitive = FieldTypeToTSType<FieldType>

// Convert an input type record to its TypeScript counterpart
export type ConvertTypeRecord<T extends FieldTypeRecord> = {
  [K in keyof T]: T[K] extends FieldType[]
    ? FieldTypeToTSType<T[K][number]>
    : T[K] extends FieldType
      ? FieldTypeToTSType<T[K]>
      : Primitive
}

export const TYPE_PRIORITY = ['boolean', 'date', 'number', 'string'] as const satisfies FieldType[]

type ComparisonCategoryType = Exclude<OperatorType, 'junction'>
type ComparisonCategory<
  O extends OperatorRecord,
  P extends ComparisonOperators<O>
> = Extract<OperatorComparisonType<O, P>, ComparisonCategoryType>

// Map an operator's comparison category to a concrete TypeScript type
export type ComparisonTypeToTSType<
  O extends OperatorRecord,
  P extends ComparisonOperators<O>
> = {
  primitive: Primitive
  boolean: boolean
  string: string
  number: number
  date: Date
  numeric: number | Date
  array: Primitive[]
}[ComparisonCategory<O, P> & ComparisonCategoryType]

export type Operation<O extends OperatorRecord> = JunctionOperators<O> | ComparisonOperators<O>
export type JunctionOperation<O extends OperatorRecord> = JunctionOperators<O>
export type ComparisonOperation<O extends OperatorRecord> = ComparisonOperators<O>

/**
 * A group of conditions joined by a junction operator
 * @template R A record mapping field names to values
 */
export interface Group<
  R extends Record<string, unknown> = Record<string, Primitive>,
  O extends OperatorRecord = OperatorRecord,
  V extends boolean = false
> {
  type: 'group'
  /** The junction operator */
  operation: JunctionOperation<O>
  /** The members of the group */
  constituents: Array<Expression<R, O, V>>
}

/**
 * A query on a field, validated by type constraints
 * @template R A record mapping field names to values
 * @template F The name of the field being queried
 */
export interface Condition<
  R extends Record<string, unknown>,
  F extends keyof R,
  O extends OperatorRecord,
  P extends ComparisonOperators<O>
> {
  type: 'condition'
  /** The operation */
  operation: P
  /** The name of the field */
  field: F
  /** The value being checked */
  value: OperatorComparisonType<O, P> extends 'array'
    ? Array<R[F]>
    : Extract<ComparisonTypeToTSType<O, P>, R[F]>
  /** Was this condition validated by the constraints or is its type unknown? */
  validated: true
}

/**
 * A query on a field where the field type could not be validated
 */
export interface UncheckedCondition<
  O extends OperatorRecord,
  P extends ComparisonOperators<O> = ComparisonOperators<O>
> {
  type: 'condition'
  /** The operation */
  operation: P
  /** The name of the field */
  field: string
  /** The value being checked */
  value: Exclude<ComparisonTypeToTSType<O, P>, Date>
  /** Was this condition validated by the constraints or is its type unknown? */
  validated: false
}

/** Create a union of conditions; an intersection of the operation type validation and constraint type validation */
export type CheckedConditionSpread<
  R extends Record<string, unknown>,
  O extends OperatorRecord
> = {
  [K in keyof R]: {
    [P in ComparisonOperators<O>]: Condition<R, K, O, P>
  }[ComparisonOperators<O>]
}[keyof R]

/** Create a union of conditions that are operation type validated */
export type UncheckedConditionSpread<O extends OperatorRecord> = {
  [P in ComparisonOperators<O>]: UncheckedCondition<O, P>
}[ComparisonOperators<O>]

export type Expression<
  R extends Record<string, unknown> = Record<string, Primitive>,
  O extends OperatorRecord = OperatorRecord,
  V extends boolean = false
> = Group<R, O, V> | (V extends true
  ? CheckedConditionSpread<R, O>
  : CheckedConditionSpread<R, O> | UncheckedConditionSpread<O>)

export type UncheckedExpression<O extends OperatorRecord = OperatorRecord> =
  (Omit<Group<any, O>, 'constituents'> & { constituents: Array<UncheckedExpression<O>> }) | UncheckedConditionSpread<O>
/** --------  ----  */

// ADD MISSING TYPES HERE
/** --------  ----  */

type ComparisonOperators<O extends OperatorRecord> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry<infer N>
    ? O[K]['type'] extends 'junction'
      ? never
      : K | N
    : never
}[keyof O]

type JunctionOperators<O extends OperatorRecord> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry<infer N>
    ? O[K]['type'] extends 'junction'
      ? K | N
      : never
    : never
}[keyof O]

type OperatorComparisonType<O extends OperatorRecord, P extends ComparisonOperators<O>> = {
  [K in keyof O]: O[K] extends OperatorRecordEntry<infer N>
    ? P extends K | N | (O[K]['aliases'] extends ReadonlyArray<infer A> ? A : never) | (O[K]['negationAliases'] extends ReadonlyArray<infer NA> ? NA : never)
      ? O[K]['type']
      : never
    : never
}[keyof O]

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

  dialects?: Record<D, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>
}

interface Context {
  tokens: Token[]
  startToken: Token | undefined
  startIndex: number | undefined
  endToken?: Token | undefined
  endIndex?: number | undefined
}

interface ProcessedToken {
  /** The raw token */
  raw: string
  /** The token's quote contents, if surrounded by quotes */
  unquoted: string | undefined
  /** The token's resolved contents or quote contents, including escape backslashes */
  escaped: string
  /** The token's resolved contents, with the escape backslashes removed */
  unescaped: string
}

/**
 *
 */
export class WizardParser<const T extends FieldTypeRecord, const O extends OperatorRecord = typeof WizardParser.DEFAULT_OPERATORS, const V extends boolean = false, const D extends string = 'DEFAULTDIALECTS'> {
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
      negationAliases: ['NOTEQUALS', 'NEQ', 'ISNT', '!=', '!==']
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

  protected readonly OPERATION_DICTIONARY: Record<Operation<O>, OperatorDefinition>
  protected readonly DIALECT_DICTIONARY: Record<D, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>

  protected readonly CONFIG: WizardParserConfig<T, O, V, D>

  protected readonly TOKEN_REGEX: RegExp
  protected readonly QUOTE_REGEX: RegExp
  protected readonly QUOTE_EDGE_REGEX: RegExp
  protected readonly ARRAY_DELIMITER_REGEX: RegExp

  /**
   *
   * @param config
   */
  constructor (config: WizardParserConfig<T, O, V, D> = {}) {
    this.CONFIG = config

    if (!config.operators) config.operators = WizardParser.DEFAULT_OPERATORS as any

    this.OPERATION_DICTIONARY = {} as typeof this.OPERATION_DICTIONARY
    this.OPERATION_DICTIONARY = {} as typeof this.OPERATION_DICTIONARY
    // this.DIALECT_DICTIONARY = {}
    for (const operationName in config.operators) {
      const operation = config.operators[operationName as keyof typeof config.operators] as OperatorRecordEntry<Operation<O>>

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

    this.TOKEN_REGEX = new RegExp(
      createTokenRegexString(
        Object.keys(this.OPERATION_DICTIONARY)
          .concat(WizardParser.GROUP_PARENS.flat())
          .concat(WizardParser.ARRAY_BRACKETS.flat())
          .concat(WizardParser.NEGATORS)
          .concat(WizardParser.ARRAY_DELIMITERS),
        WizardParser.QUOTES
      ),
      'g'
    )
    const quoteRegexStr = createQuoteRegexString(WizardParser.QUOTES)
    this.QUOTE_REGEX = new RegExp(quoteRegexStr)
    this.QUOTE_EDGE_REGEX = new RegExp(`^${quoteRegexStr}$`)
    this.ARRAY_DELIMITER_REGEX = new RegExp(createArrayDelimitRegexString(WizardParser.QUOTES, WizardParser.ARRAY_DELIMITERS), 'g')

    Object.freeze(config)
  }

  /**
   *
   * @param v
   */
  protected interpretDate (v: string | number): Date {
    if (this.CONFIG.dateInterpreter) return this.CONFIG.dateInterpreter(v)
    else return new Date(v)
  }

  /**
   * Take a string, sanitize it, and push it to an array if it has a length
   * @param array The array to push to
   * @param item  The item to sanitize and push
   * @param index The index of the token in the original string
   * @returns     The token, if pushed
   */
  protected static pushSanitized (array: Token[], item: string, index: number): Token | undefined {
    let trimmed = item.trimEnd()
    const pretrimLength = trimmed.length
    trimmed = trimmed.trimStart()
    const lengthDiff = trimmed.length - pretrimLength

    if (trimmed) {
      const token = { content: trimmed, index: index - lengthDiff }
      array.push(token)
      return token
    }
  }

  /**
   * Take a string and tokenize it for parsing with a specific pattern
   * @param expression The expression to tokenize
   * @param pattern    The tokenization pattern
   * @returns          An array of tokens
   */
  protected _tokenize (expression: string, pattern: RegExp): Token[] {
    const tokens: Token[] = []
    const matches = expression.toUpperCase().matchAll(pattern)

    let lastMatchEnd: number | null = null
    for (const match of matches) {
      WizardParser.pushSanitized(tokens, expression.slice(lastMatchEnd ?? 0, match.index), lastMatchEnd === null ? 0 : lastMatchEnd)

      if (WizardParser.ARRAY_BRACKETS.some(([o]) => match[0] === o)) {
        const startToken = {
          content: match[0],
          index: match.index
        }
        tokens.push(startToken)

        let subopenings = 0
        let endToken: Token | undefined
        for (const submatch of matches) {
          if (
            (match[0] === submatch[0]) ||
            (match[0] === submatch[0])
          ) ++subopenings

          if (
            WizardParser.ARRAY_BRACKETS.some(([o, c]) => match[0] === o && submatch[0] === c)
          ) {
            if (subopenings) --subopenings
            else {
              endToken = {
                content: submatch[0],
                index: submatch.index
              }

              break
            }
          }
        }

        const subtokens = endToken
          ? this._tokenize(expression.slice(startToken.index + startToken.content.length, endToken.index), this.ARRAY_DELIMITER_REGEX)
          : this._tokenize(expression.slice(startToken.index + startToken.content.length), pattern)

        for (const subtoken of subtokens) subtoken.index += match.index + 1
        tokens.push(...subtokens)
        if (endToken) {
          tokens.push(endToken)
          lastMatchEnd = endToken.index + endToken.content.length
        } else {
          // Assume we reached the end of the matches in the subiteration
          lastMatchEnd = expression.length
          break
        }

        continue
      } else {
        WizardParser.pushSanitized(
          tokens,
          match.groups?.quotecontent !== undefined
            ? expression.slice(match.index, match.index + match[0].length) // This isn't a real token and is a string; don't append its uppercase version
            : match[0],
          match.index
        )
      }

      lastMatchEnd = match.index + match[0].length
    }
    WizardParser.pushSanitized(tokens, expression.slice(lastMatchEnd ?? 0), lastMatchEnd ?? 0)

    return tokens
  }

  /**
   * Take a string and tokenize it for parsing
   * @param expression The expression to tokenize
   * @returns          An array of tokens
   */
  tokenize (expression: string): Token[] {
    return this._tokenize(expression, this.TOKEN_REGEX)
  }

  /**
   * Get an opening closure's closing index
   * @param tokens  The token array
   * @param start   The index of the opening closure
   * @param opening The token to consider as opening
   * @param closing The token to consider as closing
   * @returns       The index of the closing token or -1 if not found
   */
  protected static getClosingIndex (tokens: Token[], start: number, opening: string, closing: string): number {
    let openingCount = 1

    for (let index = start + 1; index < tokens.length; ++index) {
      switch (tokens[index]!.content) {
        case opening: ++openingCount; break
        case closing: --openingCount; break
      }

      if (openingCount === 0) return index
    }

    return -1
  }

  /**
   * Process a token to get its unquoted, escaped, and unescaped varients\
   * Order: unquote -> escaped -> unescaped
   * @param token The token to process
   * @returns     An object containing the variants
   */
  protected processToken (token: string): ProcessedToken {
    const unquoted = token.match(this.QUOTE_EDGE_REGEX)?.groups?.quotecontent
    const escaped = unquoted ?? token
    const unescaped = escaped.replaceAll(new RegExp(`(?<!${ESCAPE_REGEX}\\\\)\\\\`, 'g'), '')

    return {
      raw: token,
      unquoted,
      escaped,
      unescaped
    }
  }

  /**
   * Apply De Morgan's Law to an expression and complement it\
   * (Mutating operation)
   * @param          expression The expression
   * @throws {Error}            If the inverse operation cannot be found
   */
  protected complementExpression (expression: Expression<ConvertTypeRecord<T>, O, V>): void {
    const inverse = this.OPERATION_DICTIONARY[expression.operation]?.negation
    if (!inverse) throw new Error(`Could not find inverse operation given operation name "${expression.operation}"`) // TODO: Should be parse error, maybe?
    expression.operation = inverse

    if (expression.type === 'group') expression.constituents.forEach((e) => this.complementExpression(e))
  }

  /**
   * Coerce a string into the appropriate type for the operation based on the field type and operator
   * @param           processedToken The value to coerce (already processed)
   * @param           fieldTypes     The supported field types
   * @param           operatorTypes  The supported operator types
   * @returns                        The coerced type
   * @throws  {Error}                Message is 'operator' if the operator type cannot be coerced and 'field' if the field type cannot be coerced
   */
  protected coerceType (processedToken: ProcessedToken, fieldTypes: FieldType[], operatorTypes: FieldType[]): Primitive {
    const { raw, unescaped } = processedToken

    let operatorHits = 0
    let fieldHits = 0
    for (const type of TYPE_PRIORITY) {
      const operatorHit = operatorTypes.includes(type)
      const fieldHit = fieldTypes.includes(type)
      if (operatorHit) ++operatorHits
      if (fieldHit) ++fieldHits
      if (!operatorHit || !fieldHit) continue

      switch (type) {
        case 'boolean':
          if (raw === 'true') return true
          else if (raw === 'false') return false

          break
        case 'number': {
          const num = Number(raw)
          if (isNaN(num)) break

          return num
        }
        case 'string': return unescaped
        case 'date': {
          const num = Number(raw)
          const date = this.interpretDate(isNaN(num) ? unescaped : num)
          if (isNaN(+date)) break

          return date
        }
      }

      if (operatorTypes.includes(type)) --operatorHits
      if (fieldTypes.includes(type)) --fieldHits
    }

    if (!operatorHits) throw new Error('operator')
    if (!fieldHits) throw new Error('field')
    throw new Error('operator')
  }

  /**
   * Validate that a condition meets constraints
   * @warn This operation mutates the condition to apply the validated field and perform type coercion
   * @template T A type record, mapping field names to their types
   * @param                     condition       The condition to validate
   * @param                     constraints     The constraints to check
   * @param                     valueIsImplicit Was this value implicitly inferred? If so, don't attempt stringification
   * @param                     ctx             Error Context
   * @throws  {ConstraintError}
   * @returns                                   The same reference to the condition
   */
  protected validateCondition (condition: Omit<UncheckedCondition<O>, 'validated' | 'value'> & { value: string | string[] }, valueIsImplicit?: boolean, ctx?: Context): Exclude<Expression<ConvertTypeRecord<T>, O, V>, Group<ConvertTypeRecord<T>, O, V>> {
    let validated = false
    condition.field = this.processToken(condition.field).unescaped
    const field = this.CONFIG.caseInsensitive
      ? [...Object.keys(this.CONFIG.types ?? {}), ...Object.keys(this.CONFIG.restricted ?? {})].find((k) => k.toLowerCase() === condition.field.toLowerCase()) ?? condition.field
      : condition.field
    const restriction = this.CONFIG.restricted?.[field]
    const type = this.CONFIG?.types?.[field]

    if (this.CONFIG?.disallowUnvalidated && restriction === undefined && type === undefined) throw new ConstraintError(`Unknown field "${condition.field}"`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)

    const operationType = this.OPERATION_DICTIONARY[condition.operation].type
    const types = type && (Array.isArray(type) ? type : [type])

    const processedValues = (Array.isArray(condition.value) ? condition.value : [condition.value]).map((v) => this.processToken(v))

    // Check if this field is allowed to be queried
    if (restriction === true) throw new ConstraintError(`Field "${condition.field}" is restricted`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)
    else if (Array.isArray(restriction)) {
      const [philosophy, checks] = restriction

      if (philosophy === 'deny') {
        for (const check of checks) {
          if (check instanceof RegExp) {
            if (processedValues.some(({ unescaped }) => check.test(unescaped))) {
              throw new ConstraintError(
                `Value for field "${condition.field}" violates prohibitive pattern constraint "${check.toString()}". Prohibited values/patterns: Allowed values/patterns: ${checks.join(', ')}`,
                ctx?.tokens,
                ctx?.startToken,
                ctx?.startIndex,
                ctx?.endToken,
                ctx?.endIndex
              )
            }
          } else {
            if (processedValues.some(({ unescaped }) => unescaped === check)) {
              throw new ConstraintError(
                `Forbidden value "${check}" for field "${condition.field}". Prohibited values/patterns: ${checks.join(', ')}`,
                ctx?.tokens,
                ctx?.startToken,
                ctx?.startIndex,
                ctx?.endToken,
                ctx?.endIndex
              )
            }
          }
        }
      } else {
        for (const { unescaped } of processedValues) {
          if (!checks.some((c) => c instanceof RegExp ? c.test(unescaped) : c === unescaped)) {
            throw new ConstraintError(
              `Value for field "${condition.field}" does not meet any allowed value/pattern. Allowed values/patterns: ${checks.join(', ')}`,
              ctx?.tokens,
              ctx?.startToken,
              ctx?.startIndex,
              ctx?.endToken,
              ctx?.endIndex
            )
          }
        }
      }

      validated = true
    }

    if (operationType === 'array' && !Array.isArray(condition.value)) throw new ConstraintError(`Value "${condition.value.toString()}" is not permitted for "${condition.operation}" which expects an array`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)
    else if (operationType !== 'array' && Array.isArray(condition.value)) throw new ConstraintError(`Value "${condition.value.toString()}" is not permitted for "${condition.operation}" which expects a non-array value`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)

    // Employ type coercion and see if the type works
    // Mutate
    for (let i = 0; i < processedValues.length; ++i) {
      const v = processedValues[i]!

      let opTypes: FieldType[]
      if (valueIsImplicit) opTypes = ['boolean']
      else {
        switch (operationType) {
          case 'primitive':
          case 'array':
            opTypes = ['boolean', 'number', 'string']
            if (types?.includes('date')) opTypes.push('date')
            break
          case 'numeric':
            opTypes = ['number']
            if (types?.includes('date')) opTypes.push('date')
            break
          case 'string': opTypes = ['string']; break
        }
      }

      try {
        const value = this.coerceType(v, types ?? opTypes, opTypes)
        if (Array.isArray(condition.value)) (condition.value[i] as Primitive) = value
        else (condition.value as Primitive) = value
      } catch (err) {
        switch ((err as Error).message) {
          case 'operator': throw new ConstraintError(`Value "${condition.value.toString()}" not allowed for operation "${condition.operation}" which only allows for "${operationType}" type`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)
          case 'field': throw new ConstraintError(`Value "${condition.value.toString()}" includes a type not permitted for field "${condition.field}". Allowed types: ${(types ?? opTypes).join(', ')}`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)
        }
      }
    }
    if (types) validated = true

    // Mutate
    const edit = condition as ReturnType<typeof this.validateCondition>
    edit.field = field
    edit.validated = validated
    return edit
  }

  /**
   *
   * @param tokens
   * @param _offset
   */
  protected _parse (tokens: Token[], _offset: number): Expression<ConvertTypeRecord<T>, O, V> | null {
    type TypedExpression = Expression<ConvertTypeRecord<T>, O, V>
    let field: {
      content: string
      token: Token
      index: number
    } | undefined
    let comparisonOperation: {
      content: ComparisonOperators<O>
      token?: Token
      index?: number
    } | undefined
    let value: {
      content: string | string[]
      token?: Token
      index?: number
      implicit?: boolean
    } | undefined
    let inConjunction = false

    let groupOperation: JunctionOperators<O> | undefined
    let expectingExpression = true
    const expressions: TypedExpression[] = []

    /**
     * Get the expression group to push to (local or a subgroup for inConjunction)
     * @warn You probably need to set inConjunction to false after using this
     * @param                       ctx Error context
     * @returns                         The group to push to
     * @throws  {ParseError<false>}
     */
    const getExpressionGroup = (ctx?: Context): TypedExpression[] => {
      if (inConjunction) {
        const prior = expressions.at(-1)
        if (!prior) throw new ParseError('Unexpected: Expression list empty when parser is meant to append to an AND group', ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)
        if (prior.type !== 'group' || prior.operation !== 'AND') throw new ParseError('Unexpected: Last expression is not an AND group yet parser thinks it\'s appending to one', ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)

        return prior.constituents
      } return expressions
    }

    /**
     * Resolve a condition from the defined variables
     * @throws {ParseError<false> | ConstraintError}
     */
    const resolveCondition = (ctx?: Context): void => {
      const baseCtx = {
        tokens,
        startToken: field?.token ?? comparisonOperation?.token ?? value?.token,
        startIndex: field?.index ?? comparisonOperation?.index ?? value?.index,
        endToken: value?.token ?? comparisonOperation?.token ?? field?.token,
        endIndex: value?.index ?? comparisonOperation?.index ?? field?.index
      }
      if (!ctx) ctx = baseCtx

      const group = getExpressionGroup(ctx)

      if (field && comparisonOperation && value) {
        if (!expectingExpression) throw new ParseError('Unexpected expression resolution before junctive operator', ctx.tokens, ctx.startToken, ctx.startIndex, ctx.endToken, ctx.endIndex)

        group.push(this.validateCondition({
          type: 'condition',
          field: field.content,
          operation: comparisonOperation.content,
          value: value.content
        }, value.implicit, baseCtx))
        inConjunction = false
        expectingExpression = false
      } else if (field && !comparisonOperation && !value) {
        if (!expectingExpression) throw new ParseError('Unexpected expression resolution before junctive operator', ctx.tokens, ctx.startToken, ctx.startIndex, ctx.endToken, ctx.endIndex)

        // TODO: allow passing of implicit operator (if required)
        group.push(this.validateCondition({
          type: 'condition',
          field: field.content,
          operation: 'EQUAL',
          value: 'true'
        }, true, baseCtx))
        inConjunction = false
        expectingExpression = false
      } else if (field || comparisonOperation || value !== undefined) throw new ParseError('Failed to resolve condition; missing operand or operator', ctx.tokens, ctx.startToken, ctx.startIndex, ctx.endToken, ctx.endIndex)

      field = undefined
      comparisonOperation = undefined
      value = undefined
    }

    for (let t = 0; t < tokens.length; ++t) {
      const token = tokens[t]!

      if (WizardParser.GROUP_PARENS.some(([, c]) => token.content === c)) throw new ParseError('Unexpected closing parenthesis', tokens, token, _offset + t)
      if (WizardParser.ARRAY_BRACKETS.some(([, c]) => token.content === c)) throw new ParseError('Unexpected closing bracket/brace', tokens, token, _offset + t)

      const paren = WizardParser.GROUP_PARENS.find(([o]) => token.content === o)
      if (paren) {
        if (field || comparisonOperation || value) throw new ParseError('Tried to open a group during an operation', tokens, token, _offset + t)

        const closingIndex = WizardParser.getClosingIndex(tokens, t, paren[0], paren[1])
        if (closingIndex === -1) throw new ParseError('Missing closing parenthesis for group', tokens, token, _offset + t)
        ++t

        const subExpression = this._parse(tokens.slice(t, closingIndex), _offset + t)
        // Simplification
        if (subExpression) {
          if (subExpression.type === 'group' && subExpression.operation === groupOperation) expressions.push(...subExpression.constituents)
          else {
            const group = getExpressionGroup({ tokens, startToken: token, startIndex: _offset + t })
            group.push(subExpression)
            inConjunction = false
          }
        }

        t = closingIndex
        continue
      }

      const op = this.OPERATION_DICTIONARY[token.content]

      if (op?.type === 'junction') {
        resolveCondition({
          tokens,
          startToken: field?.token ?? token,
          startIndex: field?.index ?? _offset + t,
          endToken: token,
          endIndex: _offset + t
        })

        const prior = expressions.at(-1)
        if (!prior) throw new ParseError('Unexpected junction operator with no preceding expression', tokens, token, _offset + t)

        expectingExpression = true
        if (groupOperation && groupOperation !== op.name) {
          if (expressions.length < 2) throw new ParseError('Unexpected junction operator with no preceding expression', tokens, token, _offset + t)

          switch (groupOperation) {
            case 'AND': { // assume op = OR
              const futureSubgroup = this._parse(tokens.slice(t + 1), _offset + t)
              if (futureSubgroup === null) throw new ParseError('Dangling junction operator', tokens, token, _offset + t)

              return { // End for loop here
                type: 'group',
                operation: 'OR' as JunctionOperation<O>,
                constituents: [
                  {
                    type: 'group',
                    operation: 'AND' as JunctionOperation<O>,
                    constituents: expressions
                  },
                  futureSubgroup
                ]
              }
            }
            case 'OR': // assume op = AND
              inConjunction = true

              if (prior.type === 'group' && prior.operation === 'AND') continue

              expressions.splice(-1, 1)
              expressions.push({
                type: 'group',
                operation: 'AND' as JunctionOperation<O>,
                constituents: [
                  prior
                ]
              })

              continue
          }
        }

        groupOperation = op.name as JunctionOperators<O>
        // Simplification
        if (expressions.length === 1 && expressions[0]?.type === 'group' && expressions[0].operation === groupOperation) {
          const exp = expressions[0]
          expressions.splice(0, 1)

          expressions.push(...exp.constituents)
        }

        continue
      }

      if (WizardParser.NEGATORS.includes(token.content)) {
        const nextToken = tokens[t + 1]

        const nextParen = WizardParser.GROUP_PARENS.find(([o]) => nextToken?.content === o)
        if (nextParen) {
          resolveCondition({
            tokens,
            startToken: (field?.token ?? token),
            startIndex: field?.index ?? _offset + t,
            endToken: (value?.token ?? comparisonOperation?.token ?? field?.token),
            endIndex: (value?.index ?? comparisonOperation?.index ?? field?.index)!
          })

          ++t

          const closingIndex = WizardParser.getClosingIndex(tokens, t, nextParen[0], nextParen[1])
          if (closingIndex === -1) throw new ParseError('Missing closing parenthesis for group', tokens, token, _offset + t)

          ++t

          const futureSubExpression = this._parse(tokens.slice(t, closingIndex), _offset + t)
          if (futureSubExpression) {
            this.complementExpression(futureSubExpression)

            // Simplification
            if (futureSubExpression.type === 'group' && futureSubExpression.operation === groupOperation) expressions.push(...futureSubExpression.constituents)
            else {
              const group = getExpressionGroup({
                tokens,
                startToken: token,
                startIndex: _offset + t,
                endToken: tokens[closingIndex],
                endIndex: closingIndex
              })
              group.push(futureSubExpression)
              inConjunction = false
            }
          }

          t = closingIndex

          continue
        }
      }

      if (!comparisonOperation || op) {
        if (op) {
          if (comparisonOperation || !field) throw new ParseError('Unexpected comparison operator', tokens, field?.token ?? token, field?.index ?? _offset + t, token, _offset + t)

          comparisonOperation = {
            content: op.name as ComparisonOperators<O>,
            token,
            index: _offset + t
          }

          continue
        } else if (field) throw new ParseError('Expected a comparison operator', tokens, field.token, field.index, token, _offset + t)
      }

      if (!field) {
        if (WizardParser.NEGATORS.includes(token.content)) {
          const nextToken = tokens[t + 1]
          const equalOpType = this.OPERATION_DICTIONARY.EQUAL?.type
          if (!nextToken || !equalOpType || !['primitive', 'boolean'].includes(equalOpType)) throw new ParseError('Unexpected "!"', tokens, token, _offset + t)

          resolveCondition({
            tokens,
            startToken: token,
            startIndex: _offset + t,
            endToken: nextToken,
            endIndex: _offset + t + 1
          })

          ++t

          field = {
            content: nextToken.content,
            token,
            index: _offset + t
          }
          comparisonOperation = {
            content: 'EQUAL' as ComparisonOperators<O>
          }
          value = {
            content: 'false',
            implicit: true
          }

          resolveCondition({
            tokens,
            startToken: field.token,
            startIndex: field.index,
            endToken: nextToken,
            endIndex: _offset + t
          })
        } else {
          field = {
            content: token.content,
            token,
            index: _offset + t
          }
        }

        continue
      }

      if (!value) {
        const bracket = WizardParser.ARRAY_BRACKETS.find(([o]) => token.content === o)
        if (bracket) {
          const closingIndex = WizardParser.getClosingIndex(tokens, t, bracket[0], bracket[1])
          if (closingIndex === -1) throw new ParseError('Missing closing bracket/brace for array value', tokens, token, _offset + t)

          ++t

          const arr: string[] = []
          value = {
            content: arr,
            token: tokens[closingIndex],
            index: closingIndex
          }
          const arrayContents = tokens.slice(t, closingIndex)

          let workingEntry = ''
          let firstEntryToken: Token | undefined
          let firstEntryTokenIndex: number | undefined
          let lastEntryToken: Token | undefined
          let lastEntryTokenIndex: number | undefined

          const resolveEntry = (subtoken: Token, subindex: number): void => {
            if (workingEntry) {
              const subquotes = workingEntry.match(this.QUOTE_REGEX)
              if (subquotes && (subquotes.index !== 0 || subquotes[0].length !== workingEntry.length)) throw new ParseError('Quotes must surround entire values in arrays', tokens, firstEntryToken ?? subtoken, firstEntryTokenIndex ?? subindex, lastEntryToken ?? subtoken, lastEntryTokenIndex ?? subindex)

              arr.push(workingEntry)
              workingEntry = ''
              firstEntryToken = undefined
              firstEntryTokenIndex = undefined
              lastEntryToken = undefined
              lastEntryTokenIndex = undefined
            }
          }

          for (let ct = 0; ct < arrayContents.length; ++ct) {
            const contentToken = arrayContents[ct]!

            if (WizardParser.ARRAY_DELIMITERS.includes(contentToken.content)) {
              if (!workingEntry) throw new ParseError('Unexpected blank entry in array', tokens, contentToken, _offset + t + ct)

              resolveEntry(contentToken, _offset + t + ct)
            } else {
              lastEntryToken = contentToken
              lastEntryTokenIndex = _offset + t + ct
              if (!firstEntryToken) firstEntryToken = lastEntryToken
              if (!firstEntryTokenIndex) firstEntryTokenIndex = lastEntryTokenIndex
              workingEntry += contentToken.content
            }
          }
          resolveEntry(arrayContents.at(-1)!, _offset + t + arrayContents.length - 1)

          if (!arr.length) {
            throw new ParseError('Empty array provided as value', tokens, token, _offset + t - 1, tokens[closingIndex], _offset + closingIndex)
          }

          t = closingIndex
        } else {
          value = {
            content: token.content,
            token,
            index: _offset + t
          }
        }

        resolveCondition({
          tokens,
          startToken: field.token,
          startIndex: field.index,
          endToken: value.token ?? comparisonOperation?.token ?? field.token,
          endIndex: value.index ?? comparisonOperation?.index ?? field.index
        })
      }
    }

    resolveCondition({
      tokens,
      startToken: field?.token,
      startIndex: field?.index,
      endToken: value?.token ?? comparisonOperation?.token ?? field?.token,
      endIndex: value?.index ?? comparisonOperation?.index ?? field?.index
    })

    if (inConjunction) throw new ParseError('Dangling junction operator', tokens, tokens.at(-1), _offset + tokens.length - 1)

    if (groupOperation) {
      if (expressions.length === 1) throw new ParseError('Dangling junction operator', tokens, tokens.at(-1), _offset + tokens.length - 1)

      return {
        type: 'group',
        operation: groupOperation,
        constituents: expressions
      }
    } else if (expressions.length > 1) throw new ParseError('Group possesses multiple conditions without disjunctive operators', tokens, tokens[0], _offset)
    else return expressions[0] ?? null
  }

  /**
   *
   * @param expression
   */
  parse (expression: string | string[] | Token[]): Expression<ConvertTypeRecord<T>, O, V> | null {
    let tokens: Token[]

    if (Array.isArray(expression)) {
      tokens = []

      let type: 'string' | 'object' | undefined
      for (let t = 0; t < expression.length; ++t) {
        const token = expression[t]!

        if (!type) type = typeof token as 'object' | 'string'

        // eslint-disable-next-line valid-typeof
        if (typeof token !== type) console.warn('WizardQL: parse was called with a mixed array of string tokens and token objects')

        tokens.push(typeof token === 'string' ? { content: token, index: type === 'string' ? t : -1 } : token)
      }
    } else tokens = this.tokenize(expression)

    return this._parse(tokens, 0)
  }
}

const parser = new WizardParser({
  operators: {
    FOO: {
      negationName: 'BOO',
      type: 'number'
    },
    ERM: {
      type: 'junction',
      negationName: 'SIGMA'
    }
  }
})

const parsed = parser.parse('bruh foo bar erm poop boo lmao')
console.log(parsed)
