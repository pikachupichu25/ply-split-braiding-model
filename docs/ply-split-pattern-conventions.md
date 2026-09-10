# Ply-Split Braiding Pattern Conventions

> Research notes for choosing the human notation and internal pattern model of a ply-split design program.  
> Last reviewed: 2026-09-03

The project's focused text-file convention is defined in [SCOT Pattern Text Format Specification](./scot-pattern-format-spec.md).

## 1. Short answer

There does **not appear to be one universal, formal pattern notation** for all ply-split braiding. The sources reviewed use a related family of conventions, normally combining:

1. a picture or colour chart of the intended face;
2. a starting cord-colour sequence;
3. cord numbers and a splitter/splittee shorthand;
4. row-by-row instructions, often alternating short and long rows;
5. structural diagrams for direction, cord path, twist, turns, and special operations.

No published interchange format or standard comparable to an ISO specification was found in this review. This is a finding from the sources located, not proof that no other convention exists.

The most general recurring visual convention is a **45-degree diamond grid**. It works particularly well as an appearance chart for TLOI. It must not be treated as a complete representation of every ply-split structure: POT, SCOT, darning, curved work, multiple fells, edges, and three-dimensional shaping require additional construction data.[^collingwood-tloi][^collingwood-scot]

## 2. Four layers found in published patterns

### Layer A: appearance chart

The pattern is drawn as a band of small diamonds on a 45-degree grid. Filled diamonds represent the desired visible colour. In Collingwood's TLOI example, any geometric, representational, symmetric, or asymmetric two-colour motif can be drawn by filling the diamonds.[^collingwood-tloi]

This view answers:

- What should the visible face look like?
- Where does the foreground or background colour appear?
- How wide and long is the motif?

It does not, by itself, answer which cord splits which, the working direction, or how the borders are made.

### Layer B: setup chart

Patterns commonly specify:

- number of cords;
- cord construction, such as solid colour or two dark plus two light plies;
- starting colour sequence using letters such as `A`, `B`, and `C`;
- attachment to a rod, ring, or starting cord;
- cord numbering and initial face/orientation.

Examples in Julie Hedges's introductory guide include sequences such as `CBAAAABC` for a SCOT chevron and `AABBBBAA` for a two-colour POT sample.[^hedges]

### Layer C: operation or row instructions

A widespread shorthand is:

```text
splitter > splittee
```

For example, Collingwood writes `3 > 2` to mean that cord 3 passes through, and therefore splits, cord 2. A sequence such as `3 > 2, 5 > 4, 7 > 6` describes several separate splits in one row.[^collingwood-pot]

Hedges extends the same idea for one splitter passing through several splittees:

```text
1 > 2,3,4
```

This means cord 1 is taken through cords 2, 3, and 4 in succession.[^hedges]

Written patterns then add prose such as:

- omit a boundary cord;
- work a short or long row;
- turn the work over;
- work rightward or leftward;
- leave a quarter twist or half twist;
- repeat specified rows.

The `>` symbol indicates the splitter/splittee relationship, not enough information to encode screen direction, face, twist, or an entire physical step.

### Layer D: structural diagram

Structural diagrams draw the actual cord paths. Published examples use combinations of:

- pale and dark bands for cord colours;
- loops and crossings to show successive splits;
- one emphasized path to trace a course;
- cord numbers at the working edge;
- heavy separator lines for multiple fells or sections;
- small marks or annotations for quarter twists;
- arrows for the direction in which a cord is pulled;
- separate drawings for rightward and leftward splittings.

These diagrams are valuable because the same face design can arise from different structures. Their graphic symbols vary by author and illustration, so a program should provide a legend rather than assume that every reader knows them.

## 3. The TLOI diamond-grid convention

TLOI is the clearest case of a colour chart compiling into instructions.

### Grid geometry

For the 16-cord flat example in Collingwood's article:

- the long row contains 8 split positions;
- the short row contains 7 split positions;
- together they span 15 diamonds, one fewer than the total cord count;
- the work alternates long and short rows.

For an even number `N` of cords in the same flat arrangement, the natural derived layout is:

```text
long-row cells  = N / 2
short-row cells = N / 2 - 1
pair width      = N - 1 cells
```

This formula is a generalization from the published arrangement and must be tested for every supported starting and edge method.

### Cell meaning

Each diamond is a requested **visible colour at one split location**, not simply a coloured cord and not an over/under weaving cell.

With a normal two-colour `AABB` four-ply TLOI cord, the maker compares the requested colour with the same cord's previous relevant appearance:

