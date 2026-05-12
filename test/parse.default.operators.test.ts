import { test, expect } from 'bun:test'

// import { type ComparisonOperation, OPERATION_ALIAS_DICTIONARY } from '../src/spec'
import { WizardParser } from '../src/parser'
import type { GetConditionOperators } from '../src/spec'
import { ConstraintError, ParseError } from '../src/errors'

test('tokenization', () => {
  const parser = new WizardParser()

  const strings = {
    '(field = string or other\\ field > 24) & boolean_field\\!': ['(', 'field', '=', 'string', 'OR', 'other\\ field', '>', '24', ')', '&', 'boolean_field\\!'],
    '!(test = foo oR bar <= baz) ^ !boolean\\ field': ['!', '(', 'test', '=', 'foo', 'OR', 'bar', '<=', 'baz', ')', '^', '!', 'boolean\\ field'],
    '': [],
    'field\\==value': ['field\\=', '=', 'value'],
    'field\\= equals value': ['field\\=', 'EQUALS', 'value'],
    'field\\\\= value': ['field\\\\', '=', 'value'],
    '\'field WITH spaces\' isnt        "value with  spaces"': ['\'field WITH spaces\'', 'ISNT', '"value with  spaces"'],
    'array_field : [value1\\ spaced , "value2"]': ['array_field', ':', '[', 'value1\\ spaced', ',', '"value2"', ']'],
    '1 NOtIN [2,3]': ['1', 'NOTIN', '[', '2', ',', '3', ']'],
    '1 NOtIN 2,3': ['1', 'NOTIN', '2', ',', '3'],
    '"field" = "\'value  "': ['"field"', '=', '"\'value  "'],
    '"field" = va\\"lue\\"': ['"field"', '=', 'va\\"lue\\"']
  }

  for (const string in strings) {
    expect(parser.tokenize(string).map((t) => t.content), string).toEqual(strings[string as keyof typeof strings])
  }

  for (const operator in WizardParser.DEFAULT_OPERATORS) {
    const entry = WizardParser.DEFAULT_OPERATORS[operator as keyof typeof WizardParser.DEFAULT_OPERATORS]
    for (const alias of [operator, entry.negationName, ...entry.aliases, ...entry.negationAliases]) {
      const string = `field ${alias.toLowerCase()} value`

      expect(parser.tokenize(string).map((t) => t.content), string).toEqual(['field', alias, 'value'])
    }
  }

  expect(parser.tokenize('one\\ token').map((t) => t.content), 'one\\ token').toEqual(['one\\ token'])

  expect(parser.tokenize('foo = bar or (field : [1, 2])'), 'indices').toEqual([
    {
      content: 'foo',
      index: 0
    },
    {
      content: '=',
      index: 4
    },
    {
      content: 'bar',
      index: 6
    },
    {
      content: 'OR',
      index: 10
    },
    {
      content: '(',
      index: 13
    },
    {
      content: 'field',
      index: 14
    },
    {
      content: ':',
      index: 20
    },
    {
      content: '[',
      index: 22
    },
    {
      content: '1',
      index: 23
    },
    {
      content: ',',
      index: 24
    },
    {
      content: '2',
      index: 26
    },
    {
      content: ']',
      index: 27
    },
    {
      content: ')',
      index: 28
    }
  ])
})

test('basic query', () => {
  const parser = new WizardParser()

  expect(parser.parse('field = value'), 'string query').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: 'value',
    validated: false
  })

  expect(parser.parse('field : [foo bar , "baz", ` foobar `]'), 'array query').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'IN',
    value: ['foo bar', 'baz', ' foobar '],
    validated: false
  })

  expect(parser.parse('field < 8'), 'numbers').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'LESS',
    value: 8,
    validated: false
  })

  expect(parser.parse('field matches ".*substr.*"'), 'regex').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'MATCH',
    value: '.*substr.*',
    validated: false
  })
  expect(parser.parse('field !~ "f{3}"'), 'notregex').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'NOTMATCH',
    value: 'f{3}',
    validated: false
  })
})

