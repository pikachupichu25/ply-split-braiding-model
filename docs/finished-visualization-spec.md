# Finished Visualization Specification

> Status: implementation baseline  
> Last updated: 2026-09-06

The parallelograms below define the **layout footprints**. Section 7.5 adds a triangle where transition edges intersect in the neighbouring column. Every original cell path and layout footprint stays unchanged, as does the event count. Finished v1 keeps the original parallelograms; Finished (dev) applies this surface treatment.

## 1. Purpose

The **Finished** visualization represents how the completed ply-split craft should look. It is a result view, not a construction diagram: it should show the visible surface created by the split events rather than the full paths of all cords.

This specification defines how the simulator's ordered `SplitEvent` records are converted into that finished surface.

## 2. Source data

The visualization uses the simulator's ordered `SplitEvent[]` as its canonical input. Each event includes:

- the stable identity of the splitter cord;
- the stable identity of the splittee cord;
- the splitter's starting lane (`fromLane`);
- the splitter's destination lane (`toLane`);
- the source row and split position; and
- the working face.

The finished visualization must be derived from these events. It must not infer split events from cord colors or final lane positions.

Cord trajectories may be maintained as internal layout state, but they are not themselves visible output.

### 2.1 Split event

A **split event** is one operation in which one splitter passes through one adjacent splittee and the two cords exchange lane positions. A row such as `1>2,3,4` produces three split events, all with the same physical splitter. The lane exchange does not itself exchange the cords' roles: within that event, `splitterId` remains the splitter and `splitteeId` remains the splittee.

`eventIndex` identifies an event in the expanded simulation and is zero-based. A repeated written row produces new events with new indices. A transition is a property derived from those events; it does not add another `SplitEvent`.

### 2.2 Split-event transition

A **role transition** occurs when a physical cord's role in its current event differs from its role in its most recent earlier event involving that same cord. Ignore intervening events involving other cords. Track this history by stable cord ID across row boundaries, repeats, and working-face changes.

| Previous role of the same cord | Current role | Finished-view meaning |
| --- | --- | --- |
| No previous participation | Either role | First appearance; no role transition. |
| Splittee | Splittee | Continue the visible ribbon where the layout connects it. |
| Splitter | Splitter | Continue the hidden splitter trajectory. |
| Splittee | Splitter | The cord leaves its visible run. Where its previous splittee cell and the current splittee cell occupy adjacent gaps, add an intersection triangle at their shared end. Remove the previous visible end as a continuity constraint; add no extra split cell. |
| Splitter | Splittee | The cord returns to the visible surface. This event's splittee cell is the transition cell and may receive the interlocking treatment in section 7.5. |

In the Finished UI, **split-event transition** includes both role changes: splitter-to-splittee and splittee-to-splitter. Detect each participant's change before recording either role for the current event. `FinishedCell.allowsOverlap` marks the provisional placement allowance for splitter-to-splittee only; final column packing removes base-cell overlaps regardless of this flag. It is not the general test for whether an event needs transition rendering.

Both participants in an event can change roles. The current event still has one splittee-coloured surface, and its two ends can receive transition triangles independently: the incoming end for a returning splittee, and the outgoing end where a previously visible splittee becomes the current splitter. A change of splitter between rows, a change of colour, a lane swap, a new repeat, or a Front/Back switch alone does not establish a transition. The current event need not be immediately after the returning cord's previous event, and its current splitter need not be the host through which that cord last passed.

#### 2.2.1 Detection algorithm

A cell is considered a **transition when either participating cord changes roles compared with its most recent participation**. Process cells in simulation event order and maintain `lastParticipation`, a map from each stable cord ID to its latest event cell.

For each current event, perform both checks before updating the map:

| Current participant | Its previous role | Transition | End for the triangle |
| --- | --- | --- | --- |
| Splittee | Splitter | Splitter → splittee (`emergence`) | Incoming end |
| Splitter | Splittee | Splittee → splitter (`departure`) | Outgoing end |

