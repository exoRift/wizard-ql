// Exclude odd numbers of escapes
export const ESCAPE_REGEX = '(?<=(?<!\\\\)(?:\\\\\\\\)*)'

const NO_ESCAPE_ERROR = new Error('Your JS runtime version does not include RegExp.escape(). Please update or use a polyfill')

/**
 * Create a Regex to look for quotes
 * @returns The regular expression
 */
export function createQuoteRegexString (quotes: readonly string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!RegExp.escape) throw NO_ESCAPE_ERROR

  return `${ESCAPE_REGEX}(?<quote>${quotes.map((q) => RegExp.escape(q)).join('|')})(?<quotecontent>.*?)${ESCAPE_REGEX}\\k<quote>`
}

export function createArrayDelimitRegexString (quotes: readonly string[], delimiters: readonly string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!RegExp.escape) throw NO_ESCAPE_ERROR

  return `${createQuoteRegexString(quotes)}|${ESCAPE_REGEX}(?:${delimiters.map((d) => RegExp.escape(d)).join('|')})`
}

/**
 * Check if a string is entirely alpha characters
 * @param text The text
 * @returns Whether the text is solely alpha or not
 */
export function isAlpha (text: string): boolean {
      for (let c = 0; c < text.length; ++c) {
        const char = text.charCodeAt(c)
        if (char < 65 || char > 90) return false
      }

      return true
}

/**
 * Create a Regex to find tokens
 * @returns The regular expression
 * @throws {Error} If the runtime does not have a RegExp.escape function
 */
export function createTokenRegexString (keywords: string[], quotes: readonly string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!RegExp.escape) throw NO_ESCAPE_ERROR

  const QUOTE_REGEX_STR = createQuoteRegexString(quotes)

  const tokens = keywords
    .sort((a, b) => b.length - a.length)
    .map((alias) => {
      const escaped = RegExp.escape(alias)

      return isAlpha(alias)
        ? `(?<=${ESCAPE_REGEX}\\s|^)${escaped}(?=${ESCAPE_REGEX}\\s|$)`
        : `${ESCAPE_REGEX}${escaped}`
    })

  const full = `${QUOTE_REGEX_STR}|${tokens.join('|')}`

  return full
}
