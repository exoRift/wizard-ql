import { test, expect } from 'bun:test'

import { WizardParser } from '../src/parser'

test('basic stringification', () => {
  const parser = new WizardParser()

  const query = 'field1 = "value" and field4 != "2" & field2 equals 2 | !field3'

  expect(parser.stringify(parser.parse(query)!, 'programmatic'), 'programmatic string arg').toBe('field1 = value & field4 != "2" & field2 = 2 | field3 != true')

  expect(parser.stringify(parser.parse(query)!, {
    dialect: 'linguistic'
  }), 'linguistic').toBe('field1 EQUALS value AND field4 NOTEQUALS "2" AND field2 EQUALS 2 OR field3 NOTEQUALS true')

  expect(parser.stringify(parser.parse(query)!, {
    dialect: 'formal'
  }), 'formal').toBe('field1 = value ∧ field4 ≠ "2" ∧ field2 = 2 ∨ field3 ≠ true')

  expect(parser.stringify(parser.parse(query)!, {
    dialect: 'programmatic',
    alwaysParenthesize: true
  }), 'always parenthesize').toBe('(field1 = value & field4 != "2" & field2 = 2) | field3 != true')

  expect(parser.stringify(parser.parse(query)!, {
    dialect: 'programmatic',
    compact: true
  }), 'compact').toBe('field1=value&field4!="2"&field2=2|field3!=true')

  expect(parser.stringify(parser.parse(query)!, {
    compact: true,
    dialect: 'linguistic'
  }), 'compact with linguistic').toBe('field1 EQUALS value AND field4 NOTEQUALS "2" AND field2 EQUALS 2 OR field3 NOTEQUALS true')

  expect(parser.stringify(parser.parse('foo = false | foo = true | foo != false | foo != true | bar | !bar')!, {
    dialect: 'programmatic',
    condenseImplicit: true
  }), 'condense booleans').toBe('!foo | foo | foo | !foo | bar | !bar')
})

test('arrays', () => {
  const parser = new WizardParser()

  expect(parser.stringify(parser.parse('field : [1,2, 3, "4", "five", \'six\']')!, 'programmatic'), 'regular mixed').toBe('field : [1, 2, 3, "4", five, six]')
  expect(parser.stringify(parser.parse('field : [1,2, 3, \\[4\\], "five", \'six\']')!, 'programmatic'), 'escaped bracket mixed').toBe('field : [1, 2, 3, "[4]", five, six]')
  expect(parser.stringify(parser.parse('field : [1,2, 3, "[4]", "five", \'six\']')!, 'programmatic'), 'quoted bracket mixed').toBe('field : [1, 2, 3, "[4]", five, six]')
})

test('nested quotes', () => {
  const parser = new WizardParser()

  expect(parser.stringify(parser.parse('field = "\\"foo\\""')!, 'programmatic'), 'basic nested quotes').toBe('field = "\\"foo\\""')
  expect(parser.stringify(parser.parse('field : [1,2, 3, "[\\"4]", "five", \'six\']')!, 'programmatic'), 'quoted bracket mixed with quote').toBe('field : [1, 2, 3, "[\\"4]", five, six]')
})

test('escapes', () => {
  const parser = new WizardParser()

  // backslashes, quotes, spaces
  expect(parser.stringify(parser.parse('foo = \\\\bar')!, 'programmatic'), 'backslashes').toBe('foo = \\\\bar')
  expect(parser.stringify(parser.parse('foo = \'"bar"\'')!, 'programmatic'), 'hardquotes').toBe('foo = "\\"bar\\""')
  expect(parser.stringify(parser.parse('foo = bar \\or baz')!, 'programmatic'), 'escaped operator').toBe('foo = "bar or baz"')
  expect(parser.stringify(parser.parse('foo = bar\\ or baz')!, 'programmatic'), 'escaped space').toBe('foo = "bar or baz"')
  expect(parser.stringify(parser.parse('foo = "123"')!, 'programmatic'), 'quoted number').toBe('foo = "123"')
})

test('complex query can be reparsed', () => {
  const parser = new WizardParser()

  const query1 = 'foo & (foo = \'bar\') and ((FOOBAR : [1, "2", \\[3\\], four] V baz) | field !== wrong & test matches ".*regex.*")'
  expect(parser.parse(query1), 'q1 programmatic').toEqual(parser.parse(parser.stringify(parser.parse(query1)!, 'programmatic')))
  expect(parser.parse(query1), 'q1 linguistic').toEqual(parser.parse(parser.stringify(parser.parse(query1)!, 'linguistic')))
  expect(parser.parse(query1), 'q1 formal').toEqual(parser.parse(parser.stringify(parser.parse(query1)!, 'formal')))

  const query2 = 'foo & (foo = \'bar\') and !(!(FOOBAR : [1, "2", \\[3\\], four] V baz) | field !== wrong & test matches ".*regex.*")'
  expect(parser.parse(query2), 'q2 programmatic').toEqual(parser.parse(parser.stringify(parser.parse(query2)!, 'programmatic')))
  expect(parser.parse(query2), 'q2 linguistic').toEqual(parser.parse(parser.stringify(parser.parse(query2)!, 'linguistic')))
  expect(parser.parse(query2), 'q2 formal').toEqual(parser.parse(parser.stringify(parser.parse(query2)!, 'formal')))
})

test('custom dialects', () => {
  const parser = new WizardParser({
    dialects: {
      piglatin: {
        AND: 'DANAY',
        EQUAL: 'LEQuay',
        GEQ: 'qgeay',
        GREATER: 'rgreateay',
        IN: 'niay',
        LEQ: 'qleay',
        LESS: 'slesay',
        MATCH: 'hmatcay',
        NOTEQUAL: 'lnotequay',
        NOTIN: 'nnotiay',
        NOTMATCH: 'hnotmatcay',
        OR: '\\/'
      }
    }
  })

  const parsed = parser.parse('field1 ~ foo or field2 < 123 & field1 = true')
  if (!parsed) throw new Error('Unexpected null')

  expect(parser.stringify(parsed, { dialect: 'piglatin', compact: true })).toBe('field1 hmatcay foo\\/field2 slesay 123 DANAY field1 LEQuay true')
})

test('custom date serialization', () => {
  const parser = new WizardParser({
    types: {
      datefield: 'date'
    },
    dateSerializer: (d) => d.getTime().toString()
  })

  const parsed = parser.parse('datefield > 2026-05-14')
  if (!parsed) throw new Error('Unexpected null')

  expect(parser.stringify(parsed, 'programmatic'), 'date rep').toBe('datefield > 1778716800000')
})
