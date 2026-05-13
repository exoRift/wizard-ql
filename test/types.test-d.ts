import { test } from 'bun:test'
import { expectType } from 'tsd'

import { WizardParser } from '../src'

test('default operators', () => {
  type DefaultCondition = {
    type: 'condition'
    operation: 'EQUAL'
    field: string
    value: string | number | boolean | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: string
    value: string | number | boolean | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'LESS'
    field: string
    value: number | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'GEQ'
    field: string
    value: number | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'GREATER'
    field: string
    value: number | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'LEQ'
    field: string
    value: number | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'IN'
    field: string
    value: Array<string | number | boolean | Date>
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTIN'
    field: string
    value: Array<string | number | boolean | Date>
    validated: true
  } | {
    type: 'condition'
    operation: 'MATCH'
    field: string
    value: string
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTMATCH'
    field: string
    value: string
    validated: true
  } | {
    type: 'condition'
    operation: 'EQUAL'
    field: string
    value: string | number | boolean | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: string
    value: string | number | boolean | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'LESS'
    field: string
    value: number | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'GEQ'
    field: string
    value: number | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'GREATER'
    field: string
    value: number | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'LEQ'
    field: string
    value: number | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'IN'
    field: string
    value: Array<string | number | boolean | Date>
    validated: false
  } | {
    type: 'condition'
    operation: 'NOTIN'
    field: string
    value: Array<string | number | boolean | Date>
    validated: false
  } | {
    type: 'condition'
    operation: 'MATCH'
    field: string
    value: string
    validated: false
  } | {
    type: 'condition'
    operation: 'NOTMATCH'
    field: string
    value: string
    validated: false
  }

  interface DefaultGroup {
    type: 'group'
    operation: 'AND' | 'OR'
    constituents: Array<DefaultGroup | DefaultCondition>
  }

  type DefaultExpression = DefaultGroup | DefaultCondition

  expectType<null | DefaultExpression>(new WizardParser().parse(''))
})

test.todo('custom operators', () => {

})

test.todo('operator failures', () => {

})

test.todo('custom field types', () => {

})

test.todo('invalid dialects', () => {

})
