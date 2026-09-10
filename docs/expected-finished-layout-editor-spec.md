# Expected Finished Layout Editor — Product Specification

> Status: proposed MVP  
> Last updated: 2026-09-08  
> Purpose: let a human author the expected, correct finished-cell layout used as visual ground truth.

## 1. Summary

The **Expected Finished Layout Editor** is a small manual drafting tool. A user chooses the number of gap columns, places left- or right-leaning parallelogram cells into those columns, and moves the cells until the result matches the correct finished braid.

Cells stay inside a column horizontally but can move vertically. While a cell is dragged, its corners snap to useful points on nearby cell sides, especially the halfway point of a side. This makes full-edge joins, end-to-end stacking, and half-side transition joins easy to create exactly.

The saved document is human-authored reference data. It can later be loaded beside an automatically generated Finished view or used by visual/layout tests.

## 2. Goals

The MVP must let a user:

1. create a blank layout with a chosen number of columns;
2. add either a left-leaning or right-leaning cell to any column;
3. select and move any cell;
4. snap a moving cell to side endpoints and side midpoints;
5. move a cell to another column;
6. duplicate or delete a cell;
7. record the cell's event ID, splitter ID, and splittee ID;
8. select several cells by dragging a rectangular marquee or applying an event-ID condition;
9. apply lean, fill, or deletion changes to the current multi-selection;
10. undo and redo editing actions;
11. save and reload the editable layout as JSON; and
12. export a clean SVG preview of the expected result.

The editor should make exact placement quick without preventing unusual but valid arrangements such as gaps or partial overlap between opposite-leaning cells.

## 3. Non-goals for the MVP

- Generating cells from SCOT notation.
- Deciding whether the human-authored layout is structurally correct.
- Automatically packing or rearranging cells.
- Drawing hidden splitter paths, cord tails, lane guides, or transition triangles.
- Comparing expected and generated layouts inside this editor.
- Multi-user collaboration or cloud storage.

Importing simulator events and binding cells to event IDs is a useful follow-up, described in section 13.

## 4. Terms

- **Column**: one gap between adjacent cord lanes. Columns are numbered from `1` on the left.
- **Cell**: one sharp-cornered parallelogram occupying exactly one column.
- **Lean**: the visible direction of the cell: `left` or `right`.
- **Side**: either vertical edge of a cell. Each side has a top point, midpoint, and bottom point.
- **Reference point**: the upper corner on the cell's incoming side. The stored vertical position refers to this point.
- **Half-side unit**: half of `cellSide`. It is the default vertical snapping increment.
- **Ground truth**: the layout explicitly placed and approved by a human.

## 5. Geometry

The editor reuses the Finished visualization geometry in [`finished-visualization-spec.md`](./finished-visualization-spec.md).

Default geometry:

```text
columnWidth = 100 logical units
theta       = 30 degrees
tipAngle    = 30 degrees

crossGapDrop = columnWidth * tan(theta)
cellSide     = columnWidth * (tan(theta) + 1 / tan(tipAngle))
halfSide     = cellSide / 2
```

Each cell:

- spans exactly one column horizontally;
- has two vertical sides of length `cellSide`;
- uses the same angle magnitude for both lean directions;
- has four sharp corners; and
- keeps its shape while being moved.

`right` means the crossing diagonal descends from the left boundary to the right boundary. `left` means it descends from the right boundary to the left boundary.

The canvas uses logical coordinates independent of browser zoom. Exported coordinates must be derived from these logical values, not rounded screen pixels.

## 6. Main user flow

### 6.1 Create a layout

On first load, show a short setup state:

- **Number of columns**: integer input, minimum `1`, maximum `64`, default `7`.
- **Create layout** button.

Creating the layout opens an empty canvas with the requested columns. Changing the count later uses a **Layout settings** action:

- increasing the count adds columns on the right;
- decreasing the count is immediate only when the removed columns are empty; and
- if removed columns contain cells, the UI asks the user to move those cells or confirm their deletion.

### 6.2 Add a cell

The toolbar has two persistent tools:

- **Add left-leaning cell**
- **Add right-leaning cell**

With an add tool active:

1. hover a column to see a translucent cell preview;
2. move vertically to position the preview;
3. click to place the cell; and
4. keep the same tool active so several cells can be added quickly.

Press `V` or `Escape` to return to the Select tool. Keyboard shortcuts `L` and `R` activate the two add tools.

The new cell uses the active fill colour and receives the next stable cell ID.

### 6.3 Select and move a cell

Clicking a cell selects it and shows:

- a high-contrast outline;
- small handles at the two side midpoints;
- its ID, column, lean, and vertical position in the inspector; and
- contextual actions for lean, colour, duplicate, and delete.

Drag the cell body to move it:

- vertical motion changes its position continuously;
- horizontal motion across a column boundary moves it into the neighbouring column;
- the cell preview remains constrained to exactly one column; and
- the final position is committed on pointer release.

Dragging from a side-midpoint handle starts the same move operation; it does not resize the cell.