```text
previousSplittee = lastParticipation[current.splitteeId]
previousSplitter = lastParticipation[current.splitterId]

isReturning = previousSplittee exists
              and previousSplittee.splitterId == current.splitteeId

isDeparting = previousSplitter exists
              and previousSplitter.splitteeId == current.splitterId

isTransition = isReturning or isDeparting

lastParticipation[current.splitteeId] = current
lastParticipation[current.splitterId] = current
```

Both checks can succeed for one event, allowing a triangle at each end. A cord with no prior participation, or whose role stays the same, does not trigger a transition for that participant. Unrelated intervening events leave its stored participation unchanged. Colours, column numbers, row boundaries, and face changes are not detection criteria.

For example, using zero-based event indices from the 24-cord double chevron:

```text
Event 5:  C12 splits C13 → C13 is a splittee
Event 12: C13 splits C11 → C13 becomes a splitter
                           ⇒ splittee-to-splitter transition
```

**Rendering is a separate check.** The relevant cells must occupy adjacent gaps, share a vertical boundary, and produce finite diagonal intersections within the combined extent of those gaps. A detected role change retains its ordinary end if these geometry checks fail. In the implementation, `emergence` and `departure` contain successful rendering details; their absence alone does not prove that no role change occurred.

See [`buildFinishedSurfaces` in finishedSurface.ts](../src/domain/finishedSurface.ts) for the detection checks and `transitionTriangle` for geometric eligibility.

### 2.3 Transition cord and neighbouring material

For a splitter-to-splittee transition event `E`, the **returning cord** is `E.splitteeId`. Let `H` be that cord's most recent earlier participation. Since this is a splitter-to-splittee transition:

```text
H.splitterId = E.splitteeId
hostEventIndex = H.eventIndex
hostCordId = H.splitteeId
```

The **host** is the splittee from `H`: the last cord through which the returning cord passed while acting as a splitter. Use `H`'s layout cell to obtain the host edge. Select it by event history even if several cords have the same colour.

For a splittee-to-splitter transition, the **departing cord** is `E.splitterId`. Its most recent participation `P` was as a splittee:

```text
P.splitteeId = E.splitterId
hostEventIndex = P.eventIndex
hostCordId = P.splitteeId
```

Here the neighbouring material is the departing cord's previous visible splittee cell. Construct the extra triangle at the current cell's outgoing end where it shares a boundary with that previous cell. The triangle's colour comes from the ribbon extending into the column containing the intersection, as defined in section 7.5. This represents material that was already visible as a splittee; it does not draw the cord's intervening splitter trajectory.

Transition detection and surface eligibility are separate. A role transition remains a transition even when the geometry checks in section 7.5 retain the ordinary surface. Rendering a departure does not grant a new layout overlap allowance. At outer braid edges, a departing cord may have its previous cell in the same gap; that is still a role change, but it does not create an adjacent-gap interlocking join.

## 3. Visible unit

Each `SplitEvent` produces exactly one visible **split cell**, based on a sharp parallelogram footprint and the local emergence treatment in section 7.5.

- The primary split-cell surface shows the current event's splittee. At a rendered transition, the ribbon extending across the seam supplies the extra triangle described in section 7.5.
- The splitter is not drawn in the finished visualization.
- Starting cords, cord tails, and cord paths are not drawn.
- The split cell represents the visible splittee material at that split.
- The split cell uses the splittee cord's color.
- The split cell leans to indicate the splitter's direction of travel.

Layout cells have four sharp corners and two vertical sides. Every base surface retains those corners, including at transitions. An additional triangle extends a ribbon to the neighbouring diagonal.

## 4. Direction

Direction is determined in the canonical lane model from the split event:

```text
toLane > fromLane  => left-to-right split
toLane < fromLane  => right-to-left split
```

The visible cell lean is:

| Splitter movement | Cell lean |
| --- | --- |
| Left to right | Right-leaning cell |
| Right to left | Left-leaning cell |

