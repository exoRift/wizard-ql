import { test, expect } from 'bun:test'

import { WizardParser } from '../src/parser'

test('toplevel', () => {
  const parser = new WizardParser()

  const andExpr = parser.parse('foo & !bar and baz = "string" ^ baz != 42')
  expect(andExpr).not.toBe(null)

  expect(parser.summarize(andExpr!).entries().toArray(), 'ands').toEqual([
    ['foo', [
      {
        operation: 'EQUAL',
        value: true,
        exclusionary: false
      }
    ]],
    ['bar', [
      {
        operation: 'NOTEQUAL',
        value: true,
        exclusionary: true
      }
    ]],
    ['baz', [
      {
        operation: 'EQUAL',
        value: 'string',
        exclusionary: false
      },
      {
        operation: 'NOTEQUAL',
        value: 42,
        exclusionary: true
      }
    ]]
  ])

  const orExpr = parser.parse('foo || !bar or baz = "string" V baz != 42')
  expect(orExpr).not.toBe(null)

  expect(parser.summarize(orExpr!).entries().toArray(), 'ors').toEqual([
    ['foo', [
      {
        operation: 'EQUAL',
        value: true,
        exclusionary: false
      }
    ]],
    ['bar', [
      {
        operation: 'NOTEQUAL',
        value: true,
        exclusionary: true
      }
    ]],
    ['baz', [
      {
        operation: 'EQUAL',
        value: 'string',
        exclusionary: false
      },
      {
        operation: 'NOTEQUAL',
        value: 42,
        exclusionary: true
      }
    ]]
  ])
})

test('groups', () => {
  const parser = new WizardParser()

  const expr = parser.parse('(foo in [1, 2] and (bar = 2 or baz)) V (bar !: [1, 3] and foo = 3)')
  expect(expr).not.toBe(null)

  expect(parser.summarize(expr!).entries().toArray()).toEqual([
    ['foo', [
      {
        operation: 'IN',
        value: [1, 2],
        exclusionary: false
      },
      {
        operation: 'EQUAL',
        value: 3,
        exclusionary: false
      }
    ]],
    ['bar', [
      {
        operation: 'EQUAL',
        value: 2,
        exclusionary: false
      },
      {
        operation: 'NOTIN',
        value: [1, 3],
        exclusionary: true
      }
    ]],
    ['baz', [
      {
        operation: 'EQUAL',
        value: true,
        exclusionary: false
      }
    ]]
  ])
})

test('exclusionaries', () => {
  const parser = new WizardParser()

  const expr = parser.parse('foo geq 3 or foo leq 2 or foo !== 8 or foo = 7 || foo < 1 OR foo > 5 | foo in [10, 11] V foo notin [7, 8]')
  expect(expr).not.toBe(null)

  expect(parser.summarize(expr!).entries().toArray()).toEqual([
    ['foo', [
      {
        operation: 'GEQ',
        value: 3,
        exclusionary: false
      },
      {
        operation: 'LEQ',
        value: 2,
        exclusionary: false
      },
      {
        operation: 'NOTEQUAL',
        value: 8,
        exclusionary: true
      },
      {
        operation: 'EQUAL',
        value: 7,
        exclusionary: false
      },
      {
        operation: 'LESS',
        value: 1,
        exclusionary: true
      },
      {
        operation: 'GREATER',
        value: 5,
        exclusionary: true
      },
      {
        operation: 'IN',
        value: [10, 11],
        exclusionary: false
      },
      {
        operation: 'NOTIN',
        value: [7, 8],
        exclusionary: true
      }
    ]]
  ])
})