- keep the orientation when the required colour is unchanged;
- use a half twist when the required colour changes.

The exact working rule depends on the setup and row history. Therefore the program should compute the twist from cord state, not store only the coloured cell.[^collingwood-tloi]

### Two faces

The motif geometry is carried on both faces, while the colours are reversed. The program should always offer front and back previews and label which face is currently being worked.

### Existing TLOI software

Ginko Koubou's **PlySplit Plotter** confirms continued use of a grid-based approach. Its product description says the Excel workbook uses a special `PlysplitPatterns` font and macros to:

- invert dark and light;
- change colours;
- mirror designs;
- insert blank rows;
- generate the reverse image for TLOI;
- include sample designs for TLOI and for SCOT/darning.[^plotter]

Its screenshots show the pattern and reverse view side by side in spreadsheet cells. This is useful evidence for user-interface expectations, but `.xlsm` cells plus a special font are an application format, not a general interchange standard.

## 4. POT conventions

POT commonly uses the same diagonal visual language, but the structure is more constrained. Every cord alternates between splitter and splittee roles.

A basic flat POT pattern can be written as alternating rows. In Hedges's eight-cord example:

```text
Short row: omit 1; 2 > 3; 4 > 5; 6 > 7; leave 8
Long row:  1 > 2; 3 > 4; 5 > 6; 7 > 8
Turn after each row and repeat.
```

The starting colour order controls much of the visible pattern. Unlike TLOI, an arbitrary recolouring of diamond cells may not compile to the same POT structure. The design program should therefore treat a POT chart primarily as the **result of cord sequence and structural operations**, not as unconstrained pixels.[^collingwood-pot][^hedges]

Published POT designs also use special operations such as twined linking, slits, cord additions/removals, and changes in the number of splittings to create boundaries, corners, width changes, or three-dimensional forms. These require explicit symbols and cannot be recovered reliably from colour alone.[^collingwood-pot]

## 5. SCOT conventions

SCOT diagrams also often use a familiar 45-degree grid for readability, although the real cords do not necessarily remain at 45 degrees. A splitter passes over at least two adjacent cords on the opposite course, and repeated splittings can pull the cord paths into shallower or steeper angles.[^collingwood-scot]

SCOT instructions therefore emphasize:

- which cord is the active splitter;
- the ordered list of cords it splits;
- rightward or leftward working direction;
- the fell or section being worked;
- quarter twists between splits;
- turning, inversions, curves, and changes between V- and A-shaped fells.

A surface-colour grid is useful for preview, but is less complete than an ordered operation path. The program should edit or generate the SCOT split sequence and derive the face preview from it.

## 6. Weaving drawdowns as an alternative design source

Barbara J. Walker developed a method for interpreting the drawdown portion of ordinary weaving drafts as ply-split designs. Her material describes using single-layer weave structures, including multi-shaft designs, for flat ply-split work.[^walker]

This is an important import workflow, not a universal native notation. A weaving drawdown records over/under interlacement, whereas a ply-split pattern must eventually decide splitter/splittee roles and cord state. A future importer should preserve the original drawdown and show the derived ply-split operations for verification.

## 7. Recommended general pattern system for this program

Use one canonical construction model and generate several familiar views from it.

### 7.1 Canonical event notation

Keep the historical `>` shorthand in printed instructions, but make the stored event explicit:

```json
{
  "course": 12,
  "step": 3,
  "workingFace": "front",
  "splitter": "C03",
  "splittees": ["C04", "C05", "C06"],
  "direction": "right",
  "splitPartition": [[0, 1], [2, 3]],
  "rotationQuarterTurns": 1,
  "afterStep": "continue"
}
```

This can be displayed compactly as:

```text
Course 12, front: C03 > C04,C05,C06; rightward; 1/4 turn
```

The IDs should be stable and zero-padded for sorting. Internal ply indexes can be zero-based; all human-facing cord and ply numbers should be one-based.

### 7.2 Three synchronized editors

| View | Primary users | What it edits | What the program derives |
| --- | --- | --- | --- |
| **Colour/motif view** | Designers | Desired visible cell colours on a diamond grid | Required TLOI rotations or candidate SCOT choices |
| **Structure view** | Advanced makers and developers | Cord paths, roles, split partitions, twists, edges | Front/back appearance and validity |
| **Instruction view** | Makers | Ordered courses and named special operations | Printable steps and highlighted current position |

An edit in any view should update the other two or report why it cannot be compiled.

### 7.3 Minimum document metadata