A right-leaning cell's splitter crossing descends by `+theta` from the visualization's chosen baseline. A left-leaning cell uses the opposite sign, `-theta`. The sign convention may be adapted to SVG screen coordinates during implementation, provided the visible lean is correct.

`theta` is an optional visualization parameter. The default is:

```text
theta default = 30 degrees
```

Both lean directions use the same angle magnitude. The standard UI permits values from 10 through 60 degrees.

A split event whose `fromLane` equals `toLane` is invalid and cannot be rendered.

Back display is a horizontal mirror of Front display. It reverses columns and visible lean directions while preserving splittee colors and top-to-bottom order.

## 5. Columns

Columns represent the spaces between adjacent cord lanes, not the cords themselves.

Columns are layout coordinates only. The Finished visualization does not draw column boundaries, lane guides, column numbers, or other construction guides.

For `N` cords, the visualization has `N - 1` columns. Therefore, an eight-cord pattern has seven columns:

| Column | Space represented |
| --- | --- |
| 1 | Between lanes 1 and 2 |
| 2 | Between lanes 2 and 3 |
| 3 | Between lanes 3 and 4 |
| 4 | Between lanes 4 and 5 |
| 5 | Between lanes 5 and 6 |
| 6 | Between lanes 6 and 7 |
| 7 | Between lanes 7 and 8 |

Because a valid `SplitEvent` moves between adjacent lanes, its column is:

```text
column = min(fromLane, toLane)
```

Examples:

```text
1 -> 2  => column 1, right-leaning
2 -> 1  => column 1, left-leaning
6 -> 7  => column 6, right-leaning
8 -> 7  => column 7, left-leaning
```

### 5.1 Cell span and side

Let the horizontal distance between two neighboring column boundaries be `columnWidth`.

A split cell is a parallelogram. Two of its sides are vertical segments lying on the two boundaries of its gap column; the other two are parallel and carry the cell's lean. The splitter's crossing line runs corner to corner from one boundary to the other:

```text
horizontal projection = columnWidth
cellSpan              = columnWidth / cos(theta)
crossGapDrop          = columnWidth * tan(theta)
```

`cellSpan` is the length of that crossing diagonal. It is greater than the horizontal column width because it is rotated. At the default angle of 30 degrees, it is approximately `1.155 * columnWidth`.

The two vertical sides share a common length, `cellSide`. That length is the cell's footprint on each column boundary, and it is set by the cell's **tip angle**: the acute interior angle, which occurs at the two corners that do not lie on the splitter's line.

```text
cellSide = columnWidth * (tan(theta) + 1 / tan(tipAngle))
```

`tipAngle` is an optional visualization parameter. The default is:

```text
tipAngle default = 30 degrees
```

The standard UI permits values from 10 through 90 degrees. A smaller tip angle makes each cord read as a longer, sharper sliver; at `tipAngle = 90` the slanted sides become horizontal and the cell is a `columnWidth` by `crossGapDrop` rectangle.

The surface tiles exactly — no overlap and no gap — at the packed tip angle:

```text
packedTipAngle = 2 * theta
packedSide     = columnWidth / sin(2 * theta)
```

That is the equilateral case, in which all four sides are equal and the parallelogram degenerates to a rhombus. A larger tip angle makes cells thinner than that pitch and a smaller one makes them thicker; the collision rule of section 7.3 absorbs the difference by translating whole connected ribbon runs.

Given a cell whose splitter crossing runs from `start` on one boundary to `end` on the other, the four vertices are:

```text
start
start + (0, cellSide)
end
end - (0, cellSide)
```

so `start` is the upper corner on its own boundary and `end` is the lower corner on the opposite boundary. The vertex order is chosen so the outline does not self-intersect in either lean direction.

All split cells use sharp, non-rounded corners.

## 6. Event-to-shape mapping

For each split event, the renderer must:

1. Find its gap column using `min(fromLane, toLane)`.
2. Determine its direction by comparing `fromLane` and `toLane`.
3. Create one rotated cell.
4. Fill the cell with the event's splittee cord color.
5. Associate that cell with the event's splittee cord.
6. Place the cell in top-to-bottom construction order.
7. In Finished (dev), add eligible transition triangles using the changing cord's previous participation. In Finished v1, retain the original parallelogram surface.