test('implicit boolean', () => {
  const parser = new WizardParser()

  expect(parser.parse('field'), 'standalone').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: true,
    validated: false
  })

  expect(parser.parse('field & foo = bar'), 'with junction').toEqual({
    type: 'group',
    operation: 'AND',
    constituents: [
      {
        type: 'condition',
        field: 'field',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'condition',
        field: 'foo',
        operation: 'EQUAL',
        value: 'bar',
        validated: false
      }
    ]
  })

  expect(parser.parse('!foo'), 'negative').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'NOTEQUAL',
    value: true,
    validated: false
  })
})

test('escaped parsing', () => {
  const parser = new WizardParser()

  expect(parser.parse('field neq \'2\''), 'numeric as string').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'NOTEQUAL',
    value: '2',
    validated: false
  })

  expect(parser.parse('"field 1" = foo\\ bar'), 'quoted field escaped value').toEqual({
    type: 'condition',
    field: 'field 1',
    operation: 'EQUAL',
    value: 'foo bar',
    validated: false
  })

  expect(parser.parse('field\\ 1 = \'foo bar\''), 'escaped field quoted value').toEqual({
    type: 'condition',
    field: 'field 1',
    operation: 'EQUAL',
    value: 'foo bar',
    validated: false
  })

  expect(parser.parse('field1 = \\"value spaced\\"'), 'escaped quotes field').toEqual({
    type: 'condition',
    field: 'field1',
    operation: 'EQUAL',
    value: '"value spaced"',
    validated: false
  })

  expect(parser.parse('\'field\' = "\\"value\\" \\"spaced\\""'), 'escaped inner quotes field').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: '"value" "spaced"',
    validated: false
  })

  expect(parser.parse('field !: ["entry, 1", entry 2, \'\\\'entry 3\\\'\']'), 'array entries').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'NOTIN',
    value: ['entry, 1', 'entry 2', '\'entry 3\''],
    validated: false
  })

  expect(parser.parse('field : ["string\\\\\\\\", "string\\\\\\""]'), 'excessive escaping').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'IN',
    value: ['string\\\\', 'string\\"'],
    validated: false
  })

  expect(parser.parse('field : [first : second, third]'), 'operator in value').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'IN',
    value: ['first : second', 'third'],
    validated: false
  })
})

test('invalid operands', () => {
  const parser = new WizardParser()

  expect(() => parser.parse('"1" "2" "3"'), 'no comparison').toThrow(ParseError)
  expect(() => parser.parse('1 = "2 3" "4 5"'), 'too many operands').toThrow(ParseError)
  expect(() => parser.parse('field in []'), 'no array entries').toThrow(ParseError)
  expect(() => parser.parse('field in []'), 'no array entries').toThrow('Token #2 -> #3 (char 9 -> 10 "[" -> "]"): Empty array provided as value')
  expect(() => parser.parse('[entry] = bar'), 'array as field').toThrow(ParseError)
  expect(() => parser.parse('foo in {{, 1}'), 'brackets in array value').toThrow(ParseError)
  expect(() => parser.parse('foo in {}, 1}'), 'brackets in array value').toThrow(ParseError)
  expect(() => parser.parse('foo in {{}, 1}'), 'brackets in array value').not.toThrow()
  expect(() => parser.parse('foo in [{}, 1]'), 'allowed brackets in array value').not.toThrow()
  expect(() => parser.parse('foo in [\'value\' unseparated, othervalue]'), 'non-surrounding string in array').toThrow(ParseError)
  expect(() => parser.parse('foo = 123 | (foo ~)'), 'dangling in group').toThrow(ParseError)
  expect(() => parser.parse('foo = 123 | (foo ~)'), 'dangling in group has known indices').not.toThrow('??')
})

