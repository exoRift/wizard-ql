/// <reference lib='dom' />
/// <reference lib='dom.iterable' />

import { WizardParser, type WizardParserConfig } from './parser'
import { ConstraintError, ParseError } from './errors'
import type { ClassifiedToken, FieldTypeRecord, OperatorRecord } from './spec'

interface DOMInputOptions<F extends FieldTypeRecord, O extends OperatorRecord, V extends boolean, D extends string> {
  input: HTMLElement
  config?: WizardParserConfig<F, O, V, D>
  onUpdate?: (expression: ReturnType<WizardParser<F, O, V, D>['parse']> | ParseError | ConstraintError, tokens: ClassifiedToken[], string: string) => void
  parseOnInitialize?: boolean
}

/**
 * Get the absolute index of the user's cursor in an element with multiple nodes
 * @returns The index
 */
function getCursorIndex (element: HTMLElement): number {
  const selection = window.getSelection()
  const cursorNode = selection?.anchorNode
  const cursorOffset = selection?.anchorOffset

  if (!cursorNode || !element.contains(cursorNode)) return -1

  let absoluteIndex = 0
  if (cursorOffset) {
    for (const node of element.childNodes) {
      if (node.contains(cursorNode)) {
        absoluteIndex += (node.textContent?.length ?? 0) - (cursorNode.textContent?.length ?? 0)
        absoluteIndex += cursorOffset
        break
      } else absoluteIndex += (node.textContent?.length ?? 0)
    }
  }

  return absoluteIndex
}

/**
 * Set the user's index within an element with multiple text nodes
 * @param element The element to focus
 * @param index   The index to set
 */
function setCursor (element: HTMLElement, index: number): void {
  const selection = window.getSelection()

  let accumulated = 0
  for (const node of element.childNodes) {
    const length = node.textContent?.length ?? 0

    if (accumulated + length >= index) {
      selection?.setPosition(index > 0 ? node.childNodes.item(0) : node, index - accumulated)
      break
    } else accumulated += length
  }
}

/**
 * Initialize an element to become a Wizard langugae input
 * @warn This is a DOM function that is not meant for the backend
 * @returns A destroy function (destroys listening and functionality, not the element)
 */
