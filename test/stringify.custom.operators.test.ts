import { expect, test } from 'bun:test'
import { WizardParser } from '../src'

test('custom dialects', () => {
  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number',
        exclusionary: true
      },
      EQUAL: {
        negationName: 'NOTEQUAL',
        type: 'date',
        aliases: ['=']
      },
      LOREM: {
        negationName: 'IPSUM',
        type: 'productjunction'
      }
    },
    dialects: {
      animals: {
        BAR: 'cat',
        EQUAL: 'DOG',
        FOO: 'horSE',
        IPSUM: '||',
        LOREM: 'goose',
        NOTEQUAL: 'goat'
      }
    }
  })

  const parsed = parser.parse('field1 foo 123 lorem field2 bar 321 ipsum field3 = 2026-05-14')
  if (!parsed) throw new Error('Unexpected null')

  expect(parser.stringify(parsed, { dialect: 'animals', compact: true }), 'custom dialect').toBe('field1 horSE 123 goose field2 cat 321||field3 DOG 2026-05-14T00:00:00.000Z')
})

test('dialect errors', () => {
  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      }
    }
  })

  const parsed = parser.parse('field FOO 123')
  if (!parsed) throw new Error('Unexpected null')

  expect(() => parser.stringify(parsed, 'formal'), 'default dialect with custom operators').toThrow('No dialect dictionaries are defined in the config')

  const defaultParser = new WizardParser()

  const defaultParsed = defaultParser.parse('field FOO 123')
  if (!defaultParsed) throw new Error('Unexpected null')

  // @ts-expect-error
  expect(() => defaultParser.stringify(defaultParsed, 'unknown'), 'missing dialect').toThrow('Dialect \'unknown\' is not defined in the config')
})

test('condense implicit w/ implicit disabled', () => {
  const disabledParser = new WizardParser({ implicitCondition: false })

  const disabledParsed = disabledParser.parse('field = true')
  if (!disabledParsed) throw new Error('Unexpected null')

  expect(disabledParser.stringify(disabledParsed, { dialect: 'programmatic', condenseImplicit: true }), 'no implicit condition defined').toBe('field = true')
})

test('condense implicit w/ non-boolean value', () => {
  const parser = new WizardParser({
    implicitCondition: {
      operator: 'LESS',
      value: '0',
      asType: 'number'
    }
  })

  const parsed = parser.parse('foo < 0 | !(foo < 0) | foo >= 0 | !(foo >= 0)')
  if (!parsed) throw new Error('Unexpected null')

  expect(parser.stringify(parsed, { dialect: 'programmatic', condenseImplicit: true }), 'successful condensation').toBe('foo | !foo | !foo | foo')
})