test('parsing errors', () => { // AI-generated tests
  const parser = new WizardParser()

  // Invalid syntax
  expect(() => parser.parse('field =')).toThrow(ParseError)
  expect(() => parser.parse('field = AND')).toThrow(ParseError)
  expect(() => parser.parse('field = OR')).toThrow(ParseError)
  expect(() => parser.parse('field = 123 "foo"')).toThrow(ParseError)
  expect(() => parser.parse('field = [1, 2,')).toThrow(ParseError)
  expect(() => parser.parse('foo, bar')).toThrow(ParseError)
  expect(() => parser.parse('foo =, bar')).toThrow(ParseError)

  // Invalid operations
  expect(() => parser.parse('field <> value')).toThrow(ParseError)

  // Invalid array syntax
  expect(() => parser.parse('field : [value1, value2')).toThrow(ParseError)
  expect(() => parser.parse('field = value1, value2]')).toThrow(ParseError)

  // Invalid group syntax
  expect(() => parser.parse('(field = value')).toThrow(ParseError)
  expect(() => parser.parse('field = value)')).toThrow(ParseError)
  expect(() => parser.parse('(field = value AND')).toThrow(ParseError)
  expect(() => parser.parse('field = value OR)')).toThrow(ParseError)

  // Invalid negation
  expect(() => parser.parse('!')).toThrow(ParseError)
  expect(() => parser.parse('!(field = value')).toThrow(ParseError)

  // Invalid conjunctions
  expect(() => parser.parse('field = value AND OR field2 = value2')).toThrow(ParseError)
  expect(() => parser.parse('field = value OR AND field2 = value2')).toThrow(ParseError)

  // Invalid escape sequences
  expect(() => parser.parse('field = value\\ AND field2 = value2')).toThrow(ParseError)
})

test('unclosed closures', () => {
  const parser = new WizardParser()

  expect(() => parser.parse('(foo'), 'parenthesis').toThrow(ParseError)
  expect(() => parser.parse('(foo'), 'parenthesis').toThrow('Token #0 (char 0 "("): Missing closing parenthesis for group')
  expect(() => parser.parse('foo : [1'), 'bracket').toThrow(ParseError)
  expect(() => parser.parse('foo : [1'), 'bracket').toThrow('Token #2 (char 6 "["): Missing closing bracket/brace for array value')
  expect(() => parser.parse('foo : {1'), 'brace').toThrow(ParseError)
  expect(() => parser.parse('foo : {1'), 'brace').toThrow('Token #2 (char 6 "{"): Missing closing bracket/brace for array value')

  expect(() => parser.parse(')test'), 'unopened parenthesis').toThrow(ParseError)
  expect(() => parser.parse(')test'), 'unopened parenthesis').toThrow('Token #0 (char 0 ")"): Unexpected closing parenthesis')
  expect(() => parser.parse('field = ]test'), 'unopened bracket').toThrow(ParseError)
  expect(() => parser.parse('field = ]test'), 'unopened bracket').toThrow('Token #2 (char 8 "]"): Unexpected closing bracket/brace')
})

test('closure hell', () => {
  const parser = new WizardParser()

  expect(parser.parse('(((foo)) | (bar)) & (baz)')).toEqual({
    type: 'group',
    operation: 'AND',
    constituents: [
      {
        type: 'group',
        operation: 'OR',
        constituents: [
          {
            type: 'condition',
            field: 'foo',
            operation: 'EQUAL',
            value: true,
            validated: false
          },
          {
            type: 'condition',
            field: 'bar',
            operation: 'EQUAL',
            value: true,
            validated: false
          }
        ]
      },
      {
        type: 'condition',
        field: 'baz',
        operation: 'EQUAL',
        value: true,
        validated: false
      }
    ]
  })
})

