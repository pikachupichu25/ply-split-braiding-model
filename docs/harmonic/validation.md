# Validation and implementation sequence

## What is already checked

`audit-events.mjs` was run on the current working-tree Eyes source with Node 22's experimental type stripping. It imports only the source, parser, and simulator.

The executable assertions check:

- Parsing and simulation return no diagnostics.
- Each exchange is adjacent, identities match the input lanes, and the output snapshot is exactly that exchange.
- Consecutive snapshots agree.
- Event junctions have four valid ports; terminals have one.
- Every directed edge belongs to one closed face walk.
- The graph is connected and has planar Euler characteristic 2.
- All terminals share one exterior face.
- Each removal experiment remains accepted by the simulator, with surviving instructions matched explicitly.

The report captures the exact source text plus hashes of the source and photograph. Rerunning against changed input updates that report deliberately. None of these checks assert that a rendered image matches the photograph.

## Phase 1 — Establish the interpretation

Use the source named Eyes as the working candidate. Resolve these from the source demonstration or a deliberately made short swatch before describing a render as accurate:

1. Does the photographed sample actually use these 20 cords and this written sequence?
2. Are lane numbers relative to a fixed material frame or the maker's view after a turn?
3. Which strand is visibly dominant in a two-colour split, and what partition/rotation is used?
4. Are any tightening, turning, or edge operations omitted from the transcription?

The current photograph is sufficient to start a prototype and reject obviously wrong motifs. It is not sufficient to resolve all four questions. No user decision is required to finish this research proposal; these are validation dependencies for a predictive implementation.

Deliverable: documented convention plus one contrast-colour junction reference and, ideally, a short multi-split run. If the convention differs from the simulator, normalise the input before geometry work. Do not compensate with geometric offsets.

## Phase 2 — Plain geometry prototype

Implement the network builder as an independent module, reusing the audit's incidence/port logic. Add distinct control points to repeated pair segments, a boundary scaffold, and an experimental relaxation solver. Keep experimental implementation under `docs/harmonic/` until it has a convincing result; later integration paths can be chosen then.

Produce three inspectable views from the same geometry:

- Named cord centrelines, event IDs, and role transitions.
- Flat-colour ribbons and split patches.
- The same geometry with shading, for appearance evaluation only.

Each visible fragment must identify its cord. A click on a junction should reveal event index, row instance, source row, both identities, and its immediate predecessor/successor along each cord. This makes an incorrect white band diagnosable.

Required geometry checks include no unexpected intersections, no lost events, finite nonzero junction dimensions, valid port order, and no collapsed digons. Show the two Eyes digons (61/78 and 75/91) and the neighbourhoods of events 76, 77, 172 at large scale.

Run a small range of width, pitch, crossing-angle, and boundary settings. Record numerical convergence and stability, not just the best-looking seed. If different initialisations produce different eye arrangements at comparable residuals, the model remains ambiguous and needs an additional justified constraint.

## Phase 3 — Compare to the real photo

Use the relatively unobscured central/upper fabric, excluding the fingers, background, and loose working cords. Keep the original image unchanged. Store any later landmark annotations separately in normalised image coordinates with uncertainty labels.

Recommended landmarks and observations:

| Feature | Comparison |
| --- | --- |
| Complete eye centres | Relative horizontal positions and stagger between adjacent axial groups |
| Nested colour bands | Order of dark/light/blue regions and approximate normalised thickness |
| Outer eye tips | Height/width aspect ratio and where a band changes direction |
| Partial lateral eyes | Whether equivalent motif portions reach the edges at the correct phase |
| Cord orientation | Local tangent direction and continuity through a turn |
| Dense surface | Interior visible-background fraction, excluding aperture shading |

Align using one global transform appropriate to the chosen photo region, such as a homography for a nearly flat patch. The lower bend may need exclusion rather than an increasingly flexible warp. Permit a global horizontal mirror only while resolving the documented viewing orientation. Do not move individual generated events to match the image.

Fit shared profile parameters and a three-colour appearance palette using one region, then evaluate on another. Exact source CSS colours (`brown`, `lightblue`) should not be judged as photographed RGB values. Use symbolic colour regions first; lighting and camera white balance belong to appearance calibration.

Record numerical metrics once reliable annotations exist:

- Landmark error divided by local braid width.
- Agreement of the nested symbolic colour regions after alignment.
- Relative eye aspect ratio, band thickness, and lateral phase.
- Solver residuals and topology violations for the same candidate.

There are no defensible numerical acceptance thresholds from the present blurred frame alone. Set them using annotation uncertainty and a physical swatch; do not publish invented accuracy percentages. The minimum qualitative gate is the correct nested bands, staggered arrangement, edge continuation, and traceable continuous cords, with zero topology violations.

## Phase 4 — Prove the rule is general

These are tests to implement alongside the geometry, not additional tests added to the current application in this research task:

| Case | What it exposes |
| --- | --- |
| One splitter through several contrasting cords | Wrong surface role or a broken active cord |
| Role sequence splittee → splitter → splittee | Discontinuous path at a role change |
| Two consecutive meetings of the same cord pair | Collapsed parallel segments/digon |
| Recolour cords without changing events | Geometry improperly depends on palette |
| All cords assigned one colour | Events improperly removed as visually redundant |
| Rename all cord IDs bijectively | Layout depends on incidental identifier spelling |
| Reorder independent fixed-frame events preserving identities and physical metadata | Layout depends on serial scheduling instead of topology |
| Append another written block | A fabricated repeat seam or overly influential endpoint anchors |
| Reverse camera view | Events incorrectly omitted or split roles exchanged |
| Empty event list / untouched cords | Lost input cords or a fabricated fabric surface |
| Existing chevron and colour-block sources | Whether the same profile works without Eyes-specific placement rules |

For independent-event reordering, hold physical metadata fixed; rerunning a differently grouped source through the current row-based face toggle can change that metadata and is not an equivalent experiment. Compare resulting geometry modulo global alignment and solver tolerance rather than require identical coordinates from a nonconvex optimiser.

The same material profile should transfer to other samples made with the same cords. A separate profile for a different cord diameter or tension is reasonable; per-event positional corrections are not evidence of a predictive rule. Real photographs of another pattern provide a stronger check than comparison with any existing finished preview.

## Phase 5 — Application integration

Only after the photo gate, extract stable modules for network construction, layout, and surface rendering. Continue consuming the current `Simulation` so the instructional view and finished view share the same event history. Cache by topology and geometry profile, keeping recolouring cheap. Preserve event/cord metadata for inspection.

Add texture and more realistic ply models after the plain-colour motif is correct. Measure performance against the preview sizes the UI actually supports before choosing a frame-time or event-count budget. Keep unresolved geometric solutions identifiable instead of displaying a plausible but structurally invalid result as finished.

Research completion and implementation completion are separate: this folder delivers a reproducible structural investigation and an implementable proposal. A photograph-matching solver and renderer remain to be built and validated.
