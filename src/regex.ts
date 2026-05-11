// Exclude odd numbers of escapes
export const ESCAPE_REGEX = '(?<=(?<!\\\\)(?:\\\\\\\\)*)'

const NO_ESCAPE_ERROR = new Error('Your JS runtime version does not include RegExp.escape(). Please update or use a polyfill')

/**
 * Create a Regex to look for quotes
 * @returns The regular expression
 */
export function createQuoteRegexString (quotes: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!RegExp.escape) throw NO_ESCAPE_ERROR

  return `${ESCAPE_REGEX}(?<quote>${quotes.map((q) => RegExp.escape(q)).join('|')})(?<quotecontent>.*?)${ESCAPE_REGEX}\\k<quote>`
}

export function createArrayDelimitRegexString (quotes: string[], delimiters: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!RegExp.escape) throw NO_ESCAPE_ERROR

  return `${createQuoteRegexString(quotes)}|${ESCAPE_REGEX}(?:${delimiters.map((d) => RegExp.escape(d)).join('|')})`
}

/**
 * Create a Regex to find tokens
 * @returns The regular expression
 */
export function createTokenRegexString (keywords: string[], quotes: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!RegExp.escape) throw NO_ESCAPE_ERROR

  const QUOTE_REGEX_STR = createQuoteRegexString(quotes)

  const tokens = keywords
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