test('groups', () => {
  const parser = new WizardParser()

  expect(parser.parse('(field1 = value1 & field 2 < 2)'), 'AND group').toEqual({
    type: 'group',
    operation: 'AND',
    constituents: [
      {
        type: 'condition',
        field: 'field1',
        operation: 'EQUAL',
        value: 'value1',
        validated: false
      },
      {
        type: 'condition',
        field: 'field 2',
        operation: 'LESS',
        value: 2,
        validated: false
      }
    ]
  })

  expect(parser.parse('field1 = value1 or field 2 > 2'), 'implicit OR group').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'condition',
        field: 'field1',
        operation: 'EQUAL',
        value: 'value1',
        validated: false
      },
      {
        type: 'condition',
        field: 'field 2',
        operation: 'GREATER',
        value: 2,
        validated: false
      }
    ]
  })

  expect(parser.parse('field1 = value1 or (field 2 : [value 2] && field_3 = value 3)'), 'complex group').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'condition',
        field: 'field1',
        operation: 'EQUAL',
        value: 'value1',
        validated: false
      },
      {
        type: 'group',
        operation: 'AND',
        constituents: [
          {
            type: 'condition',
            field: 'field 2',
            operation: 'IN',
            value: ['value 2'],
            validated: false
          },
          {
            type: 'condition',
            field: 'field_3',
            operation: 'EQUAL',
            value: 'value 3',
            validated: false
          }
        ]
      }
    ]
  })

  expect(parser.parse('boolean & field = value and number < 3 and array in [1, "2", 3]'), 'big and').toEqual({
    type: 'group',
    operation: 'AND',
    constituents: [
      {
        type: 'condition',
        field: 'boolean',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'condition',
        field: 'field',
        operation: 'EQUAL',
        value: 'value',
        validated: false
      },
      {
        type: 'condition',
        field: 'number',
        operation: 'LESS',
        value: 3,
        validated: false
      },
      {
        type: 'condition',
        field: 'array',
        operation: 'IN',
        value: [1, '2', 3],
        validated: false
      }
    ]
  })

  expect(parser.parse('((a and (b) and (c and d)))'), 'simplification').toEqual({
    type: 'group',
    operation: 'AND',
    constituents: [
      {
        type: 'condition',
        field: 'a',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'condition',
        field: 'b',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'condition',
        field: 'c',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'condition',
        field: 'd',
        operation: 'EQUAL',
        value: true,
        validated: false
      }
    ]
  })
})

test('basic parsing errors', () => {
  const parser = new WizardParser()

  expect(() => parser.parse('operation = ='), 'double equal').toThrow(ParseError)
  expect(() => parser.parse('operation = \\='), 'double equal with escape doesnt throw').not.toThrow()
  expect(() => parser.parse('operation = "="'), 'double equal with quotes doesnt throw').not.toThrow()
  expect(() => parser.parse('"field" "unknown" = foo'), 'two tokens for field').toThrow(ParseError)
  expect(() => parser.parse('field = "foo" bar or foo'), 'quote literal in the middle').toThrow(ParseError)
  expect(() => parser.parse('field = "foo" or foo "bar"'), 'quote literal at the end').toThrow(ParseError)
  expect(() => parser.parse('= "foo" or foo "bar"'), 'opening with comparison').toThrow(ParseError)
  expect(() => parser.parse('field : [[bar]'), 'unescaped bracket in array').toThrow('Missing closing bracket/brace for array value')
  expect(() => parser.parse('field : [bar]]'), 'unescaped bracket in array').toThrow('Unexpected closing bracket/brace')
  expect(() => parser.parse('field : [[bar]]'), 'unescaped bracket in array').not.toThrow()
  expect(() => parser.parse('field : ["[bar]", \\[bar\\]]'), 'unescaped bracket in array').not.toThrow()
})

