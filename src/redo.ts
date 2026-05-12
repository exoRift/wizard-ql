import { ConstraintError, ParseError } from './errors'
import { createArrayDelimitRegexString, createQuoteRegexString, createTokenRegexString, ESCAPE_REGEX } from './regex'
import type { Token } from './spec'

type FieldType = 'boolean' | 'string' | 'number' | 'date'
type ConditionOperatorComparisonType = 'primitive' | 'boolean' | 'string' | 'number' | 'date' | 'numeric' | 'array'
type JunctionOperatorType = 'sumjunction' | 'productjunction'
type OperatorType = JunctionOperatorType | ConditionOperatorComparisonType

type FieldTypeRecord = Record<string, FieldType | FieldType[]>
type OperatorRecord = Record<Uppercase<string>, OperatorRecordEntry>

interface InternalOperatorDefinition<O extends OperatorRecord> {
  name: GetOperators<O>
  negation: GetOperators<O>
  type: OperatorType
}

interface OperatorRecordEntry {
  negationName: Uppercase<string>
  type: OperatorType
  aliases?: ReadonlyArray<Uppercase<string>>
  negationAliases?: ReadonlyArray<Uppercase<string>>
}

type GetConditionOperators<O extends OperatorRecord> = string & {
  [K in keyof O]: O[K] extends OperatorRecordEntry
    ? O[K] extends { type: JunctionOperatorType }
      ? never
      : K | O[K]['negationName']
    : never
}[keyof O]

