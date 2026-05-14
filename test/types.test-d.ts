import { test } from 'bun:test'
import { expectError, expectType } from 'tsd'

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

test('custom operators', () => {
  type CustomCondition = {
    type: 'condition'
    operation: 'FOO'
    field: string
    value: number | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'BAR'
    field: string
    value: number | Date
    validated: false
  } | {
    type: 'condition'
    operation: 'FOO'
    field: string
    value: number | Date
    validated: true
  } | {
    type: 'condition'
    operation: 'BAR'
    field: string
    value: number | Date
    validated: true
  }

  interface CustomGroup {
    type: 'group'
    operation: 'LOREM' | 'IPSUM'
    constituents: Array<CustomCondition | CustomGroup>
  }

  type CustomExpression = CustomCondition | CustomGroup

  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        type: 'sumjunction',
        negationName: 'IPSUM'
      }
    }
  })

  expectType<CustomExpression | null>(parser.parse(''))
})

test('operator definition failures', () => {
  expectError(new WizardParser({
    operators: {
      FOO: {
        // @ts-expect-error
        negationName: 'FOO',
        type: 'numeric'
      },
      LOREM: {
        type: 'sumjunction',
        negationName: 'IPSUM'
      }
    }
  }))

  expectError(new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        type: 'sumjunction',
        // @ts-expect-error
        negationName: 'FOO'
      }
    }
  }))

  expectError(new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        type: 'sumjunction',
        negationName: 'IPSUM',
        // @ts-expect-error
        aliases: ['FOO']
      }
    }
  }))

  expectError(new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        type: 'sumjunction',
        negationName: 'IPSUM',
        // @ts-expect-error
        negationAliases: ['FOOBAR', 'FOO']
      }
    }
  }))

  expectError(new WizardParser({
    operators: {
      // @ts-expect-error
      notlowercase: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        type: 'sumjunction',
        negationName: 'IPSUM'
      }
    }
  }))

  expectError(new WizardParser({
    operators: {
      FOO: {
        // @ts-expect-error
        negationName: 'notlowercase',
        type: 'numeric'
      },
      LOREM: {
        // @ts-expect-error
        negationName: 'IPSUM',
        type: 'sumjunction'
      }
    }
  }))
})

test.todo('custom field types', () => {

})

test.todo('invalid dialects', () => {

})