test('group disjunction', () => {
  const parser = new WizardParser()

  expect(parser.parse('field1 & field2 or !field3'), 'and -> or').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'group',
        operation: 'AND',
        constituents: [
          {
            type: 'condition',
            field: 'field1',
            operation: 'EQUAL',
            value: true,
            validated: false
          },
          {
            type: 'condition',
            field: 'field2',
            operation: 'EQUAL',
            value: true,
            validated: false
          }
        ]
      },
      {
        type: 'condition',
        field: 'field3',
        operation: 'NOTEQUAL',
        value: true,
        validated: false
      }
    ]
  })

  expect(parser.parse('vfield1 | field2 and !field3'), 'or -> and').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'condition',
        field: 'vfield1',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'group',
        operation: 'AND',
        constituents: [
          {
            type: 'condition',
            field: 'field2',
            operation: 'EQUAL',
            value: true,
            validated: false
          },
          {
            type: 'condition',
            field: 'field3',
            operation: 'NOTEQUAL',
            value: true,
            validated: false
          }
        ]
      }
    ]
  })
})

test('dangling junctions', () => {
  const parser = new WizardParser()

  expect(() => parser.parse('^ foo')).toThrow('Token #0 (char 0 "^"): Unexpected junction operator with no preceding expression')
  expect(() => parser.parse('foo^')).toThrow('Token #1 (char 3 "^"): Dangling junction operator')
  expect(() => parser.parse('V foo')).toThrow('Token #0 (char 0 "V"): Unexpected junction operator with no preceding expression')
  expect(() => parser.parse('foo or')).toThrow('Token #1 (char 4 "OR"): Dangling junction operator')
})

test('NOT on group', () => {
  const parser = new WizardParser()

  expect(parser.parse('foo and !(bar and baz)'), 'demorgans and').toEqual({
    type: 'group',
    operation: 'AND',
    constituents: [
      {
        type: 'condition',
        operation: 'EQUAL',
        field: 'foo',
        value: true,
        validated: false
      },
      {
        type: 'group',
        operation: 'OR',
        constituents: [
          {
            type: 'condition',
            field: 'bar',
            operation: 'NOTEQUAL',
            value: true,
            validated: false
          },
          {
            type: 'condition',
            field: 'baz',
            operation: 'NOTEQUAL',
            value: true,
            validated: false
          }
        ]
      }
    ]
  })

  expect(parser.parse('foo or !(bar or baz)'), 'demorgans or').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'condition',
        operation: 'EQUAL',
        field: 'foo',
        value: true,
        validated: false
      },
      {
        type: 'group',
        operation: 'AND',
        constituents: [
          {
            type: 'condition',
            field: 'bar',
            operation: 'NOTEQUAL',
            value: true,
            validated: false
          },
          {
            type: 'condition',
            field: 'baz',
            operation: 'NOTEQUAL',
            value: true,
            validated: false
          }
        ]
      }
    ]
  })

  expect(parser.parse('foo or !(bar and (baz or !foobar))'), 'group merging').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'condition',
        field: 'foo',
        operation: 'EQUAL',
        value: true,
        validated: false
      },
      {
        type: 'condition',
        field: 'bar',
        operation: 'NOTEQUAL',
        value: true,
        validated: false
      },
      {
        type: 'group',
        operation: 'AND',
        constituents: [
          {
            type: 'condition',
            field: 'baz',
            operation: 'NOTEQUAL',
            value: true,
            validated: false
          },
          {
            type: 'condition',
            field: 'foobar',
            operation: 'EQUAL',
            value: true,
            validated: false
          }
        ]
      }
    ]
  })

  expect(() => parser.parse('!foo OR bar = value & !(field)')).not.toThrow()
  expect(() => parser.parse('!foo OR bar = value & !(field)')).not.toThrow()
})