export function createDOMInput<const F extends FieldTypeRecord, const O extends OperatorRecord, const V extends boolean, const D extends string> ({ input, config, onUpdate, parseOnInitialize }: DOMInputOptions<F, O, V, D>): () => void {
  const parser = new WizardParser(config)
  const history: Array<{ text: string, cursor: number }> = []
  let historyIndex = -1

  let savedCursor: number | undefined
  function update (): void {
    const focused = input.contains(document.activeElement)

    const text = input.textContent!.replaceAll('\n', '')
    const endPadding = input.textContent?.match(/\s*$/)?.[0].length ?? 0

    const newTokens = parser.tokenize(text) as ClassifiedToken[]
    const lastToken = newTokens.at(-1)
    if (lastToken && parser.resolveOperatorAlias(lastToken.content) && focused && (!endPadding && lastToken.content.match(/^[A-Za-z]+?$/))) return

    const absoluteIndex = focused ? getCursorIndex(input) : 0

    observer.disconnect()
    let activeArrayOpeningBracket: string | undefined
    let offset = 0
    for (let t = 0; t < newTokens.length; ++t) { // Add new nodes
      const token = newTokens[t]!
      const prior = newTokens[t - 1]
      const differenceFromLast = prior ? token.index - (prior.index + prior.content.length) : token.index

      if (differenceFromLast > 0) {
        const spacer = document.createElement('span')
        spacer.textContent = ' '.repeat(differenceFromLast)
        spacer.classList.add('whitespace-pre')
        spacer.toggleAttribute('data-spacer', true)

        const existing = input.childNodes.item(t + offset) as ChildNode | null
        if (existing) input.replaceChild(spacer, existing)
        else input.appendChild(spacer)
        ++offset
      }

      const element = document.createElement('span')
      element.textContent = token.content
      element.toggleAttribute('data-node', true)
      const partType = parser.getPartType(token.content, activeArrayOpeningBracket)
      token.partType = partType

      switch (partType) {
        case 'quoted': element.toggleAttribute('data-quoted', true); break
        case 'number': element.toggleAttribute('data-number', true); break

        case 'openingarraybracket': activeArrayOpeningBracket = token.content
        // eslint-disable-next-line no-fallthrough
        case 'openinggroupbracket': element.setAttribute('data-bracket', token.content); break

        case 'closingarraybracket': activeArrayOpeningBracket = undefined
        // eslint-disable-next-line no-fallthrough
        case 'closinggroupbracket': element.setAttribute('data-bracket', token.content); break

        case 'arraydelimiter': element.toggleAttribute('data-delimiter', true); break
        case 'negator': element.toggleAttribute('data-negator', true); break
        case 'junctionoperator': element.setAttribute('data-operator', 'junction'); break
        case 'conditionoperator': element.setAttribute('data-operator', 'condition'); break
      }

      // if (token.content.match(QUOTE_EDGE_REGEX)) element.toggleAttribute('data-quoted', true)
      // if (!isNaN(Number(token.content))) element.toggleAttribute('data-number', true)
      // if (PARENS.concat(BRACKETS).some((entry) => entry.includes(token.content))) {
      //   if (activeArrayOpeningBracket && BRACKETS.some(([o, c]) => (activeArrayOpeningBracket === o && token.content === c))) activeArrayOpeningBracket = undefined
      //   if (!activeArrayOpeningBracket) element.setAttribute('data-bracket', token.content)
      //   if (!activeArrayOpeningBracket && BRACKETS.some(([o]) => o === token.content)) activeArrayOpeningBracket = token.content
      // }
      // if (activeArrayOpeningBracket && ARRAY_DELIMITERS.includes(token.content)) element.toggleAttribute('data-delimiter', true)
      // if (!activeArrayOpeningBracket && NEGATORS.includes(token.content)) element.toggleAttribute('data-negation', true)
      // if (!activeArrayOpeningBracket && token.content in OPERATION_ALIAS_DICTIONARY) {
      //   element.setAttribute('data-operation', OPERATION_PURPOSE_DICTIONARY[OPERATION_ALIAS_DICTIONARY[token.content as keyof typeof OPERATION_ALIAS_DICTIONARY]])
      // }

      const existing = input.childNodes.item(t + offset) as ChildNode | null
      if (existing) input.replaceChild(element, existing)
      else input.appendChild(element)
    }

    // Delete old extra nodes
    while (newTokens.length + offset < input.childNodes.length) input.lastChild?.remove()

    const last = input.lastElementChild
    if (last?.tagName === 'BR') last.remove()

    if (endPadding) {
      const spacer = document.createElement('span')
      spacer.textContent = ' '.repeat(endPadding)
      spacer.classList.add('whitespace-pre')
      spacer.toggleAttribute('data-spacer', true)
      input.appendChild(spacer)
    }

    observer.observe(input, { characterData: true, childList: true, subtree: true })

    if (focused) setCursor(input, savedCursor ?? absoluteIndex)
    savedCursor = undefined

    if (input.textContent && input.textContent !== history[historyIndex]?.text) {
      ++historyIndex
      history.splice(historyIndex, history.length - historyIndex, {
        text: input.textContent,
        cursor: absoluteIndex
      })
    }

    let result: ReturnType<WizardParser<F, O, V, D>['parse']> | ParseError | ConstraintError

    try {
      result = parser.parse(newTokens)
      input.removeAttribute('data-error-message')
      input.removeAttribute('data-error-start')
      input.removeAttribute('data-error-end')
    } catch (err) {
      if (err instanceof ParseError || err instanceof ConstraintError) {
        result = err
        input.setAttribute('data-error-message', err.rawMessage)
        input.setAttribute('data-error-start', err.startIndex!.toString())
        input.setAttribute('data-error-end', err.endIndex!.toString())

        const nodes = input.querySelectorAll('[data-node]')
        if (!nodes.length) return

        for (let n = 0; n < nodes.length; ++n) {
          const node = nodes.item(n)

          node.toggleAttribute('data-error', n >= err.startIndex! && n <= err.endIndex!)
        }
      } else {
        result = null
        if (err instanceof Error) input.setAttribute('data-error-message', err.message)
        input.removeAttribute('data-error-start')
        input.removeAttribute('data-error-end')
      }
    }
    onUpdate?.(result, newTokens, text)
  }

  const observer = new MutationObserver(update)

  function onKey (e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      input.blur()
    } else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation()
      e.preventDefault()
      historyIndex = Math.min(history.length - 1, Math.max(0, historyIndex + (e.shiftKey ? 1 : -1)))
      const prior = history[historyIndex]
      if (prior !== undefined) {
        savedCursor = prior.cursor
        input.replaceChildren(prior.text)
      }
    }
  }

  input.setAttribute('role', 'textbox')
  input.setAttribute('contenteditable', 'plaintext-only')
  input.setAttribute('spellcheck', 'false')
  input.addEventListener('keydown', onKey)
  input.addEventListener('blur', update, { passive: true })

  observer.observe(input, { characterData: true, childList: true, subtree: true })
  if (parseOnInitialize) update()
  return () => {
    observer.disconnect()
    input.removeEventListener('keydown', onKey)
    input.removeEventListener('blur', update)
  }
}