The renderer must preserve enough event identity to inspect or test which `SplitEvent` produced each cell.

## 7. Vertical placement and continuity

The finished craft grows from top to bottom on screen.

Two different runs of cells are formed, and they must not be confused:

- **A cord's run.** Successive splittee cells of the same stable cord share their complete common boundary edge. Both endpoints must align for adjacent-gap continuations, including across course changes. Partial overlap or point contact is insufficient for those joins. A return through the same gap starts a new run below the earlier cell; aligning their same-side edges would overlap their interiors. This is the run the finished surface makes visible.
- **A splitter action's run.** Each event crosses one gap column. An ordinary action descends by `crossGapDrop` per event. Returning courses can ascend instead. These are provisional row arrangements: exact splittee connections take precedence over keeping the action on one rigid line. The cells retain their original parallelogram footprints and splittee colours.

Each cell's crossing diagonal retains its original drop. In an ordinary descending action, consecutive events satisfy:

```text
crossGapDrop     = columnWidth * tan(theta)
event start      = previous event end
event end        = (event start x + or - columnWidth, event start y + crossGapDrop)
```

Equivalently, `event start y = actionBaseline + eventIndex * crossGapDrop`, with the sign of the horizontal step following the splitter's direction of travel.

For a returning course, provisionally use `event start y = actionBaseline - eventIndex * crossGapDrop`. Choose between these two arrangements by comparing the variance of the vertical offsets needed to meet each splittee's previous visible end. Consider adjacent-gap continuations and same-gap reversals, using stable cord IDs. Fewer than two usable ends, or a tie, retains the descending arrangement. Then enforce the exact connections in section 7.1. This placement applies to both Finished views.

Because the action steps one column across and one cord ribbon down per event, the three events produced by `1>2,3,4` descend from the outer edge toward the center seam. A following `8>7,6,5,4` action descends from the opposite side and meets it at that seam.

The cord ribbons themselves lean the other way: within one ribbon each successive cell sits one column further out and one `cellSide` along the shared boundary, so a ribbon runs shallowly across the braid while an action runs steeply down it.

An optional longitudinal stagger remains available for experimentation, but its default is zero. Zero stagger makes each cord's successive cells share a complete edge and produces the compact arrangement shown in the supplied sketch.

### 7.1 Cord continuity across actions

When the same physical cord is represented by successive splittee cells, those cells connect and align if that cord has not acted as a splitter between them. Events involving unrelated cords do not break its continuity.

If the cord acts as a splitter, that portion of its trajectory remains invisible. A later splittee cell resumes at the position determined by the hidden trajectory, but the renderer must not paint a connecting segment across the invisible splitter portion.

Cord continuity is based on the stable cord ID, not merely on matching colors. Two different cords may share a color but must still be treated as separate physical cords.

Ordinary splittee continuity is achieved by aligning the complete shared column-boundary edge of the cord's two consecutive cells. It must not be forced by aligning complete edges of cells belonging to one splitter; those are different cords.

For every adjacent-gap continuing splittee, align the new cell's incoming top corner with the previous cell's outgoing top corner. Since all vertical sides have the same length, this aligns both edge endpoints. Use the actual corner coordinates, including experimental stagger offsets. The previous outgoing edge lies at its event's `fromLane`; the new incoming edge lies at its event's `toLane`.

Each continuing splittee supplies its own exact translation. Never average translations across a row. Interpolate translations only for new or returning cells between these anchors, using the nearest anchor's translation beyond either end. A row can bend or change its spacing to satisfy all of its splittee connections. Acting as a splitter clears the previous visible endpoint, so an invisible splitter portion is never bridged.

Adjacent-gap connections and non-overlapping columns are both hard constraints. Final packing translates the entire connected run, including its earlier cells, by one common offset. This preserves every full-edge join while making room for the later cells. Same-gap reversals are separate runs and stack in event order; they do not impose a full-edge equality on two cells occupying the same side of a boundary.