test('complement operators', () => {
  const parser = new WizardParser()

  expect(parser.parse('!(foo = string)'), 'equal').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'NOTEQUAL',
    value: 'string',
    validated: false
  })
  expect(parser.parse('!(foo = string)'), 'notequal').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'NOTEQUAL',
    value: 'string',
    validated: false
  })
  expect(parser.parse('!(foo >= 2)'), 'geq').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'LESS',
    value: 2,
    validated: false
  })
  expect(parser.parse('!(foo <= 2)'), 'leq').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'GREATER',
    value: 2,
    validated: false
  })
  expect(parser.parse('!(foo < 2)'), 'less').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'GEQ',
    value: 2,
    validated: false
  })
  expect(parser.parse('!(foo > 2)'), 'equal').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'LEQ',
    value: 2,
    validated: false
  })
  expect(parser.parse('!(foo notin [1])'), 'notin').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'IN',
    value: [1],
    validated: false
  })
  expect(parser.parse('!(foo ~ expression?)'), 'matches').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'NOTMATCH',
    value: 'expression?',
    validated: false
  })

  expect(parser.parse('!(foo notmatches expression?)'), 'notmatches').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'MATCH',
    value: 'expression?',
    validated: false
  })
})

test('operation constraints', () => {
  const parser = new WizardParser()

  const tests: Array<[GetConditionOperators<typeof WizardParser.DEFAULT_OPERATORS>, string]> = [
    ['EQUAL', '[entry]'],
    ['NOTEQUAL', '[entry1, entry2]'],
    ['GEQ', 'string'],
    ['GREATER', 'true'],
    ['LEQ', 'foo'],
    ['LESS', 'false'],
    ['IN', 'string'],
    ['NOTIN', '42'],
    ['MATCH', '[1, 2]'],
    ['NOTMATCH', '[1, 5]']
  ]

  for (const [op, value] of tests) expect(() => parser.parse(`field ${op} ${value}`), op).toThrow(ConstraintError)
})

test('type constraints', () => {
  expect(() => new WizardParser({
    types: {
      foo: 'string'
    }
  }).parse('foo = string'), 'allowed single value').not.toThrow()
  expect(new WizardParser({
    types: {
      foo: 'string'
    }
  }).parse('foo = string'), 'validated field set').toEqual({
    type: 'condition',
    field: 'foo',
    operation: 'EQUAL',
    value: 'string',
    validated: true
  })

  expect(() => new WizardParser({
    types: {
      foo: 'number'
    }
  }).parse('foo = bar'), 'prohibited single value').toThrow(ConstraintError)

  expect(() => new WizardParser({
    types: {
      foo: ['string', 'number']
    }
  }).parse('foo in [string, 10, entry, 8]'), 'allowed mixed multiple values').not.toThrow()
  expect(() => new WizardParser({
    types: {
      foo: ['string', 'number']
    }
  }).parse('foo = bar'), 'allowed mixed single value').not.toThrow()
  expect(() => new WizardParser({
    types: {
      foo: ['string', 'number']
    }
  }).parse('foo'), 'prohibited mixed single value').toThrow(ConstraintError)

  expect(() => new WizardParser({
    types: {
      foo: ['boolean', 'number']
    }
  }).parse('foo in [string, 10, true, 8]'), 'prohibited mixed multiple values').toThrow(ConstraintError)

  expect(() => new WizardParser({
    types: {
      field: ['number', 'boolean']
    },
    caseInsensitive: true
  }).parse('bar and fIeLD in [1, 2, peanut butter, 4]'), 'prohibited case insensitivity').toThrow(ConstraintError)

  expect(new WizardParser({
    types: {
      FIELd: ['string', 'number']
    },
    caseInsensitive: true
  }).parse('fIeLD in [1, 2, peanut butter, 4]'), 'allowed case insensitivity').toEqual({
    type: 'condition',
    field: 'FIELd',
    operation: 'IN',
    value: [1, 2, 'peanut butter', 4],
    validated: true
  })

  expect(new WizardParser().parse('field = 01234'), 'leading zero no type hint').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: 1234,
    validated: false
  })

  expect(new WizardParser({ types: { field: ['string'] } }).parse('field = 01234'), 'leading zero string type hint').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: '01234',
    validated: true
  })
})

