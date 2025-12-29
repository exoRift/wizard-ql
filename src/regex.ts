import { ALIASES, PARENS, QUOTES, BRACKETS, NEGATORS, ARRAY_DELIMITERS } from './spec'

// Exclude odd numbers of escapes
export const ESCAPE_REGEX = '(?<=(?<!\\\\)(?:\\\\\\\\)*)'

/**
 * Create a Regex to look for quotes
 * @returns The regular expression
 */
export function createQuoteRegexString (quotes: string[]): string {
  return `${ESCAPE_REGEX}(?<quote>${quotes.map((q) => RegExp.escape(q)).join('|')})(?<quotecontent>.*?)${ESCAPE_REGEX}\\k<quote>`
}

export function createArrayDelimitRegexString (quotes: string[], delimiters: string[]): string {
  return `${createQuoteRegexString(quotes)}|${ESCAPE_REGEX}(?:${delimiters.map((d) => RegExp.escape(d)).join('|')})`
}

/**
 * Create a Regex to find tokens
 * @returns The regular expression
 */
export function createTokenRegexString (keywords: string[], quotes: string[]): string {
  const QUOTE_REGEX_STR = createQuoteRegexString(quotes)

  const tokens = /* operators
    .concat(parens.flat())
    .concat(brackets.flat())
    .concat(negatorss)
    .concat(delimiters) */keywords
    .sort((a, b) => a.length - b.length)
    .map((alias) => {
      let isAlpha = true
      for (let c = 0; c < alias.length; ++c) {
        const char = alias.charCodeAt(c)
        if (char < 65 || char > 90) {
          isAlpha = false
          break
        }
      }

      const escaped = RegExp.escape(alias)

      return isAlpha
        ? `(?<=${ESCAPE_REGEX}\\s|^)${escaped}(?=${ESCAPE_REGEX}\\s|$)`
        : `${ESCAPE_REGEX}${escaped}`
    })

  const full = `${QUOTE_REGEX_STR}|${tokens.join('|')}`

  return full
}
