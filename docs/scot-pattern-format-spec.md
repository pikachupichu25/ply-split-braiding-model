# SCOT Pattern Text Format Specification

> Project-specific specification for writing compact Single Course Oblique Twining (SCOT) patterns.  
> Version: 0.1 draft  
> Last updated: 2026-09-03

The proposed conversion and rendering architecture is documented in the [SCOT Visualization Web App Plan](./scot-visualization-web-app-plan.md). That plan identifies a numbering ambiguity that must be resolved before this draft advances to version 0.2: human-facing numbers should most likely identify current diagram lanes, while the program keeps separate permanent cord identities internally.

## 1. Purpose

This format records a SCOT pattern as:

1. the initial colour of each cord;
2. numbered rows of splitting instructions; and
3. optional repeat instructions.

The format is intended to be easy for a maker to read and simple for software to parse. It is a convention for this project, not a universal ply-split braiding standard.

## 2. Basic example

```text
color: CBAAAABC

1 1>2,3,4
2 8>7,6,5,4

[repeat 1-2]
```

Meaning:

- Use eight cords.
- Their initial colours, from left to right, are `C B A A A A B C`.
- Row 1: cord 1 splits cords 2, 3, and 4, in that order.
- Turn the braid over.
- Row 2: cord 8 splits cords 7, 6, 5, and 4, in that order.
- Turn the braid over.
- Repeat rows 1 and 2 until the required length or repeat count is reached.

## 3. Assumptions for version 0.1

- The pattern describes a flat SCOT braid.
- All cords are attached using the project's standard starting method.
- Cords are numbered from left to right in the initial setup view.
- Cord numbers are permanent identities; they do not change when the braid is turned.
- Each numbered row contains one splitter cord and one or more splittee cords.
- Splittees are written in the order in which the splitter passes through them.
- The braid is turned over automatically after every completed row.
- The standard split is used: the gripfid passes between the normal groups of plies for the selected cord.
- Twist amount, tension, edge finishing, and cord construction are supplied by the project defaults unless separate metadata is added later.

## 4. Cord-colour sequence

### Syntax

```text
color: <sequence>
```

Example:

```text
color: CBAAAABC
```

Each character represents one cord. Its position determines the cord number:

| Cord | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Colour symbol | C | B | A | A | A | A | B | C |

Rules:

- Version 0.1 accepts the uppercase letters `A` through `Z` as colour symbols.
- The number of characters is the number of cords in the pattern.
- Repeated letters mean repeated colours; they do not identify the cords.
- Cord identity and colour are separate. For example, cords 3-6 are four distinct cords even though they all use colour `A`.
- A UI may assign an actual display colour to every symbol, such as `A = red`, without changing the pattern instructions.

## 5. Row instruction

### Syntax

```text
<row-number> <splitter>><splittee-list>
```

The splittee list contains one or more cord numbers separated by commas:

```text
<splittee>,<splittee>,...
```

Examples:

```text
1 1>2,3,4
2 8>7,6,5,4
```

Spaces around `>` and commas are optional, so this is equivalent:

```text
1  1 > 2, 3, 4
```

### Meaning of `>`

```text
A>B
```

means:

> Cord A is the splitter and passes through the plies of cord B.

When several cords appear on the right:

```text
A>B,C,D
```

cord A remains the active splitter and passes through B, then C, then D as one ordered SCOT action.

The `>` symbol records the splitter relationship. It does not mean “greater than,” and it does not by itself define screen-left or screen-right movement. Movement is derived from the ordered cord path.

### Row execution

For each row, the program or maker must:

1. select the splitter cord;
2. encounter the splittee cords in the listed order;
3. open and split each listed cord;
4. pull the splitter through the complete ordered group;
5. tighten and arrange the row;
6. turn the braid over.

## 6. Repeat instructions

### Repeating until the maker stops

```text
[repeat <first-row>-<last-row>]
```

Example:

```text
[repeat 1-2]
```

This marks rows 1 and 2 as a repeating unit. The unit is repeated until the maker reaches the desired length.

### Fixed repeat count

An optional fixed count may be added:

```text
[repeat 1-2 x 10]
```

This means to perform the complete row 1-2 unit ten times in total. The first written execution counts as the first repeat.

Therefore:

```text
1 1>2,3,4
2 8>7,6,5,4
[repeat 1-2 x 10]
```

produces 20 worked rows, not 22.

### Multiple repeat sections

A pattern may contain multiple non-overlapping repeat ranges. Written rows outside a
repeat range are worked once, while each repeat range uses its own fixed count or the
preview count when its count is omitted.

```text
1 1>2,3,4
2 8>7,6,5,4
[repeat 1-2 x 6]

3 4>5,6,7
4 1>2,3,4
[repeat 3-4 x 6]
```

Repeat ranges cannot overlap or run backwards through the written rows.

## 7. Comments and blank lines

Blank lines are ignored.

A comment begins with `#` and continues to the end of the line:

