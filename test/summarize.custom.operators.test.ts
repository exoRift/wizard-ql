import { expect, test } from 'bun:test'

import { WizardParser } from '../src'

test('summarize with custom operators', () => {
  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      },
      EQUAL: {
        negationName: 'NOTEQUAL',
        type: 'date'
      },
      LOREM: {
        negationName: 'IPSUM',
        type: 'productjunction'
      }
    }
  })

  const parsed = parser.parse('field1 foo 456 lorem field1 bar 123 ipsum field2 equal 2026-05-14')
  if (!parsed) throw new Error('Unexpected null')
  const summary = parser.summarize(parsed)

  expect(summary, 'return type').toBeInstanceOf(Map)
  expect(Object.fromEntries(summary.entries()), 'summary value').toEqual({
    field1: [
      {
        operation: 'FOO',
        value: 456,
        exclusionary: false
      }, {
        operation: 'BAR',
        value: 123,
        exclusionary: true
      }
    ],
    field2: [
      {
        operation: 'EQUAL',
        value: new Date('2026-05-14'),
        exclusionary: false
      }
    ]
  })
})

test('mixed exclusionary definitions', () => {
  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number',
        exclusionary: true
      },
      EQUAL: {
        negationName: 'NOTEQUAL',
        type: 'date'
      },
      LOREM: {
        negationName: 'IPSUM',
        type: 'productjunction'
      }
    }
  })

  const parsed = parser.parse('field1 foo 456 lorem field1 bar 123 ipsum field2 equal 2026-05-14')
  if (!parsed) throw new Error('Unexpected null')
  const summary = parser.summarize(parsed)

  expect(summary, 'return type').toBeInstanceOf(Map)
  expect(Object.fromEntries(summary.entries()), 'summary value').toEqual({
    field1: [
      {
        operation: 'FOO',
        value: 456,
        exclusionary: true
      }, {
        operation: 'BAR',
        value: 123,
        exclusionary: false
      }
    ],
    field2: [
      {
        operation: 'EQUAL',
        value: new Date('2026-05-14'),
        exclusionary: false
      }
    ]
  })
})
