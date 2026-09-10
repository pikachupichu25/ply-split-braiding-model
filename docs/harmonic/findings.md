# Evidence and unresolved assumptions

## 1. What the supplied photograph establishes

![Real Eyes braid](../../public/expected-layouts/eyes.png)

Direct visual observations, rather than claims about the unseen construction:

- Dark brown/purple, near-white, and cyan/blue dominate the braid.
- Complete eyes have dark centres surrounded by alternating light/blue bands. The bands have oblique cord texture and rounded, stepped turns rather than perfectly straight polygon edges.
- Two upper eye centres sit to either side of the next central eye. Partial eyes appear at the left and right edges alongside that central eye. The repeat is staggered across the width.
- Dark cords form the surrounding field and separate neighbouring eyes. The braid is dense; the motif is not a collection of isolated tiles with background gutters.
- The lateral edges turn and undulate with the cord structure. The lower portion is being held and worked; fingers, loose cords, perspective, and bending obscure its geometry.

The photograph does **not** establish exact diameters, tension, ply count, twist phase, a complete start/end boundary, hidden paths, the back surface, or event-to-pixel correspondence. A single view also cannot prove which apparent band segments belong to the same cord.

Use the image to judge motif arrangement, band order, cord continuity, density, and plausible edges. Do not fit raw RGB pixels before accounting for perspective and lighting. The image is the source of truth for the desired appearance, but it is not a complete physical specification.

## 2. Which source was investigated

[`src/examples/wayuuFajon20.ts`](../../src/examples/wayuuFajon20.ts) exports the source named **Eyes** in [`src/examples/index.ts`](../../src/examples/index.ts). It has this sequence:

```text
AABCBBCBAA AABCBBCBAA
```

Spaces above only expose the two identical ten-cord groups. There are eight A cords, eight B cords, and four C cords. The source assigns A=brown, B=white, C=lightblue. This is consistent with the photograph's three broad colour families and makes this the working candidate. It is not independent confirmation that the photographed object uses exactly these instructions.

[`eyes36.ts`](../../src/examples/eyes36.ts) is a separate 36-cord, five-symbol source. Do not silently substitute it because its filename contains “eyes”.

The current source's YouTube comment is [m9XeWfU4A7w](https://youtu.be/m9XeWfU4A7w). The video could not be retrieved during this investigation, so its steps, cord count, and relationship to the supplied frame remain unverified.

For one call to `simulatePattern(pattern, 1)`:

| Section | Expanded row instances | Event IDs, inclusive | Events |
| --- | --- | --- | ---: |
| Source rows 1–4, four times | 1–16 | 0–75 | 76 |
| Source rows 5–6 | 17–18 | 76–77 | 2 |
| Source rows 7–10 | 19–22 | 78–95 | 18 |
| Source rows 11–14, four times | 23–38 | 96–171 | 76 |
| Source row 15 | 39 | 172 | 1 |

Source row number, expanded row instance, and event index are different identifiers. A finished spatial course is a fourth concept and is not supplied by any of them.

There are no open repeats in this source. Increasing `previewRepeats` repeats the entire expanded 39-row block. One block does not restore the initial lane identities or working face. In an exhaustive check of block counts 1–10, the first colour-order return is after five blocks, on the opposite working face; the first cord-identity return is after ten blocks, on the original working face. These are simulator state returns, not measurements of the motif's spatial period. Internal twist or geometric boundary state could require more information for a physically seamless repeat.

## 3. Information present in SplitEvent

[`types.ts`](../../src/domain/types.ts) and [`simulate.ts`](../../src/domain/simulate.ts) provide:

- Stable splitter and splittee identities.
- Ordered meetings along both cords.
- Adjacent lane exchanges, including full lane snapshots and colour symbols.
- Instruction grouping, repetition instances, and a working-face flag.

They do not provide finished XY positions, segment lengths, a physical ply partition, rotation, tension, attachment geometry, or a detailed boundary treatment. `SplitEvent[]` also cannot enumerate untouched cords when the event list is empty; the initial snapshot or explicit cord list is needed.

**Coordinate convention matters.** The simulator swaps adjacent entries and toggles `face` after every instruction row. It does not reverse the lane array on a face change. Therefore its lanes behave as a persistent coordinate frame. The audit honours that exact implementation. A face flag cannot also be used to mirror each back-face event's lane coordinates without an explicit coordinate conversion. Whether the source was transcribed in that persistent frame must be checked against the making instructions.

Do not interpret `face` as “this event only exists on this surface”. Every split participates in the same object. Nor does the flag by itself specify a physical partition of plies.

## 4. A concrete continuous-cord example

The beginning of C16's history is:

| Event | Role of C16 | Other cord | Meaning |
| --- | --- | --- | --- |
| 0 | splittee | C15 | C15 passes through C16 |
| 5–8 | splitter | C14, C13, C12, C11 | The same C16 continues through four other cords |
| 14 | splittee | C05 | C16 is opened again |
| 32, 50, 68 | splittee | See audit | Its path continues across later instructions |

