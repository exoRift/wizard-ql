import { createArrayDelimitRegexString, createQuoteRegexString, createTokenRegexString } from './regex'
import type { Token } from './spec'

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

class WizardParser<const T extends FieldTypeRecord, const O extends OperatorRecord = typeof WizardParser.DEFAULT_OPERATORS, const V extends boolean = false, const D extends string = 'DEFAULTDIALECTS'> {
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

  protected readonly TOKEN_REGEX: RegExp
  protected readonly QUOTE_REGEX: RegExp
  protected readonly QUOTE_EDGE_REGEX: RegExp
  protected readonly ARRAY_DELIMITER_REGEX: RegExp

  constructor (config: WizardParserConfig<T, O, V, D> = {}) {
    this.CONFIG = config

    if (!config.operators) config.operators = WizardParser.DEFAULT_OPERATORS as any

    this.OPERATION_DICTIONARY = {}
    this.OPERATION_DICTIONARY = {}
    // this.DIALECT_DICTIONARY = {}
    for (const operationName in config.operators) {
      const operation = config.operators[operationName as keyof typeof config.operators] as OperatorRecordEntry<Uppercase<string>>

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
}