test('restriction constraints', () => {
  expect(() => new WizardParser({
    restricted: {
      restricted: true
    }
  }).parse('(foo = bar and baz = foobar) or restricted'), 'total restriction').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      restricted: true
    },
    caseInsensitive: true
  }).parse('(foo = bar and baz = foobar) or "RESTRICTED"'), 'case insensitivity and quotes').toThrow(ConstraintError)

  // --------- permissive ---------

  expect(() => new WizardParser({
    restricted: {
      field: ['deny', ['string']]
    }
  }).parse('field = allowed || field = string'), 'prohibited value restriction').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      field: ['deny', ['string']]
    }
  }).parse('field = allowed'), 'permissive allowed value restriction').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      array: ['deny', ['null']]
    }
  }).parse('array in [1, 2, cow, null, true]'), 'permissive aprohibited array checking').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      array: ['deny', ['null']]
    }
  }).parse('array in [1, 2, cow, true]'), 'permissive aallowed array checking').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      plural: ['deny', [/[^s]$/]]
    }
  }).parse('plural in [cows, dogs, cats, pigs]'), 'permissive aallowed regexing').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      plural: ['deny', [/[^s]$/]]
    }
  }).parse('plural in [cows, dogs, cat, pigs]'), 'permissive aprohibited regexing').toThrow(ConstraintError)

  // --------- prohibitive ---------

  expect(() => new WizardParser({
    restricted: {
      field: ['allow', ['string']]
    }
  }).parse('field = notallowed || field = notallowedeither'), 'prohibitive prohibited value restriction').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      field: ['allow', ['other', 'string']]
    }
  }).parse('field = allowed || field = string'), 'prohibitive prohibited value restriction with two options').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      field: ['allow', ['string', /^allowed$/]]
    }
  }).parse('field = allowed || field = string'), 'prohibitive allowed value restriction with two options mixed type').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      array: ['allow', ['null', 'cow']]
    }
  }).parse('array in [1, 2, cow, null, true]'), 'prohibitive prohibited array checking 1 instance').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      array: ['allow', ['null']]
    }
  }).parse('array in [1, 2, cow, true]'), 'prohibitive prohibited array checking no instance').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      array: ['allow', ['bar', 'null']]
    }
  }).parse('array in [null, bar]'), 'prohibitive allowed array checking all instance').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      plural: ['allow', [/[^s]$/]]
    }
  }).parse('plural in [cows, dogs, cats, pigs]'), 'prohibitive allowed regexing').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      plural: ['allow', [/[^s]$/]]
    }
  }).parse('plural in [cows, dogs, cat, pigs]'), 'prohibitive prohibited regexing').toThrow(ConstraintError)

  expect(() => new WizardParser({
    restricted: {
      plural: ['allow', [/[^s]$/, /^cats$/]]
    }
  }).parse('plural in [cow, dog, cats, pig]'), 'prohibitive allowed regexing').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      plural: ['allow', [/[^s]$/, /^cats$/]],
      singular: ['deny', ['foo']]
    },
    disallowUnvalidated: true
  }).parse('plural in [cow, dog, cats, pig]'), 'disallow unvalidated allowed 1 exp').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      plural: ['allow', [/[^s]$/, /^cats$/]],
      singular: ['deny', ['foo']]
    },
    disallowUnvalidated: true
  }).parse('plural in [cow, dog, cats, pig] or singular = bar'), 'disallow unvalidated allowed 2 exps').not.toThrow()

  expect(() => new WizardParser({
    restricted: {
      plural: ['allow', [/[^s]$/, /^cats$/]],
      singular: ['deny', ['foo']]
    },
    disallowUnvalidated: true
  }).parse('plural in [cow, dog, cats, pig] and unknown matches .{3} or singular = bar'), 'disallow unvalidated unknown field').toThrow(ConstraintError)

  expect(() => new WizardParser({
    types: {
      plural: ['string']
    },
    disallowUnvalidated: true
  }).parse('plural in [cow, dog, cats, pig] and unknown matches .{3} or singular = bar'), 'present in types throws').toThrow(ConstraintError)

  expect(() => new WizardParser({
    types: {
      plural: ['string']
    },
    disallowUnvalidated: true
  }).parse('plural in [cow, dog, cats, pig] or plural = bar'), 'present in types not throws').not.toThrow()

  expect(new WizardParser({
    types: {
      field: ['string']
    }
  }).parse('field = 1234'), 'number coerced to string if needed (single value)').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: '1234',
    validated: true
  })

  expect(new WizardParser({
    types: {
      field: ['string']
    }
  }).parse('field in [1234, 5678]'), 'number coerced to string if needed (multiple value)').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'IN',
    value: ['1234', '5678'],
    validated: true
  })

  expect(new WizardParser({
    types: {
      field: ['string']
    }
  }).parse('field = false'), 'boolean coerced to string if needed').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: 'false',
    validated: true
  })

  expect(() => new WizardParser({ restricted: { field: ['allow', [/^foo$/]] } }).parse('field = "foo"'), 'Test Regex matching on forced strings').not.toThrow()
})

