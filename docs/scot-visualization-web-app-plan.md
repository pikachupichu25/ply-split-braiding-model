# SCOT Visualization Web App Plan

> Architecture and rendering plan for turning the project's compact SCOT notation into an interactive diagram.  
> Status: proposed  
> Last updated: 2026-09-03

This plan builds on the [SCOT Pattern Text Format Specification](./scot-pattern-format-spec.md). The first implementation should be a **structural simulator with an SVG view**, not a colour-grid painting tool. In SCOT, the ordered splitting operations determine the cord paths; the visible image is a result of those paths.

For the implemented Finished UI, use the [Finished Visualization Specification](./finished-visualization-spec.md). Its [split-event transition definition](./finished-visualization-spec.md#22-split-event-transition) and [interlocking surface rules](./finished-visualization-spec.md#75-interlocking-transition-surface) govern Finished v1 and Finished (dev); the construction-diagram proposals below do not replace those rules.

## 1. Version 1 outcome

Given:

```text
color: CBAAAABC

1 1>2,3,4
2 8>7,6,5,4

[repeat 1-2]
```

the app should:

1. parse and validate the text while the user types;
2. simulate each split using physical cord identities;
3. display continuous coloured cord paths;
4. show which cord is the splitter and which cords are splittees;
5. step forward and backward by row or by individual split;
6. preview a finite number of repetitions;
7. switch between front and back views; and
8. export the diagram as SVG.

Version 1 covers flat SCOT, one splitter action per written row, and an automatic turn after each row. Twists, several fells, shaping, joins, and finishing belong in later versions.

## 2. Required notation clarification

### 2.1 The problem

The text-format draft currently describes `1`, `2`, and so on as permanent cord identities. That interpretation is not sufficient for a repeating visual simulation.

After executing `1>2,3,4`, the original cord 1 has moved across the original cords 2-4. It is now located between the original cords 4 and 5. Consequently, the next action `8>7,6,5,4` cannot mean that original cord 8 encounters original cords 7, 6, 5, and 4 without also accounting for original cord 1.

### 2.2 Recommended interpretation: numbered lanes

In the human-facing pattern, numbers should mean **current positions in fixed, front-oriented diagram lanes**, not permanent cord identities.

- Lanes are numbered `1..N` from left to right in the initial/front orientation.
- On the front, visible lane labels run `1,2,...,N` from left to right.
- After turning to the back, visible lane labels run `N,...,2,1` from left to right.
- A row resolves its lane numbers to whichever physical cords occupy those lanes at that moment.
- The simulator gives every physical cord a separate stable ID, such as `C01`, solely for tracking paths and colour.

This keeps the requested notation compact and makes the two-row repeat deterministic. A later format could distinguish explicit lane references (`p1`) from explicit cord references (`c1`), but version 1 does not need that syntax.

### 2.3 Example resolution

| Moment | Working face | Visible lane labels, left to right | Stable cords in those visible lanes |
| --- | --- | --- | --- |
| Start | front | `1 2 3 4 5 6 7 8` | `C01 C02 C03 C04 C05 C06 C07 C08` |
| After row 1 and turn | back | `8 7 6 5 4 3 2 1` | `C08 C07 C06 C05 C01 C04 C03 C02` |
| After row 2 and turn | front | `1 2 3 4 5 6 7 8` | `C02 C03 C04 C08 C01 C05 C06 C07` |

Therefore:

- row 1 resolves lane instruction `1>2,3,4` to `C01>C02,C03,C04`;
- row 2 resolves lane instruction `8>7,6,5,4` to `C08>C07,C06,C05,C01`;
- the next repeated row 1 resolves to `C02>C03,C04,C08`.

This interpretation should be checked against a hand-worked sample before it becomes version 0.2 of the text specification.

## 3. Conversion pipeline: text to image

```text
.scot text
    -> tokens and source locations
    -> parsed pattern (AST)
    -> validation diagnostics
    -> finite expanded row sequence
    -> stable-cord simulation events
    -> geometric layout model
    -> layered SVG
```

Each stage should be a pure function where practical. Separating simulation from geometry makes it possible to test whether a pattern is structurally valid without depending on browser drawing.

### 3.1 Parse

The parser produces an abstract syntax tree while retaining line and column ranges for error messages.

```ts
type PatternAst = {
  colors: string[];
  rows: RowAst[];
  repeat?: { fromRow: number; throughRow: number; count?: number };
};

type RowAst = {
  number: number;
  splitterLane: number;
  splitteeLanes: number[];
};
```

A small handwritten tokenizer/parser is preferable to a parser framework because the grammar is short. It should recover after a bad line so the editor can still render valid earlier rows.

### 3.2 Validate

Run two levels of validation:

- **Text validation:** missing colour line, duplicate row number, invalid number, duplicate splittee, invalid repeat range.
- **Structural validation:** splitter and splittees must occupy adjacent lanes, splittees must be contiguous, and their order must follow the splitter's direction of travel.

Diagnostics should include a short message, severity, and exact source range. The visualization must stop at the first structurally impossible event but continue showing everything valid before it.

### 3.3 Expand repeats safely

An open repeat such as `[repeat 1-2]` is infinite in the maker's instructions, but an image must be finite. The preview should have a repeat-count control, initially set to four complete repeats. Expansion happens before simulation and should have a configurable upper limit to protect the browser.

### 3.4 Initialize stable cord state

```ts
type CordState = {
  id: string;          // C01, C02, ...; never changes
  colorSymbol: string; // A, B, C, ...
};

type BraidState = {
  lanes: CordState[];  // always stored in canonical front order
  workingFace: "front" | "back";
};
```

The UI may show lane numbers, stable IDs, or both. Maker instructions use lane numbers; continuous SVG paths use stable IDs.

### 3.5 Simulate each split

For a row:

1. resolve every written lane number to the stable cord currently in that lane;
2. confirm that the splitter is adjacent to the first splittee;
3. successively swap the splitter with each splittee in the listed order;
4. store one immutable `SplitEvent` per swap;
5. store a row snapshot for stepping backward; and
6. toggle the working face.

```ts
type SplitEvent = {
  rowInstance: number;
  splitIndex: number;
  face: "front" | "back";
  splitterId: string;
  splitteeId: string;
  fromLane: number;
  toLane: number;
};
```

The event log is the canonical visualization input. Do not infer crossings later from colours or from the final lane order.

### 3.6 Lay out the geometry

Use a logical coordinate system independent of pixels:

- `x = lane * laneGap` for lane centres;
- one vertical band per written row;
- one event position inside the band for every successive split;
- cubic Bézier curves to connect a stable cord's positions between events;
- padding derived from cord width so edge cords are never clipped.

The first renderer should prioritize legibility over exact yarn physics. It is a construction diagram. A later “material view” may add twist, thickness, texture, and tension-driven curvature without changing the simulation.

### 3.7 Render the split, not just a crossing

A normal over/under crossing would be misleading because the splitter passes **through the plies** of the splittee. Render every event as a local layered group:

1. draw the splittee's coloured outer stroke;
2. open a small masked gap at the event;
3. draw the splitter through the centre;
4. redraw two narrow splittee-ply strokes on opposite sides of the splitter; and
5. add a selectable event marker in construction mode.

SVG masks and paths make this possible while keeping the result scalable and exportable.[^svg-path] Rendering order must be decided per split event; there is no single global “cord A is always above cord B” order.

### 3.8 Build several views from one model

| View | Purpose | Default detail |
| --- | --- | --- |
| Braid view | Understand the developing object | Coloured continuous cords and split openings |
| Construction view | Verify the instructions | Lane labels, stable IDs, arrows, row boundaries, selected split |
| Step view | Follow while making | One active event; past events normal and future events faded |
| Motif view | See the overall colour rhythm | Simplified small-scale result; optional after the structural view works |

The construction view is the debugging truth. The attractive braid view should never hide an invalid or ambiguous operation.

## 4. Interface plan

Use a split workspace:

- **Left:** plain-text editor, colour-symbol palette, diagnostics, and short plain-language meaning of the selected row.
- **Right:** responsive SVG canvas with braid/construction/front/back controls.
- **Top:** pattern name, validity status, repeat-count control, and export.
- **Bottom:** previous/next split, previous/next row, play/pause, and current row such as `Row 2 · split 3 of 4`.

For the visual direction, use an editorial textile-workshop character: warm paper, charcoal drafting marks, oxblood and indigo controls, tactile cord colours, a subtle diagonal construction grid, a distinctive serif display face, and a compact monospaced instruction face. Motion should be limited to tracing the active cord and transitioning between steps.

Colour alone must not carry meaning. Construction mode should also use labels, outlines, and optional hatching. The SVG needs `<title>` and `<desc>` text, and every step must be reachable by keyboard.

## 5. Recommended technology stack

| Layer | Recommendation | Reason |
| --- | --- | --- |
| App | React 19.2 + TypeScript, strict mode | Component UI with strong typed boundaries between parser, simulator, and renderer |
| Build | Vite 8.2 | Fast local iteration and a simple static production bundle |
| Drawing | Native SVG | Crisp paths, masks, labels, hit targets, accessibility, and direct SVG export |
| Styling | CSS Modules + CSS custom properties | Scoped component styles without committing to a design-system dependency |
| State | React `useReducer` plus pure domain functions | Enough for version 1; keeps simulation deterministic and testable |
| Unit tests | Vitest | Parser, validator, simulator, layout, and topology invariants[^vitest] |
| Component tests | React Testing Library | Interaction and accessibility behavior[^testing-library] |
| Browser tests | Playwright | Editor-to-SVG workflows and a small visual-regression set[^playwright] |
| Persistence | `.scot` download/upload + `localStorage` draft | Offline-first with no account or backend requirement |
| Deployment | Static hosting | The parser, simulator, and renderer can all run locally in the browser |

Pin exact patch versions when the app is scaffolded. React's official version page currently identifies 19.2 as latest, while Vite lists 8.2 as its regular patch line.[^react-versions][^vite-releases]

### Why SVG instead of Canvas

SVG is the better version 1 choice because every cord and split remains an inspectable object. It supports path curves, masks, pointer events, text, scaling, and file export directly. Canvas becomes worthwhile only if testing shows that thousands of split events cannot render smoothly.

### Why not D3, WebGL, or a backend yet

- D3 is unnecessary for a deterministic lane layout and would add another abstraction to debug.
- WebGL makes local masking, text, and SVG export harder without solving a demonstrated performance problem.
- A backend is unnecessary until the product needs accounts, sharing, collaboration, or a public pattern library.
- A dedicated state library can be introduced later if undo history and synchronized editors outgrow `useReducer`.

## 6. Suggested source layout

```text
src/
  domain/
    types.ts
    parser.ts
    validate.ts
    expandRepeats.ts
    simulate.ts
  layout/
    buildLayout.ts
    bezier.ts
  render/
    BraidSvg.tsx
    CordPath.tsx
    SplitEvent.tsx
  ui/
    PatternEditor.tsx
    PreviewToolbar.tsx
    StepControls.tsx
    Diagnostics.tsx
  examples/
    chevron.scot
```

Keep `domain/` free of React and browser APIs. That makes the pattern engine reusable for command-line export or a future mobile app.

## 7. Delivery milestones

1. **Physical model check:** hand-trace at least four rows of the sample and confirm the lane-number interpretation with a real braid or an experienced maker.
2. **Parser:** return an AST and friendly source-positioned diagnostics.
3. **Simulator:** produce the exact stable-cord transitions shown in section 2.3 and pass topology tests.
4. **Diagnostic SVG:** draw lanes, cord centre lines, row bands, IDs, and split events.
5. **Split appearance:** add masks, ply separation, colour palette, and front/back view.
6. **Editor workflow:** live preview, repeat control, stepping, undo, and `.scot` import/export.
7. **Export and verification:** clean SVG export, responsive/mobile checks, accessibility checks, and maker review.

Do not begin the polished braid appearance until milestone 3 is correct. A beautiful rendering of the wrong topology would make later debugging much harder.

## 8. Minimum acceptance tests

- The sample parses without diagnostics.
- Four repeats always produce the same event log.
- Every stable cord has one continuous path.
- Row 2 resolves lane 4 to `C01` after row 1, not to `C04`.
- Reversing the working face reverses the visible lane labels but not the canonical stored lane order.
- A non-adjacent or out-of-order splittee produces an error at the correct text range.
- Selecting a text row highlights the matching SVG row, and selecting a split highlights its source text.
- The diagram remains understandable in grayscale and by keyboard.
- Exported SVG opens independently and preserves labels, colours, and masks.

## 9. Risks to verify with makers

- Whether a successive adjacent-swap model accurately represents tightening for the intended SCOT method.
- Whether the braid is turned after every row in all target patterns.
- Whether each splittee is divided into the same ply groups or needs explicit partition metadata.
- How quarter twists change which plies and colours are visible.
- Whether the schematic should show the working face, finished face, or both by default.

These are domain decisions, not drawing details. They should become explicit pattern data before the app claims physical accuracy.

## References

[^react-versions]: React, [React Versions](https://react.dev/versions).
[^vite-releases]: Vite, [Releases](https://vite.dev/releases).
[^svg-path]: MDN Web Docs, [SVG `<path>` element](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/path).
[^vitest]: Vitest, [Getting Started](https://vitest.dev/guide/).
[^testing-library]: Testing Library, [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
[^playwright]: Playwright, [Installation and introduction](https://playwright.dev/docs/intro).
