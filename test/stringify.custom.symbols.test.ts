import { test, expect } from 'bun:test'

import { WizardParser } from '../src'

test('stringifying with custom symbols', () => {
  const customParser = new WizardParser({
    symbols: {
      groupBrackets: [['{', '}'], ['#', '$']],
      arrayBrackets: [['%', '@']],
      arrayDelimiters: [';'],
      negators: ['*'],
      quotes: ['+']
    }
  })

  const customStatement = '*{foo and bar} && #baz in %1; 2;3; +4+@$'

  expect(customParser.stringify(customParser.parse(customStatement)!, { dialect: 'programmatic', condenseImplicit: true }), 'stringified statement has the custom symbols')
    .toBe('{*foo | *bar} & baz : %1; 2; 3; +4+@')
})