When a later splitter action contains one or more previously visible splittee cords, the renderer translates that entire action vertically. Each continuing splittee's new cell is aligned so that its edge on the boundary it shares with the cord's previous cell coincides with that previous edge. All continuing splittees in one structurally valid action should imply the same translation; the implementation averages only to absorb floating-point differences.

If a cord has acted as a splitter since its preceding visible cell, its previous visible end is removed as a connection constraint. Its hidden splitter portion must remain invisible.

### 7.2 Hidden splitter trajectory

The splitter is geometrically active even though it is visually hidden. The layout engine must maintain a trajectory for every stable cord. A new splitter action begins on the existing hidden line of its splitter cord, and its event cells follow that line through the crossed gap columns.

The renderer therefore separates geometry from visibility:

- a splittee contributes the visible cell and its color;
- a splitter contributes the line along which that cell is positioned; and
- the splitter line itself is not painted.

After each split event, the splitter and splittee exchange boundary positions exactly as they exchange adjacent lanes in the simulator. Both hidden trajectories are updated even though only the splittee cell is painted.

### 7.3 Collision rule

Every base cell in a column must lie below the preceding cell in event order, with no interior overlap. This applies after turns, to cells of the same cord, and to role-transition cells. The development view's separate intersection triangles do not change the base-cell footprints.

First group adjacent-gap appearances of a continuing splittee into one ribbon run. Acting as a splitter or returning through the same gap starts a different run. Every cell in a run receives the same final vertical translation.

For each consecutive pair of cells in a column, constrain the lower cell's top edge to be at or below the upper cell's bottom edge at **both** column boundaries. Checking both endpoints separates the complete linear edges, including cells with opposite lean directions. A vertical bounding-box check alone is insufficient.

These column constraints define dependencies between ribbon runs. Propagate the minimum required downward offsets through those dependencies, then translate each entire run. Never skip packing because a row has a connected splittee, and never resolve a collision by moving just one cell away from its connected neighbor. Normalize the canvas bounds after this packing pass.

### 7.4 Presentation

Finished view contains no written-row markers or repeat-boundary markers. Repeated events form one uninterrupted craft surface. Front and Back use the same layout; Back mirrors it horizontally without changing colors.

### 7.5 Interlocking transition surface

The screenshot supplied at 22:42 on 2026-09-05 defines the corrected rendering: **extend the diagonal to its intersection in the neighbouring column and fill the extra triangle**. Preserve every original split-cell path. This supersedes the implementation that cut or moved both corners of a transition cell.

The role-change detection in section 2.2 is unchanged. Apply this treatment to eligible transitions in both directions, including the double chevron's columns 5–6, 11–12, and 18–19. These locations come from event history and must not be hard-coded.

#### 7.5.1 Triangle geometry and colour

Select the current cell's boundary and the previous cell using section 2.3:

| Role change | Current boundary | Previous cell |
| --- | --- | --- |
| Splitter → splittee | Incoming edge, at `toLane` | Last splittee through which the returning cord passed |
| Splittee → splitter | Outgoing edge, at `fromLane` | Departing cord's last visible splittee cell |

At the shared boundary, compare the upper corners of the current and previous ribbons to identify the upper ribbon. Continue its lower diagonal and the lower ribbon's upper diagonal until the two lines intersect. The triangle has exactly three vertices: the two selected original edge endpoints on the shared boundary and their intersection in an adjacent column.

In formulas, let the selected current corner be `C`, the selected previous corner be `H`, and their diagonal slopes be `mC` and `mH`. Since `C.x = H.x`:

```text
dx = (H.y - C.y) / (mC - mH)
tip = (C.x + dx, C.y + mC * dx)
triangle = [C, H, tip]
```

Use the current lower corner and previous upper corner when the current ribbon starts higher. Otherwise use the current upper corner and previous lower corner. Use the interval between these selected endpoints; do not use a whole vertical cell side, cut the base cell, or replace its corners.