```text
# Eight-cord chevron sample
color: CBAAAABC

1 1>2,3,4       # Work from the cord-1 edge
2 8>7,6,5,4     # Work from the cord-8 edge

[repeat 1-2]
```

Comments are for people and do not change the pattern.

## 8. Formal grammar

The following simplified EBNF defines version 0.1:

```ebnf
pattern          = { blank-line | comment-line },
                   color-line, line-end,
                   { blank-line | comment-line | row-line | repeat-line } ;

color-line       = "color", spacing, ":", spacing, color-sequence ;
color-sequence   = color-symbol, { color-symbol } ;
color-symbol     = "A" | "B" | "C" | ... | "Z" ;

row-line         = row-number, required-space,
                   cord-number, spacing, ">", spacing,
                   cord-number,
                   { spacing, ",", spacing, cord-number },
                   [ spacing, comment ], line-end ;

repeat-line      = "[", spacing, "repeat", required-space,
                   row-number, spacing, "-", spacing, row-number,
                   [ required-space, "x", required-space, positive-integer ],
                   spacing, "]", [ spacing, comment ], line-end ;

comment-line     = spacing, comment, line-end ;
comment          = "#", { any-character-except-line-end } ;
blank-line       = spacing, line-end ;

row-number       = positive-integer ;
cord-number      = positive-integer ;
positive-integer = nonzero-digit, { digit } ;
spacing          = { " " | tab } ;
required-space   = ( " " | tab ), spacing ;
line-end         = newline | end-of-file ;
```

## 9. Validation rules

A valid version 0.1 pattern must satisfy all of these rules:

1. There is exactly one `color:` line.
2. The colour sequence contains at least three cords.
3. Row numbers are positive, unique, and increase in file order.
4. Every referenced cord number is between 1 and the colour-sequence length.
5. A row's splitter cannot also occur in its splittee list.
6. A splittee cannot occur more than once in the same row.
7. The splittee list contains at least one cord.
8. Splittees must be listed in physical encounter order.
9. Every repeat start and end row must exist.
10. A repeat start must not be greater than its end.
11. Repeat ranges must not overlap.
12. A fixed repeat count must be a positive integer.
13. The simulated cord paths must make every requested split physically reachable.

Rules 1-12 are syntax and reference checks. Rule 13 requires structural simulation; passing the text parser alone does not prove that a braid is physically makeable.

## 10. Canonical formatting

When software saves or reformats a pattern, it should produce:

- lowercase keyword `color`;
- uppercase colour symbols;
- one space between the row number and instruction;
- no spaces around `>` or commas;
- one blank line after `color:`;
- one blank line before each repeat instruction;
- lowercase keyword `repeat`;
- rows preserved in numeric order.

Canonical example:

```text
color: CBAAAABC

1 1>2,3,4
2 8>7,6,5,4

[repeat 1-2]
```

## 11. Machine-readable interpretation

The canonical example is equivalent to:

```json
{
  "format": "scot-pattern",
  "version": "0.1",
  "cords": [
    { "id": 1, "color": "C" },
    { "id": 2, "color": "B" },
    { "id": 3, "color": "A" },
    { "id": 4, "color": "A" },
    { "id": 5, "color": "A" },
    { "id": 6, "color": "A" },
    { "id": 7, "color": "B" },
    { "id": 8, "color": "C" }
  ],
  "rows": [
    {
      "number": 1,
      "splitter": 1,
      "splittees": [2, 3, 4],
      "turnAfter": true
    },
    {
      "number": 2,
      "splitter": 8,
      "splittees": [7, 6, 5, 4],
      "turnAfter": true
    }
  ],
  "repeats": [
    {
      "fromRow": 1,
      "throughRow": 2,
      "count": null
    }
  ]
}
```

A `null` repeat count means repeat until the desired length rather than a predetermined number of times.

## 12. Recommended filename

Use the extension:

```text
.scot
```

Example:

```text
three-colour-chevron.scot
```

The plain-text format remains readable without the program.

## 13. Planned extensions, not part of version 0.1

Possible later additions include:

- metadata such as title, author, licence, and provenance;
- a palette mapping `A`, `B`, and `C` to actual colours;
- explicit `turn` and `no-turn` commands;
- per-row splitting direction;
- multiple split actions in one row;
- quarter-turn and half-turn cord rotation;
- named sections and nested repeats;
- target length and unit;
- starting, joining, border, and finishing instructions;
- cord material, diameter, ply count, and twist direction;
- front and back preview information;
- POT, TLOI, darning, and hybrid structures.

These extensions should not change the meaning of valid version 0.1 patterns.

## 14. Design decision requiring confirmation

Version 0.1 assumes **automatic turning after every row** because this keeps the requested notation compact and matches the intended two-row alternating workflow. If patterns that do not turn after every row are needed, version 0.2 should add explicit `turn`/`no-turn` control rather than silently changing this rule.
