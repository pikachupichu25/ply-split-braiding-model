# Findings: spring layout of the Eyes and chevron graphs

Experiment date: 2026-09-10. Script: [`experiment.mjs`](experiment.mjs). Model: [README](README.md) §4–§5. Nothing here is photo-validated; the comparison target remains [`eyes.png`](../../public/expected-layouts/eyes.png).

```sh
node --experimental-strip-types docs/spring/experiment.mjs eyes
node --experimental-strip-types docs/spring/experiment.mjs eyes blocks=3 seeds=0 tag=b3
node --experimental-strip-types docs/spring/experiment.mjs chevron blocks=8
node --experimental-strip-types docs/spring/experiment.mjs eyescore source=docs/spring/eyes-core.scot seeds=0 tag=core
```

Each run writes `<sample>-surface.svg` (cords with the splittee patch on top at every split), `<sample>-structure.svg` (centrelines, event IDs, conflict markers), `<sample>-random-<k>.svg` for each random seed, and `<sample>-metrics.json` with the profile, graph sizes, per-run energy, strains, crossing angles, orientation, crossings, digon widths, and the Procrustes distance of every random-seed layout to the wiring-seed layout. The script imports only the parser, simulator, and example sources. It changes no application file.

**Summary.** The graph from astra plus the spring energy of the README produces the Eyes motif from cord colours and connectivity alone: a nested eye in the centre of one written block, partial eyes at both selvedges, and, over three blocks, the alternating central and paired arrangement the photograph shows. Getting there required three corrections to the proposal: an under-damped physical solve instead of CrochetPARADE's ten polish steps, a separate rest length for selvedge turns, and repulsion exclusions around each junction. The regular sections of every pattern come out as clean `2θ` lattices. The transition rows of Eyes leave shear bands that a 2D spring fabric cannot remove.

## 1. Results with the final defaults

Profile: `θ = 36°`, `ℓ = 1/sin 72° = 1.051`, `d_min = 0.9`, `ℓ_turn = 2.04`, `T = 500`, `η = 0.1`, physical solve 3000 steps at `dt = 0.1`, `γ = 0.1`. Wiring seed. Angles are the realised crossing angle between the two forward ports; the target is 72°.

| Sample | Events | Nodes | Time | Angle mean ± sd | Interior median (p25–p75) | Edge strain rms | Orientation violations | Crossings | Junction width / lattice |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chevron, 8 blocks | 56 | 176 | 1.5 s | 72.0 ± 0.5° | 72.0° (71.7–72.2) | 0.002 | 0 | 0 | 4.25 / 3.71 |
| Eyes core, rows 1–4 × 6 | 114 | 362 | 3.6 s | 71.0 ± 3.6° | 72.0° (71.5–72.5) | 0.023 | 2 | 2 | 12.58 / 11.13 |
| Eyes, 1 block | 173 | 539 | 5.6 s | 78.5 ± 16.4° | 73.4° (71.0–82.1) | 0.079 | 0 | 0 | 14.80 / 11.13 |
| Eyes, 3 blocks | 519 | 1,577 | 21 s | 86.8 ± 24.2° | 81.2° (71.1–98.2) | 0.124 | 6 | 4 | 15.10 / 11.13 |

"Lattice" width is `(n − 2) ℓ sin θ`, the junction extent of a perfect rhombic strip. Every layout is wider than that because the selvedge loops push the outer junction columns outward. The Eyes digons at events 61/78 and 75/91 open to a lens width of 0.56 d, close to the `ℓ sin θ = 0.62` that the crossing-angle spring asks for.

Figures, all from the wiring seed:

