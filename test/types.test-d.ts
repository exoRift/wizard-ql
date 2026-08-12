import { test } from 'bun:test'
import { expectError, expectType } from 'tsd'

import { WizardParser, type FieldTypeRecord } from '../src'

test('default operators', () => {
  type DefaultCondition = {
    type: 'condition'
    operation: 'EQUAL'
    field: string
    value: string | number | boolean
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: string
    value: string | number | boolean
    validated: true
  } | {
    type: 'condition'
    operation: 'LESS'
    field: string
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'GEQ'
    field: string
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'GREATER'
    field: string
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'LEQ'
    field: string
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'IN'
    field: string
    value: Array<string | number | boolean>
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTIN'
    field: string
    value: Array<string | number | boolean>
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
    value: string | number | boolean
    validated: false
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: string
    value: string | number | boolean
    validated: false
  } | {
    type: 'condition'
    operation: 'LESS'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'GEQ'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'GREATER'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'LEQ'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'IN'
    field: string
    value: Array<string | number | boolean>
    validated: false
  } | {
    type: 'condition'
    operation: 'NOTIN'
    field: string
    value: Array<string | number | boolean>
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
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'BAR'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'FOO'
    field: string
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'BAR'
    field: string
    value: number
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

test('custom field types', () => {
  type CustomTypedCondition = {
    type: 'condition'
    operation: 'FOO'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'BAR'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'FOO'
    field: 'special'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'BAR'
    field: 'special'
    value: Date
    validated: true
  }

  interface CustomTypedGroup {
    type: 'group'
    operation: 'LOREM' | 'IPSUM'
    constituents: Array<CustomTypedCondition | CustomTypedGroup>
  }

  type CustomTypedExpression = CustomTypedCondition | CustomTypedGroup

  const parser = new WizardParser({
    types: {
      special: 'date'
    },
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        negationName: 'IPSUM',
        type: 'sumjunction'
      }
    }
  })

  expectType<CustomTypedExpression | null>(parser.parse(''))
})

test('custom field types disallow unvalidated', () => {
  type CustomTypedCondition = {
    type: 'condition'
    operation: 'FOO'
    field: 'special'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'BAR'
    field: 'special'
    value: Date
    validated: true
  }

  interface CustomTypedGroup {
    type: 'group'
    operation: 'LOREM' | 'IPSUM'
    constituents: Array<CustomTypedCondition | CustomTypedGroup>
  }

  type CustomTypedExpression = CustomTypedCondition | CustomTypedGroup

  const parser = new WizardParser({
    types: {
      special: 'date'
    },
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      LOREM: {
        negationName: 'IPSUM',
        type: 'sumjunction'
      }
    },
    disallowUnvalidated: true
  })

  expectType<CustomTypedExpression | null>(parser.parse(''))
})

test('explicit date field types', () => {
  type DateTypedCondition = {
    type: 'condition'
    operation: 'EQUAL'
    field: 'when'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: 'when'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'FOO'
    field: 'when'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'BAR'
    field: 'when'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'QUX'
    field: 'when'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'QUUX'
    field: 'when'
    value: Date
    validated: true
  } | {
    type: 'condition'
    operation: 'EQUAL'
    field: 'count'
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: 'count'
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'FOO'
    field: 'count'
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'BAR'
    field: 'count'
    value: number
    validated: true
  } | {
    type: 'condition'
    operation: 'EQUAL'
    field: string
    value: string | number | boolean
    validated: false
  } | {
    type: 'condition'
    operation: 'NOTEQUAL'
    field: string
    value: string | number | boolean
    validated: false
  } | {
    type: 'condition'
    operation: 'FOO'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'BAR'
    field: string
    value: number
    validated: false
  } | {
    type: 'condition'
    operation: 'QUX'
    field: string
    value: Date
    validated: false
  } | {
    type: 'condition'
    operation: 'QUUX'
    field: string
    value: Date
    validated: false
  }

  interface DateTypedGroup {
    type: 'group'
    operation: 'LOREM' | 'IPSUM'
    constituents: Array<DateTypedCondition | DateTypedGroup>
  }

  type DateTypedExpression = DateTypedCondition | DateTypedGroup

  const parser = new WizardParser({
    types: {
      when: 'date',
      count: 'number'
    },
    operators: {
      EQUAL: {
        type: 'primitive',
        negationName: 'NOTEQUAL'
      },
      FOO: {
        negationName: 'BAR',
        type: 'numeric'
      },
      QUX: {
        negationName: 'QUUX',
        type: 'date'
      },
      LOREM: {
        negationName: 'IPSUM',
        type: 'sumjunction'
      }
    }
  })

  expectType<DateTypedExpression | null>(parser.parse(''))
})

test('invalid dialects default', () => {
  const parser = new WizardParser()
  const parsed = parser.parse('hello')
  if (!parsed) throw new Error('Unexpected behavior')

  // @ts-expect-error
  expectError(parser.stringify(parsed, 'foo'))
})

test('invalid dialects custom', () => {
  const parser = new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      }
    },
    dialects: {
      foo: {
        FOO: 'FOO',
        BAR: 'BAR'
      }
    }
  })
  const parsed = parser.parse('hello')
  if (!parsed) throw new Error('Unexpected behavior')

  // @ts-expect-error
  expectError(parser.stringify(parsed, 'formal'))
})

test('incomplete dialects', () => {
  expectError(new WizardParser({
    operators: {
      FOO: {
        negationName: 'BAR',
        type: 'number'
      }
    },
    dialects: {
      // @ts-expect-error
      foo: {
        FOO: 'FOO'
      }
    }
  }))
})

test('no dialect autocomplete when custom operators', () => {
  const definition = {
    FOO: {
      negationName: 'BAR',
      type: 'number'
    }
  } as const

  const parser = new WizardParser({
    operators: definition
  })

  expectType<WizardParser<FieldTypeRecord, typeof definition, false, string>>(parser)
})
