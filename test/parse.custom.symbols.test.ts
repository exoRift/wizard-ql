import { test, expect } from 'bun:test'

import { WizardParser } from '../src'

test('parsing with custom symbols', () => {
  const defaultParser = new WizardParser()

  const customParser = new WizardParser({
    symbols: {
      groupBrackets: [['{', '}'], ['#', '$']], // Same symbol for both
      arrayBrackets: [['%', '@']], // Same symbol for both
      arrayDelimiters: [';'],
      negators: ['*'],
      quotes: ['!']
    }
  })

  const defaultStatement = '!(foo or bar) && (baz in [1, 2,3, "4"])'
  const customStatement = '*{foo or bar} && #baz in %1; 2;3; !4!@$'

  expect(customParser.parse(customStatement), 'custom statement matches default statement structurally').toEqual(defaultParser.parse(defaultStatement))
})

test('operators contain symbols', () => {
  expect(() => new WizardParser({
    symbols: {
      quotes: ['|']
    }
  }), 'symbol definition').toThrow()

  expect(() => new WizardParser({
    operators: {
      '!': {
        negationName: '!!',
        type: 'number'
      }
    }
  }), 'operator definition').toThrow()
})

test('symbols reused', () => {
  expect(() => new WizardParser({
    symbols: {
      negators: ['!'],
      quotes: ['!']
    }
  }), 'use same symbol in quotes and negators').toThrow()
})

test('brackets don\'t equal each other', () => {
  expect(() => new WizardParser({
    symbols: {
      arrayBrackets: [['%', '%']]
    }
  }), 'array brackets are equal').toThrow()
})