- [`eyes-surface.svg`](eyes-surface.svg) and [`eyes-structure.svg`](eyes-structure.svg): one block. A complete eye in the centre with a dark centre, white band, blue band, white band, and dark field. Half eyes at the left and right selvedges. The next eyes begin at the top and bottom frontiers.
- [`eyes-b3-surface.svg`](eyes-b3-surface.svg): three blocks. Central eyes alternate with pairs of eyes side by side, with partial eyes at the selvedges between them. This is the stagger described in [astra findings §1](../astra/findings.md#1-what-the-supplied-photograph-establishes).
- [`chevron-surface.svg`](chevron-surface.svg): the eight-cord chevron as a uniform lattice with rounded selvedge loops.
- [`eyescore-core-surface.svg`](eyescore-core-surface.svg): Eyes rows 1–4 only, repeated six times, from [`eyes-core.scot`](eyes-core.scot).

Colours come from each source's `palette:` line and touch nothing but the SVG fill. The Eyes core's two conflicts are at events 98 and 112, the last row's junctions at the free end frontier.

## 2. Three corrections the experiment forced

### 2.1 The physical solve needs momentum

With the proposal's polish (10 over-damped steps) the Eyes lattice settled at a crossing angle of 89.7° and stayed there no matter how long the main loop ran:

| Main loop `T` | Polish steps, `γ` | Angle | Cross-spring energy |
| ---: | --- | ---: | ---: |
| 500 | 10, 1 | 89.7° | 2.27 |
| 2000 | 10, 1 | 88.9° | 2.13 |
| 5000 | 10, 1 | 88.3° | 2.03 |
| 500 | 400, 1 | 88.4° | 1.50 |
| 500 | 2000, 1 | 83.4° | 0.86 |
| 500 | 3000, 1 | 81.9° | 0.77 |
| 500 | 3000, 0.1 | 79.4° | 0.68, gradient 0.000 |
| 500 | 6000, 0.1 | 79.4° | identical |
| 500 | 6000, 0.05 | 79.8° | identical energy |

The scaffold term is symmetric in the two cell diagonals, so during the main loop it holds the fabric at the square lattice. It is still stronger than the crossing-angle springs until the last few percent of the schedule (`α = 0.32` at `t = 0.9T`). After it is gone, the remaining error is a global shear, the softest mode of the mesh, and gradient descent relaxes it at a rate proportional to the squared inverse of the strip length. Under-damped dynamics converge on every mode in a number of steps set by the damping alone. The default is now 3000 steps at `γ = 0.1`, and the run is declared settled only when the physical gradient is zero and a longer run gives the same energy. This measurement was made before the turn-length change below, on the same seed.

### 2.2 Selvedge turns are not pitch-length segments

After the momentum fix, interior angles were still wide while the selvedge junctions were near target: Eyes 80.6 ± 15.2° interior against 68.8 ± 5.7° at the outer gaps, chevron 87.3 ± 7.6° interior against 71.4 ± 4.5°, with the chevron 54% wider than its lattice.

The cause is a rest length. When a cord is split at gap 1 and next splits at gap 1, the cord turned at the selvedge. In the rhombic lattice those two junctions are in the same column, `2ℓ cos θ = 1.70` apart, and the cord between them is a loop longer than that chord. The proposal gave the segment rest length `ℓ = 1.05`. That pulled every selvedge column together axially, and the interior sheared wide to keep its edge lengths. The chevron's face between a turn and its neighbours is a triangle (events 0, 1, 7 in the first repeat) with sides `ℓ`, `ℓ`, `2ℓ cos θ`, so the geometry is forced, not fitted.

With `ℓ_turn = 1.2 × 2ℓ cos θ = 2.04` and straightness springs skipped across every lane-direction reversal:

| Sample | `ℓ_turn = 1.70` | `2.04` (default) | `2.38` |
| --- | --- | --- | --- |
| Chevron angle, width | 72.0 ± 0.7°, 4.52 | 72.0 ± 0.5°, 4.25 | 72.0 ± 0.6°, 4.05 |
| Eyes angle, conflicts | 78.2 ± 15.8°, none | 78.5 ± 16.4°, none | 79.3 ± 18.4°, 3 violations, 3 crossings |

The chevron is insensitive to the value within this range; a longer loop narrows the strip slightly. The Eyes result is a local minimum with more loop than fabric to place, and the longest value starts to fold selvedge loops over each other.

Reversals are detected from lanes: at each event a cord moves to a higher or lower lane, and a segment whose two ends disagree is a reversal. One Eyes block has 28 reversal segments, 18 of them selvedge turns; the other ten are interior reversals in the transition rows and keep rest length `ℓ`.

### 2.3 Repulsion must ignore a junction's own ports

The two in-ports of a crossing sit `ℓ sin θ ≈ 0.62 d` apart in a regular cell, below `d_min`. Without an exclusion the repulsion pushes every crossing open toward 90°. Pairs that are ports of the same junction are therefore excluded. The digon's two midpoints are such a pair, and with no repulsion between them the digon is held open by the crossing-angle spring attached to the midpoints, not by repulsion. The proposal's junction-level crossing spring is undefined at a digon, where both forward neighbours are the same node; the adjacent-node form in the README is what the script uses everywhere.

## 3. Where the residual stress sits

In the one-block Eyes layout, 17 of 173 junctions have crossing angles above 100° (events 14, 27, 32, 33, 46, 51, 52, 60, 64, 69, 74, 82, 87, 100, 101, 106, 119; the worst are 101 and 106 at 141°). They recur at the same position in every repeat of rows 1–4, one per repeat at the last split of row 3 and pairs at the ends of rows 2 and 3, where the left half's splitter reaches lane 11 and meets the right half's. Only 4 of the 17 touch a non-quadrilateral face of the audit; the triangles and pentagons themselves are mostly at their target angle.

The core pattern has none of them. Rows 1–4 repeated on their own give 71.0 ± 3.6° everywhere with 2.3% strain. The wide junctions therefore come from the transition rows 5–15, whose lattice defects push a shear band back through the regular rows on either side. This is what an elastic sheet does with a disclination: the defect's strain field is not local. A real cord fabric has a third dimension to spend it in, so the photograph's eyes may be flatter or more puckered at exactly these transitions than a planar solve can show. That is the first argument for the 3D template of README §8.

The three-block layout has more of this, 40, 50, and 32 wide junctions in its three blocks, and six orientation violations. All six are at outer gaps (events 4, 18, 78, 91, 96, 110, all selvedge turns in the first block) and there are four sampled crossings. These are folds of selvedge loops onto neighbours under the axial compression that the extra blocks add. They are local and rendered visibly in the structure view; the motif around them is intact.

## 4. Restart invariance

Six random seeds against the wiring seed, Eyes one block, final defaults. Procrustes is the rigid-motion residual in cord diameters after allowing a reflection.

| Seed | Orientation violations | Crossings | Procrustes to wiring |
| --- | ---: | ---: | ---: |
| wiring | 0 | 0 | reference |
| 1 | 25 | 155 | 3.85 |
| 2 | 3 | 13 | 0.12 |
| 3 | 85 | 199 | 4.52 |
| 4 | 86 | 171 | 4.74 |
| 5 | 3 | 5 | 0.22 |
| 6 | 2 | 6 | 0.09 |

Three seeds reach the wiring basin to within a quarter diameter and differ from it only by a few selvedge folds. Three are globally folded. The chevron behaves the same way: of six random seeds, three land on the wiring layout (Procrustes 0.04, 0.10, 0.31 with at most 4 violations) and three fold (19, 24, and 30 violations, Procrustes 1.2–1.6). Random starts are therefore not a reliable production path, and the orientation penalty applied from `T/2` cannot unfold a start that the scaffold folded. The wiring seed, a valid planar embedding of the exchange sequence, is the production path; random seeds remain the invariance check the README asks for. The positive result is that when a random start does unfold, it lands on the same layout, so the physical energy has one basin for this graph.

## 5. Sensitivity checks that were run

- `α_min = 0` versus `10⁻³`: no change to four decimals.
- `d_min = 0.7` versus `0.9`: repulsion pairs drop from 161 to 16 with no change in angle. The angle was never a repulsion effect.
- Excluding the terminal tails from repulsion: no change. No tail pairs were active.
- Main loop `T` from 500 to 5000: no change once the physical solve is under-damped.
- `w_cross = 3`: angle 83.6° with the old polish, at the cost of 11% strain; not needed after the momentum fix.
- `θ = 45°` control with the old polish: also came out sheared, which was the first evidence that the solve, not the profile, was at fault.

Not yet run: the shear test as specified (`w_cross → 0` should free the elongation), the removal experiment for rows 5, 6, 15, recolouring and renaming invariance, the empty-event case, and any photo comparison.

## 6. Cost

| Sample | Scaffold pairs | Main loop | Physical solve | Total |
| --- | ---: | ---: | ---: | ---: |
| Chevron, 8 blocks | 2,556 | 0.2 s | 1.2 s | 1.5 s |
| Eyes, 1 block | 22,578 | 1.3 s | 4.3 s | 5.6 s |
| Eyes, 3 blocks | 155,961 | 9 s | 12 s | 21 s |

Node 22 on the research machine; the split between main loop and physical solve is approximate, taken from runs with and without the 3000-step solve. The physical solve now dominates; its cost is linear in nodes, and 3000 steps is a safe default rather than a measured minimum.

## 7. In the application

The model now backs the Cord network view as [`src/domain/springNetwork.ts`](../../src/domain/springNetwork.ts), selected by a springs/harmonic toggle with springs as the default. It emits the same `CordNetworkLayout` the harmonic model does, so the SVG renderer, surface patches, face mirror, SVG download, and the click-to-inspect junction panel are unchanged.

Two things had to change for interactive use:

- **A Verlet neighbour list for the repulsion.** Rebuilding the grid hash every step cost 70% of the runtime. Candidate pairs within `d_min + 0.5` are cached and rebuilt only when some node has moved more than half that skin. One Eyes block went from 1.8 s to 0.5 s with identical output.
- **A local scaffold and a shorter main loop**, `scaffoldRadius = 8` and `T = 200`. Measured over all eight bundled samples at their full preview lengths, against the experiment's all-pairs scaffold at `T = 500`:

| | All pairs, T = 500 | Radius 8, T = 200 |
| --- | ---: | ---: |
| Total solve time, eight samples | 26.9 s | 10.1 s |
| Total topology conflicts | 25 | 7 |
| Eyes, full 10-block cycle, 1730 splits | 7.4 s, 8 conflicts | 3.4 s, 0 conflicts |
| Eyes (36-cord), 2124 splits | 13.9 s, 7 conflicts | 4.0 s, 2 conflicts |

The local scaffold is not a quality compromise. The wiring seed is already planar, so long-range springs mostly hold the fabric at the square lattice that the physical solve then has to undo.

Solves run in the existing worker and stream intermediate layouts, so the preview draws a partial network with a percentage while it settles. Intermediate frames skip the crossing and port audit; it runs once on the finished geometry. The two samples that still finish with conflicts, Eyes (36-cord) and Eyelets, report them in the preview's diagnostics rather than presenting an invalid layout as finished.

The full Eyes cycle rendered beside the reference photograph reproduces the staggered nested eyes, alternating a central eye with a side-by-side pair, with partial eyes at both selvedges. That is a qualitative match of the motif arrangement, not the calibrated photo comparison of astra Phase 3, which is still to do.

## 8. What to do next

1. **Shear and removal tests** from README §11, and the recolour, rename, and empty-input checks. They are cheap and decide whether the rule is general.
2. **Unfolding for random seeds**: apply the orientation term from the start with the mirror vote at `T/4`, or drop random starts and keep the wiring seed with a perturbation test instead.
3. **3D template** at the transitions, where the planar solve stores strain that a real fabric would release out of plane.
4. **Photo comparison** on the central Eyes region following [astra Phase 3](../astra/validation.md#phase-3--compare-to-the-real-photo). The one-block layout already has the landmarks that phase needs.
5. Resolve the remaining conflicts in Eyes (36-cord) and Eyelets, which are selvedge-loop folds of the same kind as §3.
