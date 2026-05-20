import { expect, test } from 'bun:test'

import { WizardParser } from '../src/parser'
import { ConstraintError } from '../src/errors'

test('custom operators', () => {
  const parser = new WizardParser({
    operators: {
      ALL: {
        negationName: 'ANY',
        type: 'productjunction'
      },
      SAME: {
        negationName: 'DIFFERENT',
        type: 'primitive',
        aliases: ['='],
        negationAliases: ['!=']
      },
      HAS: {
        negationName: 'LACKS',
        type: 'array',
        aliases: [':'],
        negationAliases: ['!:']
      },
      ON: {
        negationName: 'NOTON',
        type: 'date'
      },
      MULTIPLY: {
        negationName: 'DIVIDE',
        type: 'number'
      }
    }
  })

  expect(parser.parse('foo SAME bar ALL baz HAS [one, two]'), 'primitive operators').toEqual({
    type: 'group',
    operation: 'ALL',
    constituents: [
      {
        type: 'condition',
        field: 'foo',
        operation: 'SAME',
        value: 'bar',
        validated: false
      },
      {
        type: 'condition',
        field: 'baz',
        operation: 'HAS',
        value: ['one', 'two'],
        validated: false
      }
    ]
  })

  expect(() => parser.parse('foo ON string'), 'fails custom type').toThrow(ConstraintError)
  expect(parser.parse('foo ON 2026-05-12'), 'succeeds custom type').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'ON',
    value: new Date('2026-05-12'),
    validated: false
  })

  expect(parser.parse('!(foo ON 2026-05-12)'), 'successful negation').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'NOTON',
    value: new Date('2026-05-12'),
    validated: false
  })
})

test('custom implicit condition', () => {
  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      }
    },
    implicitCondition: {
      operator: 'BAR',
      value: '1234',
      asType: 'number'
    }
  })

  expect(parser.parse('field'), 'custom implicit').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'BAR',
    value: 1234,
    validated: false
  })

  expect(() => new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      }
    }
  }).parse('baz'), 'missing implicit definition').toThrow('Failed to resolve condition; missing operand or operator (No implicit condition is configured)')

  expect(() => new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      }
    }
  }).parse('!baz'), 'missing implicit definition').toThrow('Could not attempt a negative implicit condition as one is not defined in the config')
})

test('mixed product junction operators', () => {
  const parser = new WizardParser({
    operators: {
      ALL: {
        negationName: 'ANY',
        type: 'productjunction'
      },
      AND: {
        negationName: 'OR',
        type: 'productjunction'
      },
      SAME: {
        negationName: 'DIFFERENT',
        type: 'primitive',
        aliases: ['='],
        negationAliases: ['!=']
      },
      HAS: {
        negationName: 'LACKS',
        type: 'array',
        aliases: [':'],
        negationAliases: ['!:']
      }
    }
  })

  expect(() => parser.parse('foo SAME bar ALL baz HAS [one, two] AND foo')).toThrow('Mixed two junction operators of the same precedence level. Unclear how to separate without grouping')

  expect(parser.parse('foo SAME bar ALL baz = foobar ANY foo SAME bar AND lorem DIFFERENT ipsum'), 'valid mixing').toEqual({
    type: 'group',
    operation: 'ANY',
    constituents: [
      {
        type: 'group',
        operation: 'ALL',
        constituents: [
          {
            type: 'condition',
            field: 'foo',
            operation: 'SAME',
            value: 'bar',
            validated: false
          },
          {
            type: 'condition',
            field: 'baz',
            operation: 'SAME',
            value: 'foobar',
            validated: false
          }
        ]
      },
      {
        type: 'group',
        operation: 'AND',
        constituents: [
          {
            type: 'condition',
            field: 'foo',
            operation: 'SAME',
            value: 'bar',
            validated: false
          },
          {
            type: 'condition',
            field: 'lorem',
            operation: 'DIFFERENT',
            value: 'ipsum',
            validated: false
          }
        ]
      }
    ]
  })
})

test('mismatched implicit type', () => {
  const parser = new WizardParser({
    implicitCondition: {
      operator: 'LESS',
      value: '0',
      asType: 'number'
    },
    types: {
      stringfield: 'string'
    }
  })

  expect(() => parser.parse('stringfield')).toThrow(ConstraintError)
})