Colour follows the material extending across the seam. If the intersection lies in the current cell's column, fill the triangle with the previous cell's splittee colour. If it lies in the previous cell's column, use the current splittee colour. This selection uses stable cord IDs and remains valid when colours happen to match.

#### 7.5.2 Drawing order and edges

First draw all original split cells in event order. Then draw the transition triangles in an overlay layer, also in event order. This ensures that a later base cell in the neighbouring column does not erase the small triangle, as occurred at the red–gold join in the reference.

For each triangle, draw its flat fill, the two diagonal segments to the intersection, and the vertical seam between its original endpoints. Use fine solid outlines. Both original cell paths and their layout corners remain unchanged. Mirror the entire base and transition layers together for Back.

#### 7.5.3 Eligibility and fallback

Require adjacent gap columns and a shared vertical boundary. The diagonal slopes must differ, and the intersection must be finite and lie within the combined horizontal extent of the two gaps. This permits offset joins while bounding the added material to the local neighbouring columns.

If these checks fail, omit that triangle. The original cell is already present and remains unchanged. A transition at the other end can still render independently. Geometry eligibility does not change the role history or grant a new layout collision allowance.

#### 7.5.4 Reference example

In the 24-cord double chevron at the default angles:

| Event index | Operation | Meaning |
| --- | --- | --- |
| 11 | `C12` splits `C24` | `C12` is the splitter; its last host is `C24`. |
| 12–26 | Events involving other cords | These do not change `C12`'s last role or host. |
| 27 | `C23` splits `C12` | `C12` returns as splittee; render its blue ribbon against the green host `C24` from event 11. |

For this particular join, the green triangle ends one third of a column width into the blue column. That fraction is a result of this layout and its angles, not a fixed offset for every transition. The eight-cord full cycle keeps 56 original split cells and adds 15 adjacent-gap transition triangles.

For the double chevron's full 24-repeat cycle at the default angles:

| Gap column (1-based) | Role change | Rendered transitions |
| --- | --- | --- |
| 5 | Splitter → splittee | 24 |
| 6 | Splitter → splittee | 23 |
| 11 | Splittee → splitter | 24 |
| 12 | Splittee → splitter | 23 |
| 18 | Splitter → splittee | 24 |
| 19 | Splitter → splittee | 23 |

This gives 141 transition triangles above 552 unchanged split cells. At event 12, `C13` changes from splittee in event 5 (column 12) to splitter in column 11. At event 28, `C11` changes from splittee in event 12 (column 11) to splitter in column 12. Both need the extra rendering even though the current splittee is not returning from the splitter role.

## 8. Preliminary invariants