test('date conversion', () => {
  expect(new WizardParser().parse('field = 2025-05-16'), 'by default not interpreted').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: '2025-05-16',
    validated: false
  })

  expect(new WizardParser({ types: { field: 'date' } }).parse('field = 2025-05-16'), 'interpreted pt. 1').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: new Date('2025-05-16'),
    validated: true
  })

  const now = new Date()
  expect(new WizardParser({ types: { field: 'date' } }).parse(`field = "${now.toISOString()}"`), 'interpreted pt. 2').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: now,
    validated: true
  })

  expect(new WizardParser({ types: { field: ['date', 'string'] }, dateInterpreter: (v) => v === 'foo' ? new Date(123) : new Date(NaN) }).parse('field < foo or field = bar'), 'custom function').toEqual({
    type: 'group',
    operation: 'OR',
    constituents: [
      {
        type: 'condition',
        field: 'field',
        operation: 'LESS',
        value: new Date(123),
        validated: true
      },
      {
        type: 'condition',
        field: 'field',
        operation: 'EQUAL',
        value: 'bar',
        validated: true
      }
    ]
  })

  expect(new WizardParser({ types: { field: ['date', 'string'] } }).parse('field matches 2025-05-16'), 'not parsed for string operation').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'MATCH',
    value: '2025-05-16',
    validated: true
  })
})

test('type priority', () => {
  expect(new WizardParser({ types: { field: ['string', 'number', 'boolean', 'date'] } }).parse('field = true'), 'boolean').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: true,
    validated: true
  })

  expect(new WizardParser({ types: { field: ['string', 'number', 'date'] } }).parse('field = true'), 'no boolean').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: 'true',
    validated: true
  })

  expect(new WizardParser({ types: { field: ['string', 'number', 'boolean', 'date'] } }).parse('field = 2025'), 'date as number').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: new Date(2025),
    validated: true
  })

  expect(new WizardParser({ types: { field: ['string', 'number', 'boolean', 'date'] } }).parse('field = 2025-02'), 'date as string').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: new Date('2025-02'),
    validated: true
  })

  expect(new WizardParser({ types: { field: ['string', 'number', 'boolean'] } }).parse('field = 2025'), 'number').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: 2025,
    validated: true
  })

  expect(new WizardParser({ types: { field: ['string'] } }).parse('field = 2025'), 'string').toEqual({
    type: 'condition',
    field: 'field',
    operation: 'EQUAL',
    value: '2025',
    validated: true
  })
})