```text
format name and version
pattern title, author, date, licence, provenance
technique: POT | SCOT | TLOI | PSD | hybrid
project form and starting method
front/back and top/bottom orientation
working direction and whether the work turns after a course
cord count and one-based display numbering
per-cord ply colours, ply order, twist direction, and material
ordered split events and special operations
palette with printable symbols as well as colours
repeat region, borders, and finishing method
notes and source references
```

### 7.4 Visual accessibility

Do not encode state by colour alone. Every palette colour should have an optional symbol or hatch. Use different visual channels for different concepts:

- fill or hatch = visible colour;
- line/path = cord identity and continuity;
- arrow = working direction;
- badge or emphasis = splitter;
- split marker = splittee and selected ply partition;
- curved rotation arrow with `0`, `1/4`, `1/2`, etc. = cord rotation;
- heavy boundary = fell, section, edge, or repeat boundary, as identified by its label.

Always include a legend and an orientation marker.

## 8. Compatibility decisions

The program should support these exports:

- a traditional 45-degree diamond colour chart;
- numbered row instructions using `splitter > splittee(s)`;
- front and back previews;
- a cord setup/colour sequence;
- a detailed structural diagram with legend;
- a versioned JSON file as the lossless native representation;
- SVG and PDF for printing, with symbols retained in monochrome.

The program should not make these assumptions globally:

- every diamond is an independently editable pixel;
- every project alternates the same short and long rows;
- all cords have four plies;
- every split is two plies over and two under;
- every braid is flat, rectangular, or turned after every row;
- cord colour alone determines surface colour;
- a front image is sufficient to reconstruct the back or the making sequence.

## 9. Proposed version-1 convention

For the first implementation, use:

1. a flat, even-cord-count TLOI band;
2. a vertical 45-degree diamond chart;
3. rows numbered from the starting edge toward the growing edge;
4. positions numbered left to right as seen on the labelled working face;
5. explicit `front`/`back` and `turned` state;
6. stable cord IDs `C01`, `C02`, ...;
7. human instructions in the familiar `C01 > C02` form;
8. stored rotation values in quarter-turn units;
9. automatic reverse-face preview;
10. a legend printed with every export.

This convention is familiar enough to compare with the literature, while its event data removes ambiguities that the printed conventions leave to an experienced maker.

## 10. Findings that still need maker validation

- Whether contemporary teachers consistently interpret `a > b` in the same direction.
- Preferred row-numbering direction and whether “row” or “course” is clearer for each technique.
- Exact left/right conventions when the piece is turned over.
- Which twist mark vocabulary is most familiar to current makers.
- How TLOI charts handle borders, odd cord counts, and nonstandard start methods.
- Whether a specialist would expect splittees after `>` to be listed in physical encounter order.
- Which parts of a weaving drawdown can be converted automatically without changing the intended structure.

These questions should be tested with at least one experienced POT/SCOT maker and one experienced TLOI maker before freezing the file format or UI labels.

## Sources

[^collingwood-pot]: Peter Collingwood, [“Ply-Split Braiding”](https://www2.cs.arizona.edu/patterns/weaving/articles/cp_spb1.pdf), *Weaver's*, Issue 29, 1995, pp. 46-51. Original diagrams and instructions reviewed.
[^collingwood-tloi]: Peter Collingwood, [“Ply-Split Braiding Part II: Two-Layered Oblique Interlacing”](https://www2.cs.arizona.edu/patterns/weaving/articles/cp_spb2.pdf), *Weaver's*, Issue 32, 1996, pp. 46-49. Original design grids and structural diagrams reviewed.
[^collingwood-scot]: Peter Collingwood, [“Single Course Oblique Twining”](https://www2.cs.arizona.edu/patterns/weaving/articles/cp_obtwn.pdf), *Weaver's*, Issue 42, 1998, pp. 56-59. Original structural diagrams reviewed.
[^hedges]: Julie Hedges, [“Ply-Split Braiding - An Introduction”](https://thebraidsociety.wildapricot.org/Ply-splitting), The Braid Society beginner guide, 2016.
[^plotter]: Ginko Koubou, [“PlySplit Plotter EXCEL soft”](https://ginakoubou.ocnk.net/product/24), product description and screenshots, accessed 2026-09-03.
[^walker]: Barbara J. Walker, [“Ply-Splitting Workshops”](https://barbarajwalker.com/teaching/ply-splitting-workshops/) and *Ply-Splitting from Drawdowns: Interpreting Weave Structures in Ply-Split Braiding* (2012).