- The number of rendered cells equals the number of valid split events included in the finished preview.
- No current splitter path is drawn. Each triangle uses the stable cord colour of the material extending across the seam; matching colours do not determine roles.
- No starting cord, cord tail, or complete cord path is visible.
- No column boundary, lane guide, column number, or construction guide is visible.
- Every cell represents its event's splittee.
- Every layout cell appears in exactly one gap column; a transition surface may extend into the adjacent host gap.
- An `N`-cord pattern always has `N - 1` gap columns.
- Left-to-right and right-to-left splits use visibly opposite lean directions.
- Events in one splitter action follow the course direction fitted to existing cord ends.
- Consecutive cells in an ordinary descending action meet tip to tip on the splitter's line, without overlapping.
- Consecutive splittee layout cells of one stable cord in adjacent gaps align both endpoints of their common boundary, including across course changes.
- Cells representing the same stable cord align across actions so the cord appears continuous.
- The ends of each cell's crossing diagonal lie on its two column boundaries before action-level translation.
- A new splitter action follows the existing hidden trajectory of its stable splitter cord.
- Every split updates both participating cords' hidden positions using the simulator's lane swap.
- A cord's invisible splitter portion is never filled merely to connect two visible splittee cells.
- Column packing moves complete ribbon runs together, preserving exact adjacent-gap splittee connections.
- No two base cells in a column overlap, including splitter-to-splittee cells and same-gap returns.
- Each ribbon run moves down by the minimum offset satisfying all of its column constraints.
- Every layout footprint is a parallelogram whose two vertical sides, of length `cellSide`, lie on its two column boundaries. The base path keeps that footprint at transitions, with an extra triangle extending material across the shared boundary.
- The layout footprint's tip corners use `tipAngle`; the triangle tip is determined by the intersection of the two neighbouring diagonals.
- `cellSide` depends only on `theta` and `tipAngle`, never on the event or its column.
- Successive events provisionally step by `+crossGapDrop` or `-crossGapDrop`, according to the fitted course direction, before exact splittee alignment. In an ordinary descending action, each event starts where the previous one ended.
- Every cell has sharp corners.
- The entire finished visualization progresses from top to bottom.
- The default value of `theta` is 30 degrees, and the default value of `tipAngle` is 30 degrees.
- Rendering is deterministic for the same simulation event sequence.
- A split-event transition is detected from each participant's most recent participation, independently of colour, row, face, and geometric eligibility.
- Previous-cell selection refers to the changing cord's most recent participation: its last split as splitter for a return, or its last visible splittee cell for a departure.
- Transition triangles and edge-detail paths do not increase the number of split cells or simulation events.
- Every base-cell path is preserved exactly; triangles render above the complete base-cell layer.

## 9. Implementation details

The following presentation details do not change the structural layout and may evolve independently:

1. Fine-grained cell outline and surface treatment.
2. Whether events can be selected and whether labels or tooltips belong in the Finished view.
3. How invalid or partially simulated rows affect the finished preview.

## 10. Acceptance examples

For the eight-cord chevron sample with four repeats:

- the output has seven internal gap columns;
- eight expanded rows produce 28 visible cells;
- the first written row produces three right-leaning cells descending through columns 1, 2, and 3 on the splitter's line;
- the second written row produces four left-leaning cells descending through columns 7, 6, 5, and 4;
- cord `C04` appears as a splittee in columns 3, 2 and 1 on successive written rows, and those three cells form one edge-to-edge ribbon;
- each cell uses the color of `splitteeId`, never `splitterId`;
- no splitter path, starting cord, guide, lane number, row boundary, or repeat boundary is visible;
- base-cell interiors do not overlap;
- the dimensions and event stepping satisfy the formulas in sections 5.1 and 7 at every supported angle; and
- Back displays the same cells and colors as a horizontal mirror of Front.

For every valid pattern, the rendered SVG contains exactly one split cell for every simulated `SplitEvent`.

For the twenty-four cord mirrored diamonds, all uninterrupted splittee runs align their complete shared edges across the section change. In particular, event 127 (`C18` splitting `C01`) and event 149 (`C07` splitting `C01`) share both edge endpoints. Check every continuation at the angle-control limits, with identical colours, and under horizontal reflection.

For the Wayuu sample, exact alignment also holds across its two single-split steps and into the returning section. Regression examples include the adjacent-gap `C20` join between events 77 and 85 and the same-gap `C03` return between events 65 and 82. The former aligns its complete shared edge; the latter stacks without overlap. Check all cell pairs in columns 5–9 after both turns, and verify that full-edge alignment of adjacent-gap continuations still holds. Run both assertions together for every sample at the angle-control limits.

Transition acceptance checks must cover both role-change directions, both lean directions, identical cord colours, unrelated intervening events, all six double-chevron transition columns, an ordinary splittee continuation after a transition, and geometry fallback at detached or unsupported joins. Verify that Finished v1 retains the layout-cell paths and that Front/Back mirror the same transition surfaces without changing event or host identity.

For the red–gold screenshot at the default angles and `columnWidth = 64`, event 22 adds a gold triangle into column 6 with tip `(380, 305.128129)`. Event 40 adds the small red triangle into column 5 with tip `(337.333333, 379.028964)`. These coordinates use the default layout padding. Both triangles remain visible above later base cells, and all original cell paths are unchanged.