### 6.4 Correct a cell

For the selected cell, the user can:

- switch lean without changing its column or reference-point height;
- enter a column number directly;
- enter an exact vertical value;
- choose a fill colour;
- duplicate with `Cmd/Ctrl+D`; or
- delete with `Delete` or `Backspace`.

### 6.5 Select multiple cells

With the Select tool active, dragging from empty canvas space draws a rectangular marquee. A cell joins the selection when its centre falls inside the rectangle. Hold `Shift`, `Cmd`, or `Ctrl` while starting the marquee to add to the existing selection. The same modifiers toggle individual cells when clicking them.

The inspector also provides **Select by condition** for event IDs. Supported comparisons are greater than, at least, equal to, less than, and at most; cells without an event ID never match. A multi-selection can receive one lean or fill colour in a single operation, be cleared, or be deleted together.

Dragging any cell in a multi-selection moves every selected cell as one group. Their relative column and vertical offsets stay unchanged. The dragged cell acts as the snap anchor, and the resulting snap delta is applied to the whole group. If the move would cross the first or last column, or place any selected cell above zero, the whole group stops at that boundary. Arrow keys also move the complete selection.

## 7. Snapping

Snapping is on by default and can be toggled from the toolbar. Holding `Alt/Option` temporarily disables it during a drag.

### 7.1 Snap points

Every vertical cell side exposes three snap targets:

```text
top endpoint
midpoint = top + cellSide / 2
bottom endpoint = top + cellSide
```

The moving cell exposes both corners on both vertical sides as snap sources. A snap is eligible only when the source and target lie on the same column boundary.

This supports the three important fits:

- **full-edge join**: top aligns with top, which also aligns both complete sides;
- **stacked contact**: a top corner aligns with another side's bottom endpoint; and
- **half-side join**: a top corner aligns with another side's midpoint.

### 7.2 Snap search and priority

During a drag, collect eligible targets from cells in the current column and its immediate neighbours. Choose a target only when it is within `10` screen pixels of the moving source point.

If more than one target is eligible, use this deterministic order:

1. shortest screen distance;
2. midpoint before endpoint when distances are equal;
3. lower cell ID as the final tie-breaker.

If no cell target is close enough, snap the reference point to the nearest half-side grid position:

```text
snappedY = round(y / halfSide) * halfSide
```

Free movement with `Alt/Option` preserves the exact unsnapped logical position.

### 7.3 Snap feedback

When a snap is active, show:

- a dot on the target;
- a dot on the moving source corner;
- a short boundary guide joining the two;
- the label **midpoint**, **endpoint**, or **½-side grid**; and
- a subtle click/tick response when the active target changes.

The preview must show the final snapped position before pointer release. For a single selection, snapping moves only the dragged cell. For a multi-selection, snapping moves the selected group by one shared delta and never changes the spacing between its cells.

## 8. Canvas behaviour

Column guides are editing aids, not part of the finished result.

- Show faint alternating column bands and column numbers while editing.
- Provide pan and zoom controls, plus **Fit all** and **100%**.
- Keep a generous vertical workspace; expand it automatically when a cell is dragged near the top or bottom.
- Allow cells to overlap. Do not treat overlap as an error.
- Draw cells in stored `zIndex` order. Selecting a cell temporarily raises its interaction outline, but does not silently change saved order.
- Provide **Bring forward** and **Send backward** when overlap makes selection ambiguous.
- Clicking an empty area clears selection.
- Pressing `Escape` cancels the current drag and restores the cell's starting position.

Pointer hit areas may extend slightly beyond the visible polygon, but should not cover the centre of a neighbouring cell.

## 9. Interface layout and visual direction

The editor should feel like a precise textile drafting table: quiet, tactile, and utilitarian rather than like a generic diagramming app.

Desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Expected layout   Select  ↙ Left  ↘ Right   Snap ✓   Export │
├───────────────┬──────────────────────────────────┬───────────┤
│ Layers/cells  │                                  │ Inspector │
│ C001  col 1   │          drafting canvas         │ Column    │
│ C002  col 2   │                                  │ Lean      │
│ ...           │                                  │ Y / Color │
├───────────────┴──────────────────────────────────┴───────────┤
│ 12 cells · 7 columns · Snap: midpoint/endpoint/½-side       │
└──────────────────────────────────────────────────────────────┘
```

Use warm off-white canvas paper, restrained graphite guides, and a strong rust or teal accent for selection and snap feedback. Cell colours should remain the dominant colour in the canvas. Avoid rounded cards around every control; use compact tool strips, rules, and clear typographic hierarchy.

For narrow screens, collapse the cell list and inspector into drawers. The MVP is desktop-first, but all editing controls must remain keyboard accessible.

## 10. Document format

Save layouts as UTF-8 JSON. Coordinates are normalized so documents remain stable if display scale changes.

```json
{
  "schemaVersion": 1,
  "kind": "expected-finished-layout",
  "name": "Double chevron — corrected",
  "columnCount": 7,
  "geometry": {
    "columnWidth": 100,
    "thetaDeg": 30,
    "tipAngleDeg": 30
  },
  "cells": [
    {
      "id": "C001",
      "column": 1,
      "lean": "right",
      "ySideUnits": 0,
      "fill": "#d3a448",
      "zIndex": 0,
      "eventId": 12,
      "splitterId": "C01",
      "splitteeId": "C02"
    },
    {
      "id": "C002",
      "column": 2,
      "lean": "left",
      "ySideUnits": 0.5,
      "fill": "#77b6c9",
      "zIndex": 1
    }
  ]
}
```

`ySideUnits` is the reference point's vertical position divided by `cellSide`. Therefore:

- `0.5` means half a side lower;
- `1` means one complete side lower; and
- unsnapped placements may use decimal values beyond half-step increments.

The loader must reject an unsupported `schemaVersion` with a clear message. It must also validate unique IDs, valid column numbers, finite positions, valid lean values, and parseable colours. Loading invalid data must not destroy the currently open document.

`eventId`, `splitterId`, and `splitteeId` are optional SplitEvent-style metadata. `eventId` is a non-negative integer; the cord IDs are non-empty strings when present. They allow the expected cell to be matched back to the simulator without replacing the editor's stable cell `id`.

## 11. Persistence and export

- Autosave the current working document to local storage after each committed edit.
- Keep at least `100` undoable actions during the current session.
- **Download JSON** saves the editable ground-truth document.
- **Open JSON** validates and replaces the current document only after successful parsing.
- **Export SVG** omits guides, selection, handles, snap markers, and editor chrome.
- The SVG view box fits all cell polygons with consistent padding.
- Export preserves exact cell geometry, fill, order, and sharp corners.
- Finished v2 provides **Export layout JSON**, producing this same document schema from its generated placement. It includes each cell's event ID, splitter ID, splittee ID, colour, column, lean, vertical position, and draw order. Back-face exports reverse columns and leans to match the displayed face.

Autosave is convenience only; downloaded JSON is the portable source of truth.

## 12. Accessibility and input requirements

- Every tool and inspector input has a visible label and tooltip.
- All controls have a visible keyboard focus state.
- Cell fill is not the only indicator of selection or lean.
- The selected cell can be nudged with arrow keys.
- Arrow keys move by `0.5` side units; `Shift+Arrow` moves by `0.1` side units.
- `Alt/Option+Arrow` moves without snapping by `0.01` side units.
- Left/Right arrows move the cell between columns when focus is on the canvas; Up/Down arrows adjust its vertical position.
- Announce actions such as “C012 moved to column 4, midpoint snapped” through a polite live region.
- Minimum interactive target size is `32 × 32` CSS pixels.

## 13. Follow-up capabilities

These should remain compatible with the MVP data model but are not required initially:

- import the generated Finished layout as a starting draft;
- overlay expected and generated layouts with adjustable opacity;
- report per-cell differences in column, lean, vertical position, fill, and order;
- mark a human-reviewed document as approved;
- add transition triangles as separate, editable surface annotations;
- attach a note or rationale to a cell; and
- export a test fixture directly into the repository.

Split-event metadata remains optional so existing manually created documents remain valid.

## 14. Acceptance criteria

The MVP is complete when all of the following are true:

1. A user can create a seven-column blank document and see exactly seven editable gap columns.
2. A user can place both lean directions in every column.
3. A placed cell never spans more or less than one column.
4. Dragging vertically updates only the selected cell.
5. Dragging horizontally can reassign a cell to another valid column.
6. A cell corner visibly snaps to another cell side's midpoint and saves a `0.5` side-unit relationship.
7. Endpoint and half-side-grid snapping also work and give distinct feedback.
8. Holding `Alt/Option` allows a free, unsnapped placement.
9. Valid overlap is preserved; the editor does not auto-pack cells.
10. Event ID, splitter ID, and splittee ID can be entered for each cell and survive JSON round-tripping.
11. A rectangular marquee selects every cell whose centre is inside it and gives immediate visual feedback.
12. An event-ID condition such as `event ID > 120` selects exactly the matching identified cells.
13. Lean, fill colour, and deletion can be applied to the current multi-selection as one undoable edit.
14. Undo and redo restore adds, moves, lean changes, column changes, colour changes, metadata changes, bulk changes, layer changes, and deletes.
15. Exported JSON can be reloaded without changing cell geometry or order.
16. Exported SVG contains only the finished cells and produces the same visible arrangement as the editing canvas.
17. Keyboard-only users can add, select, move, change, and delete cells.
18. Invalid imported JSON leaves the current layout unchanged and explains the error.

## 15. Decisions made in this draft

This draft assumes:

- “number of columns” means finished-view gap columns, not number of cords;
- all cells share one geometry configuration;
- the most important fit is corner-to-side-midpoint, with endpoint and half-side-grid snapping included for ordinary joins;
- cells may overlap because overlap can be structurally meaningful; and
- the first deliverable is a standalone human authoring tool, with automated comparison added later.