type GetJunctionOperators<O extends OperatorRecord> = string & {
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

type GetConditionTSType<T extends ConditionOperatorComparisonType> = {
  primitive: Primitive
  boolean: boolean
  string: string
  number: number
  date: Date
  numeric: number | Date
  array: Primitive[]
}[T]

interface CheckedCondition<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord, I extends keyof F = keyof F, P extends GetConditionOperators<O> = GetConditionOperators<O>> {
  type: 'condition'
  operation: P
  field: I
  value: GetOperatorDefinition<O, P>['type'] extends 'array'
    ? Array<GetFieldTSType<F[I]>>
    : Extract<GetConditionTSType<GetOperatorDefinition<O, P>['type'] & ConditionOperatorComparisonType>, GetFieldTSType<F[I]>>
  validated: true
}

interface UncheckedCondition<O extends OperatorRecord = OperatorRecord, P extends GetConditionOperators<O> = GetConditionOperators<O>> {
  type: 'condition'
  operation: P
  field: string
  value: GetOperatorDefinition<O, P>['type'] extends 'array'
    ? Primitive[]
    : GetConditionTSType<GetOperatorDefinition<O, P>['type'] & ConditionOperatorComparisonType>
  validated: false
}

interface Group<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord, V extends boolean = false> {
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

type Expression<F extends FieldTypeRecord = FieldTypeRecord, O extends OperatorRecord = OperatorRecord, V extends boolean = false> =
  Group<F, O, V>
  | (V extends true
    ? CheckedConditionSpread<F, O>
    : CheckedConditionSpread<F, O> | UncheckedConditionSpread<O>)

export const TYPE_PRIORITY = ['boolean', 'date', 'number', 'string'] as const satisfies FieldType[]

interface WizardParserConfig<F extends FieldTypeRecord, O extends OperatorRecord, out V extends boolean> {
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
  /**
   * The default operator and value (in string form) for an implicit condition (positive variant)\
   * Example: `field` or negative: `!field`\
   * The negative will be taken by taking the complement of the default condition\
   * By default, this is "EQUAL true". Thus, `field` -> `field EQUAL true` and `!field` -> `field NOTEQUAL true`
   */
  implicitCondition?: {
    operator: GetConditionOperators<O>
    value: string
  }

  dialects?: Record<string, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>
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

/**
 * A WizardQL parser instance
 */
export class WizardParser<const F extends FieldTypeRecord, const O extends OperatorRecord = typeof WizardParser.DEFAULT_OPERATORS, V extends boolean = false> {
  static readonly DEFAULT_OPERATORS = {
    AND: {
      negationName: 'OR',
      type: 'productjunction',
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
      negationName: 'NOTMATCH',
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

  protected readonly OPERATION_DICTIONARY: Record<GetOperators<O>, InternalOperatorDefinition<O>> & Partial<Record<string, InternalOperatorDefinition<O>>>
  // protected readonly DIALECT_DICTIONARY: Record<D, Record<(keyof O | (O[keyof O] extends { negationName: infer N } ? N : never)) & string, string>>

  protected readonly CONFIG: WizardParserConfig<F, O, V>

  protected readonly TOKEN_REGEX: RegExp
  protected readonly QUOTE_REGEX: RegExp
  protected readonly QUOTE_EDGE_REGEX: RegExp
  protected readonly ARRAY_DELIMITER_REGEX: RegExp

  /**
   * Construct a WizardQL parser
   * @param config The parser configuration
   */
  constructor (config: WizardParserConfig<F, O, V> = {}) {
    this.CONFIG = config

    if (!config.operators) {
      config.operators = WizardParser.DEFAULT_OPERATORS as any

      if (!config.implicitCondition) {
        config.implicitCondition = {
          operator: 'EQUAL',
          value: true
        } as any
      }
    }

    this.OPERATION_DICTIONARY = {} as any
    this.OPERATION_DICTIONARY = {} as any
    // this.DIALECT_DICTIONARY = {}
    for (const operationName in config.operators) {
      const operation = config.operators[operationName] as OperatorRecordEntry

      const opDef = {
        name: operationName,
        type: operation.type,
        negation: operation.negationName
      } as unknown as InternalOperatorDefinition<O>
      const negOpDef = {
        name: operation.negationName,
        type: operation.type,
        negation: operationName
      } as unknown as InternalOperatorDefinition<O>

      if (operationName in this.OPERATION_DICTIONARY) throw Error(`Two operator definitions have been supplied with the same name "${operationName}"`)
      this.OPERATION_DICTIONARY[opDef.name] = opDef

      if (operation.negationName in this.OPERATION_DICTIONARY) throw Error(`An operator definition shares a negation name with another operator's definition "${operation.negationName}"`)
      this.OPERATION_DICTIONARY[negOpDef.name] = negOpDef

      if (operation.aliases) {
        for (const alias of operation.aliases) {
          if (alias in this.OPERATION_DICTIONARY) throw Error(`An operator definition has an alias that refers to another operator "${alias}"`)
          this.OPERATION_DICTIONARY[alias as GetOperators<O>] = opDef
        }
      }

      if (operation.negationAliases) {
        for (const alias of operation.negationAliases) {
          if (alias in this.OPERATION_DICTIONARY) throw Error(`An operator definition has a negation alias that refers to another operator "${alias}"`)
          this.OPERATION_DICTIONARY[alias as GetOperators<O>] = negOpDef
        }
      }
    }

    // TODO
    // if (config.dialects) this.DIALECT_DICTIONARY = structuredClone(config.dialects)
    // else this.DIALECT_DICTIONARY = {} as any

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
   * Given an input, parse a date using the provided parse function or the default method
   * @param v The input to parse
   * @returns The date value
   */
  protected interpretDate (v: string | number): Date {
    if (this.CONFIG.dateInterpreter) return this.CONFIG.dateInterpreter(v)
    else return new Date(v)
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
  protected complementExpression (expression: Expression<F, O, V>): void {
    const inverse = this.OPERATION_DICTIONARY[expression.operation].negation
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
   * @param                     valueIsImplicit Was this value implicitly inferred? If so, don't attempt stringification
   * @param                     ctx             Error Context
   * @throws  {ConstraintError}
   * @returns                                   The same reference to the condition
   */
  protected validateCondition (condition: Omit<UncheckedCondition<O>, 'validated' | 'value'> & { value: string | string[] }, valueIsImplicit?: boolean, ctx?: Context): Exclude<Expression<F, O, V>, Group<F, O, V>> {
    let validated = false
    condition.field = this.processToken(condition.field).unescaped
    const field = this.CONFIG.caseInsensitive
      ? [...Object.keys(this.CONFIG.types ?? {}), ...Object.keys(this.CONFIG.restricted ?? {})].find((k) => k.toLowerCase() === condition.field.toLowerCase()) ?? condition.field
      : condition.field
    const restriction = this.CONFIG.restricted?.[field]
    const type = this.CONFIG.types?.[field]

    if (this.CONFIG.disallowUnvalidated && restriction === undefined && type === undefined) throw new ConstraintError(`Unknown field "${condition.field}"`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)

    const operationType = this.OPERATION_DICTIONARY[condition.operation].type as ConditionOperatorComparisonType
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

    if (operationType === 'array' && !Array.isArray(condition.value)) throw new ConstraintError(`Value "${condition.value}" is not permitted for "${condition.operation}" which expects an array`, ctx?.tokens, ctx?.startToken, ctx?.startIndex, ctx?.endToken, ctx?.endIndex)
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
          // TODO: dbl check these
          case 'number': opTypes = ['number']; break
          case 'date': opTypes = ['date']; break
          case 'boolean': opTypes = ['boolean']; break
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
   * Parse tokens into an object expression
   * @param                                  tokens  The tokens to parse into an object expression
   * @param                                  _offset The token offset
   * @returns                                        An expression
   * @throws  {ParseError | ConstraintError}
   */
  protected _parse (tokens: Token[], _offset: number): Expression<F, O, V> | null {
      type TypedExpression = Expression<F, O, V>
      let field: {
        content: string
        token: Token
        index: number
      } | undefined
      let comparisonOperation: {
        content: GetConditionOperators<O>
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

      let activeGroupOperation: GetJunctionOperators<O> | undefined
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

          if (this.CONFIG.implicitCondition) {
            group.push(this.validateCondition({
              type: 'condition',
              field: field.content,
              operation: this.CONFIG.implicitCondition.operator,
              value: this.CONFIG.implicitCondition.value
            }, true, baseCtx))
            inConjunction = false
            expectingExpression = false
          } else throw new ParseError('Failed to resolve condition; missing operand or operator (No implicit condition is configured)', ctx.tokens, ctx.startToken, ctx.startIndex, ctx.endToken, ctx.endIndex)
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
            if (subExpression.type === 'group' && subExpression.operation === activeGroupOperation) expressions.push(...subExpression.constituents)
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

        if (op?.type === 'sumjunction' || op?.type === 'productjunction') {
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
          if (activeGroupOperation && activeGroupOperation !== op.name) {
            if (expressions.length < 2) throw new ParseError('Unexpected junction operator with no preceding expression', tokens, token, _offset + t)

            const activeGroupOperationType = this.OPERATION_DICTIONARY[activeGroupOperation].type
            if (activeGroupOperationType === op.type) throw new ParseError('Mixed two junction operators of the same precedence level. Unclear how to separate without grouping.', tokens, token, _offset + t)

            switch (op.type) {
              case 'productjunction': { // assume active type = sum
                const futureSubgroup = this._parse(tokens.slice(t + 1), _offset + t)
                if (futureSubgroup === null) throw new ParseError('Dangling junction operator', tokens, token, _offset + t)

                return { // End for loop here
                  type: 'group',
                  operation: activeGroupOperation,
                  constituents: [
                    {
                      type: 'group',
                      operation: op.name as GetJunctionOperators<O>, // UGLY: Why do we need to do this? We already checked op.type
                      constituents: expressions
                    },
                    futureSubgroup
                  ]
                }
              }
              case 'sumjunction': // assume active type = product
                inConjunction = true

                if (prior.type === 'group' && activeGroupOperationType === 'productjunction') continue

                expressions.splice(-1, 1)
                expressions.push({
                  type: 'group',
                  operation: activeGroupOperation,
                  constituents: [
                    prior
                  ]
                })

                continue
            }
          }

          activeGroupOperation = op.name as GetJunctionOperators<O>
          // Simplification
          if (expressions.length === 1 && expressions[0]?.type === 'group' && expressions[0].operation === activeGroupOperation) {
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
              if (futureSubExpression.type === 'group' && futureSubExpression.operation === activeGroupOperation) expressions.push(...futureSubExpression.constituents)
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
              content: op.name as GetConditionOperators<O>,
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
            // TODO: get implicit from config
            comparisonOperation = {
              content: 'EQUAL' as GetConditionOperators<O>
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

      if (activeGroupOperation) {
        if (expressions.length === 1) throw new ParseError('Dangling junction operator', tokens, tokens.at(-1), _offset + tokens.length - 1)

        return {
          type: 'group',
          operation: activeGroupOperation,
          constituents: expressions
        }
      } else if (expressions.length > 1) throw new ParseError('Group possesses multiple conditions without disjunctive operators', tokens, tokens[0], _offset)
      else return expressions[0] ?? null
  }

  /**
   * Parse a Wizard expression into its object form
   * @param                                  expression The Wizard expression as a string or as an array of tokens
   * @returns                                           The object representation
   * @throws  {ParseError | ConstraintError}
   */
  parse (expression: string | string[] | Token[]): Expression<F, O, V> | null {
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
