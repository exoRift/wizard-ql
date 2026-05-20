<h2>
  𝗪<sub>izard</sub>
  <br />
  𝗜<sub>s</sub>
  <br />
  𝗭<sub>not</sub>
  <br />
  𝗔<sub>n</sub>
  <br />
  𝗥<sub>acronym</sub>
  <br />
  𝗗
  <br />
  <br />
  𝗤<sub>uery</sub>
  𝗟<sub>anguage</sub>
</h2>

#### WizardQL is a natural-language-like query language for constructing data queries for resources that meet conditions, fitted with extensive type completion.

[Demo](https://exoRift.github.io/wizard-ql)

## Examples
`WizardParser.parse('(rank >= 10 & role = admin) | banned')`

> ```js
> {
>   type: "group",
>   operation: "OR",
>   constituents: [
>     {
>       type: "group",
>       operation: "AND",
>       constituents: [
>         {
>           type: "condition",
>           field: "rank",
>           operation: "GEQ",
>           value: 10,
>           validated: false,
>         }, {
>           type: "condition",
>           field: "role",
>           operation: "EQUAL",
>           value: "admin",
>           validated: false,
>         }
>       ],
>     }, {
>       type: "condition",
>       field: "banned",
>       operation: "EQUAL",
>       value: true,
>       validated: false,
>     }
>   ],
> }
> ```

`WizardParser.parse('flagged OR (name MATCHES "decorative_.*" AND !(price >= 20 AND price <= 30))')`

> ```js
> {
>   type: "group",
>   operation: "OR",
>   constituents: [
>     {
>       type: "condition",
>       field: "flagged",
>       operation: "EQUAL",
>       value: true,
>       validated: false,
>     }, {
>       type: "group",
>       operation: "AND",
>       constituents: [
>         {
>           type: "condition",
>           field: "name",
>           operation: "MATCH",
>           value: "decorative_.*",
>           validated: false,
>         }, {
>           type: "group",
>           operation: "OR",
>           constituents: [
>             {
>               type: "condition",
>               field: "price",
>               operation: "LESS",
>               value: 20,
>               validated: false,
>             }, {
>               type: "condition",
>               field: "price",
>               operation: "GREATER",
>               value: 30,
>               validated: false,
>             }
>           ],
>         }
>       ],
>     }
>   ],
> }
> ```

## Basic Syntax
### Condition
*A condition is a check against a field using a condition operator such as EQUAL or LESS.*
`{FIELD} {C_OPERATOR} {VALUE}`
For array operators, (`IN`, `NOTIN`), the value must be in brackets separated by commas.
> Example: `snack : [pizza, soda, chips]`

A field OR a value can be wrapped in quotes if it contains a special operator.
> Example: `"vendor" = "H&M"`

> Example: `"vendor" = H\&M`

You can also escape characters
> Example: `'speech' = "\"Hello\""`

> Example: `'speech' = '"Hello"'`

Backslashes can be denoted with a double backslash
> Example: `\\`

#### Implicit Boolean
Simply denoting a field name (`field`) transforms it into `field = true`

(`!field`) transforms it into `field = false`

> [!NOTE]
> This is true for the default operator set. If custom operators are defined, a custom [implicit condition](#implicit-condition) can be defined as well.

### Group
*A group is multiple conditions joined by a junction operator such as AND or OR.*
`({CONDITION} [...{J_OPERATOR} {CONDITION}])`
Groups are implicit when junction operators are used (follows PEMDAS \[ANDs grouped before ORs\]). Parentheses can be used to denote them explicitly.

Groups can be nested.
> Example: `user.activated & ((user.role = member & user.group : [abc, xyz]) | (user.role = admin & user.privileged))`

Groups can also be negated
> `!(firstname = John & lastname = Doe)` &rarr; `firstname != John | lastname != Doe`

## Default Operators
### Junction Operators
<details>
<summary>AND</summary>

- `AND`
- `&`
- `&&`
- `^`
</details>

<details>
<summary>OR</summary>

- `OR`
- `|`
- `||`
- `V`
</details>

### Condition Operators
<details>
<summary>EQUAL</summary>

- `EQUAL`
- `EQUALS`
- `EQ`
- `IS`
- `==`
- `=`
</details>

<details>
<summary>NOTEQUAL</summary>

- `NOTEQUALS`
- `NOTEQUAL`
- `NEQ`
- `ISNT`
- `!==`
- `!=`
</details>

<details>
<summary>LESS</summary>

- `LESS`
- `<`
</details>

<details>
<summary>GREATER</summary>

- `GREATER`
- `>`
- `MORE`
</details>

<details>
<summary>GEQ</summary>

- `GEQ`
- `>=`
- `=>`
</details>

<details>
<summary>LEQ</summary>

- `LEQ`
- `<=`
- `=<`
</details>

<details>
<summary>IN</summary>

- `IN`
- `:`
</details>

<details>
<summary>NOTIN</summary>

- `NOTIN`
- `!:`
</details>

<details>
<summary>MATCH</summary>

- `MATCH`
- `MATCHES`
- `~`
</details>

<details>
<summary>NOTMATCH</summary>

- `NOTMATCH`
- `NOTMATCHES`
- `!~`
</details>

## Custom Operators
If the default operators don't fulfill your needs, a custom operator set can be defined.

```js
new WizardParser({
  operators: {
    [OPERATOR_NAME]: {
      negationName: NEGATION_OPERATOR_NAME,
      aliases: ['ALIAS'],
      type: 'numeric',
      negationAliases: ['NEGALIAS']
    },
    ...
  }
})
```

An operator is inherently two operators: the base operator and its negation. When defining an operator, you must also define its `negationName`. You can also define aliases for operators and their negations.

Lastly, you must supply the data type the operator functions on. This type also determines the operator type (condition/junction \[a junction joins conditions together into a group\]).
- For **condition operators**, `type` can be `'primitive'`, `'boolean'`, `'string'`, `'number'`, `'date'`, `'numeric'`, or `'array'`. `primitive` allows all data types (singular). `array` allows all data types within an array. `numeric` allows `number` or `date`; however, `number` will be used unless the condition's field is only of type `date`.
- For **junction operators**, `type` can be `sumjunction` or `productjunction`. They're both group operators, but have different precedence for logical PEMDAS. For example, `A & B | C` becomes `(A & B) | C`. In logic, "and" is a product junction, and "or" is a sum junction. The negation of a sum junction is a product junction and vice-versa.

When defining custom operators, their names should be all uppercase. Two operators should not share names or aliases. This applies to the keys of the operator record, `negationName`, `aliases`, and `negationAliases`.

For condition operators, if, for whatever reason, you want to define the negation operators first, you can supply `exclusionary: true` which marks the operator you defined in the record as the negatory one.

## Implicit Condition
You may have noted the existed of [implicit boolean](#implicit-boolean) for the default operator set. Once you start defining custom operators, there is no longer a default implicit condition. One can optionally be defined.

```js
new WizardParser({
  operators: {
    [OPERATOR_NAME]: {
      negationName: NEGATION_OPERATOR_NAME,
      aliases: ['ALIAS'],
      type: 'numeric',
      negationAliases: ['NEGALIAS']
    },
    ...
  },
  implicitCondition: {
    operator: OPERATOR_NAME, // The operator to use
    value: '0', // The value, as a string
    asType: 'number' // What datatype should the value be read as
  }
})
```

The implicit condition is applied when a field name is denoted without any operator. Example: (`field = value | otherfield`). In this case, `otherfield` would be parsed as `otherfield OPERATOR_NAME 0`. If a negator precedes the field (`!otherfield`), it uses the negated variant of the implicit operator.

## Constraints
When constructing a WizardParser instance (`new WizardParser()`), the constructor can be passed properties containing various constraints.

### Restricted Fields (`restricted`)
A record mapping field names to restrictions. A value of `true` totally prohibits the usage of a field.

Otherwise, a tuple can be passed
> `['allow' | 'deny', [...values]]`

Values can be direct values (string, number, boolean) or regex expressions

"allow" will allow the values/patterns and deny all others
"deny" will deny the values/patterns and allow all others

### Field Types (`types`)
A record mapping field names to (`boolean`, `string`, `number`, `date`). The value in the record can either be a single allowed type or an array of allowed types. Only operators that can function on that type can be used for that field. By default, fields will be treated as being able to be any of the three types.

> Example:
> ```js
> new WizardParser({
>   types: {
>     field1: 'string',
>     field2: ['string', 'number']
>   }
> }).parse('field1 = value')
> ```

> [!NOTE]
> A value will only be attempted to be parsed as a date if `'date'` is included in the field's type record.
> If the value is a number, it will be parsed as number of milliseconds. Any non-number character will cause the value to be parsed as a string

The type coercion priority chain is as follows:
`boolean` -> `date` -> `number` -> `string`
> [!WARNING]
> This can cause issues for numbers with leading zeros. If this is a potential problem, make sure to exclude `number` from the types and include `string`

### Regarding constraints: `validated` property
When a field has matched either a key in `types` or a field in `restricted`, the `validated` property on the parsed condition will be true. This is due to a limitation with TypeScript's type checking.

Therefore, type inference would look something like this:
```js
const parsed = new WizardParser({
  types: {
    field: ['string', 'number']
  }
}).parse('field = value')

if (parsed.validated) {
  switch (parsed.type) {
    case 'condition':
      switch (parsed.field) {
        case 'field':
          parsed.value
          // ^?: string | number
          break
      }
      break
  }
}
```

### `disallowUnvalidated`
Fields that are not present in the type or restriction record will considered invalid fields. This will make resulting parsed expression types far more usable without having to check if `validated === true`

### `caseInsensitive`
Type/constraint checks will be case-insensitive on the field name
> [!NOTE]
> If enabled, all fields will be returned as their casing denoted by the types or restricted record

> [!WARNING]
> Mismatching casing between the restricted record and the type record will prioritize the restricted record

### `dateInterpreter`
A callback that determines how WizardQL interprets dates. Wizard will attempt to parse a value as a date if `'date'` is supplied in its type record

By default, this is simply `(v) => new Date(v)`

## Stringification
Parsed expressions can be converted back into strings using the `stringify` method. The stringify method comes with its own options as its second parameter (or it can just be a string, selecting the dialect)

```js
const parser = new WizardParser()

const parsed = parser.parse('...')
if (parsed) console.log(parser.stringify(parsed, DIALECT))
```

### `dialect`
The dialect determines how operators are stringified.

Custom dialects can be supplied in the WizardParser constructor. If using the default operators, the default dialects are:
- Programmatic: `&`
- Linguistic: `AND`
- Formal: `^`

### `alwaysParenthesize`
Always put parentheses around every group

### `compact`
Don't include spaces in the output. Operators that contain alpha characters will always be surrounded with spaces.

### `condenseImplicit`
Conditions that are an instance of the [implicit condition](#implicit-condition) or its negation will be condensed into the implicit notation (`field`, `!field`).

For example, if the default condition is `some_field LESS 0` (assuming the LESS operator is defined), `field < 0` becomes `field` and `field >= 0` becomes `!field`. There is a special exception for booleans (also utilized for the default operator [implicit boolean](#implicit-boolean)) where `field = false`, which is technically not a negation of the implicit condition (`field != true`), is still condensed to `!field`

### Date Serialization
A custom callback can be supplied to the parser constructor for how dates should be stringified. The default simply calls `Date.toISOString()`

```js
new WizardParser({
  dateSerializer: (d) => d.getTime().toString() // Serialize to time in milliseconds instead
})
```

### Custom Dialects
> See the default dialects [here](#dialect)

Whether using the default operator set or custom operators (must define custom dialects for custom operators if you're looking to stringify), custom dialects can be defined. This determines how `WizardParser.stringify()` prints operator names to the resulting string.

```js
new WizardParser({
  operators: {
    [OPERATOR_NAME]: {
      negationName: NEGATION_OPERATOR_NAME,
      aliases: ['ALIAS'],
      type: 'numeric',
      negationAliases: ['NEGALIAS']
    },
    ...
  },
  dialects: {
    [DIALECT_NAME]: {
      [OPERATOR_NAME]: 'operator_denotation',
      ...
    }
  }
})
```

## Summarize
You can use the `summarize` method to summarize a parsed expression, aggregated by field name across groups. This is useful for authorization checks

`WizardParser.summarize(parse('(foo in [1, 2] and (bar = 2 or baz)) V (bar !: [1, 3] and foo = 3)'))`
> ```js
> [
>     ['foo', [
>       {
>         operation: 'IN',
>         value: [1, 2],
>         exclusionary: false
>       },
>       {
>         operation: 'EQUAL',
>         value: 3,
>         exclusionary: false
>       }
>     ]],
>     ['bar', [
>       {
>         operation: 'EQUAL',
>         value: 2,
>         exclusionary: false
>       },
>       {
>         operation: 'NOTIN',
>         value: [1, 3],
>         exclusionary: true
>       }
>     ]],
>     ['baz', [
>       {
>         operation: 'EQUAL',
>         value: true,
>         exclusionary: false
>       }
>     ]]
>   ]
> ```

> [!NOTE]
> `exclusionary` implies a negatory operation (one that excludes the value)

## Execution Example
Below is an example of how a Wizard query would be safely executed in the context of a [KnexJS Query](https://knexjs.org)

https://github.com/exoRift/wizard-ql/blob/424c92e8fc205cf22a639887ebbafd822a7c8731/src/execute.ts#L1-L36

## DOM Input
Wizard comes pre-packaged with a DOM input that applies classes for tokens, making for a query input with syntax highlighting (up to discretion)

```js
// NOTE: The input element should be a regular div element, not an input element
const destructor = createDOMInput({ input: document.getElementById('input') })

destructor()
```

### Token types
Depending on a token's type, attributes will be applied to the contents of the input for styling:

- `data-spacer` - Whitespace
- `data-node` - An actual token
  - `data-quoted` - Quoted text
  - `data-number` - A number
  - `data-bracket` - A parenthesis or array bracket (value is the bracket)
  - `data-delimiter` - An array delimiter (comma)
  - `data-negator` - A negation operator (exclamation mark)
  - `data-operator` - A condition or junction operator (value will be 'junction' or 'condition')

A token can also possess `data-error` if it is part of an error span

The input itself can have the following attributes:
- `data-error-message` - The error message
- `data-error-start` - The starting token index for the error
- `data-error-end` - The end token index for the error

An example for styling this input can be found [here](./test/preview/index.css)