The full visit sequence is `0,5,6,7,8,14,32,50,68,89,107,125,138,139,140,141,142,143,156`.

Connecting only C16's visible splittee patches would omit its splitter sections. Connecting only events in the same source row would break the cord at role changes. Both errors are avoided by constructing every cord's complete ordered path before drawing its surface.

## 5. The event network has useful structure

The audit constructs one vertex per event, one start and end per cord, and one edge for each segment between successive visits. At a split, the two cord paths remain distinct through the vertex. A cyclic ordering of the four incident ports records the planar arrangement in the simulator's canonical wiring diagram.

For 173 events and 20 cords, this yields 213 vertices, 366 edges, and 155 faces including the exterior. The graph is connected and satisfies `V − E + F = 2`. All 40 terminals lie on the same exterior face. These checks establish a consistent planar projection of the supplied adjacent exchanges; they do not prove a packed fabric shape or its three-dimensional ply structure.

The 154 bounded faces comprise:

| Boundary degree | Count | Geometric implication |
| --- | ---: | --- |
| 2 | 2 | Distinct curved cord segments must remain distinct between the same two meetings |
| 3 | 16 | Turns/changes cannot all be represented by four-sided mesh cells |
| 4 | 132 | Regular oblique mesh is a useful interior prior |
| 5 | 4 | Larger transition neighbourhoods require local flexibility |

Here “face” means a region of the projected cord graph, not the front or back of the braid. A graph region is not necessarily an eye, a visible hole, or a rendered colour cell.

Two particularly useful stress cases:

- Events **61 and 78** both have C12 splitting C13. Their two connecting cord segments bound a digon, a two-sided region.
- Events **75 and 91** both have C09 splitting C08 and produce the other digon.

A renderer that replaces both connections by the same straight line collapses these regions. Use distinct segment identities and curved paths. This does not require a visible air gap; finite cord widths may cover the projected region.

Four pentagonal regions adjoin events 76 or 77. For example, one has event boundary `76 → 72 → 73 → 93 → 94 → 76`. These transitions are directly recoverable from connectivity. There is no reason to hard-code their event IDs in the generator.

## 6. Removal experiment: equal colour is not equal structure

The short source rows 5, 6, and 15 create:

| Event | Splitter | Splittee | Colours |
| --- | --- | --- | --- |
| 76 | C01 | C10 | A / A |
| 77 | C11 | C20 | A / A |
| 172 | C09 | C12 | A / A |

I removed those rows from a copy of the AST and resimulated it. Remaining events were matched by source row, occurrence within that row, and split index—not by the shifted event index.

| Removed source rows | Remaining events | Changed remaining cord pairs | Changed remaining splittee symbols | Changed final lane identities |
| --- | ---: | ---: | ---: | ---: |
| 5 | 172 | 19 | 0 | 2 |
| 6 | 172 | 19 | 0 | 2 |
| 15 | 172 | 0 | 0 | 2 |
| 5, 6, 15 | 170 | 35 | 0 | 6 |

The simulation still accepts each modified instruction sequence. Removing only row 5 or only row 6 also changes subsequent working-face flags because the simulator toggles after each row. Removing all three leaves remaining face flags unchanged: the first two deletions cancel that parity change before the later long section, and the final deletion has no successor.

This is evidence that a colour-only representation discards structural information. It is **not** an observation of how a physically braided altered sample would look. The proposed generator must preserve the same-colour events and let their geometric effect follow from the changed network.

## 7. Physical support and its limits

David W. Fraser's [2010 research paper](https://digitalcommons.unl.edu/tsaconf/67/) describes SCOT as permitting selection of the surface colour where differently coloured cords meet. The [indexed full-text copy](https://citeseerx.ist.psu.edu/document?doi=527fa597176546503e89544ca027350501f71ce2&repid=rep1&type=pdf) explains the role of the cord being split in surface colour and the usual quarter-turn practice for four-ply POT/SCOT. Its full PDF could not be opened here; the indexed passages and the author's accessible abstract were available. These support using splittee-coloured surface patches and modelling a ply opening rather than treating the entire splitter as an overpassing strand.

Julie Hedges' [Basic Ply-Splitting leaflet](https://thebraidsociety.wildapricot.org/resources/Documents/Current%20lists%20and%20documents/BasicPly-Splittingforweb.pdf), available through indexed text during this investigation, distinguishes SCOT examples that turn the work from examples that do not. Automatic turning after every row is therefore an application convention, not a universal consequence of the term SCOT.

Neither source establishes the geometry of this particular Eyes sample. A four-ply, equal-partition junction is a proposed default to test, not a fact inferred from the photograph. Multi-colour plies, unequal partitions, and exact reverse-face appearance require richer input.
