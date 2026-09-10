# Spring network: split graph with a force-directed layout

Research date: 2026-09-10. Status: **shipped.** Prototyped in [`experiment.mjs`](experiment.mjs) (results and the three corrections it forced are in [findings.md](findings.md)), then implemented in the app as [`src/domain/springNetwork.ts`](../../src/domain/springNetwork.ts) and made the default model of the Cord network view. Companion to [`docs/astra`](../astra/README.md), which supplies the graph. Method reference: [CrochetPARADE](https://github.com/stassev/CrochetPARADE) by Svetlin Tassev, read from its solver source [`graph.cpp`](https://github.com/stassev/CrochetPARADE/blob/main/graph.cpp) on the research date.

**Recommendation: keep the astra graph (one vertex per split, one edge per cord segment) and replace the harmonic seed plus local relaxation with CrochetPARADE's layout.** Every edge becomes a spring with a rest length. A second set of weak, annealed springs, one per node pair at the graph-geodesic distance, unfolds the network from any starting position. Plain gradient descent minimises the total energy, and a short damped-dynamics pass polishes it.

Three additions are needed that crochet did not need. A mesh of length-only springs shears freely, so the crossing angle between cords needs its own spring. Springs cannot keep two parallel segments apart, so cord thickness needs a short-range repulsion. Springs cannot tell a layout from its mirror image, so port orientation must be checked, and in 3D projected, after every step.

Read this document top to bottom, then [findings.md](findings.md). Section 2 records what CrochetPARADE actually computes. Sections 4 and 5 define the ply-split model and solver as implemented. Section 11 lists the experiments that decide whether the model is worth integrating; the findings report which have been run.

## 1. The graph is unchanged from astra

Construct the network exactly as [astra §2](../astra/system.md#2-construct-the-complete-cord-network) and [`audit-events.mjs`](../astra/audit-events.mjs) do:

- One **junction vertex** per `SplitEvent`. Both cords pass through it. The splitter and the splittee centrelines meet there.
- One **start terminal** and one **end terminal** per initial cord, including cords that are never split.
- One **segment edge** per pair of consecutive visits along a cord, carrying the cord ID. Two cords that meet twice in a row produce two distinct parallel edges (the Eyes digons at events 61/78 and 75/91).
- The **cyclic port order** `a-in, b-in, a-out, b-out` at every junction, where `a` is the cord on the left before the exchange. It is topology, not a finished direction.

Worked example, the README chevron worked once (`color: CBAAAABC`, rows `1 1>2,3,4` and `2 8>7,6,5,4`), simulated on the research date:

| Event | Splitter | Splittee | Lanes |
| ---: | --- | --- | --- |
| 0 | C01 | C02 | 1 → 2 |
| 1 | C01 | C03 | 2 → 3 |
| 2 | C01 | C04 | 3 → 4 |
| 3 | C08 | C07 | 8 → 7 |
| 4 | C08 | C06 | 7 → 6 |
| 5 | C08 | C05 | 6 → 5 |
| 6 | C08 | C01 | 5 → 4 |

Cord C01 visits `0, 1, 2, 6`, so its path is `start → e0 → e1 → e2 → e6 → end`. Between events 2 and 6 its role changes from splitter to splittee. Cord C08 visits `3, 4, 5, 6`. Every other cord visits one event. The graph has 23 vertices and 22 edges.

Sizes for the 20-cord **Eyes** source, from the same simulator:

| Written blocks | Events | Vertices | Edges | Node pairs |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 173 | 213 | 366 | 22,578 |
| 2 | 346 | 386 | 712 | 74,305 |
| 3 | 519 | 559 | 1,058 | 155,961 |

Vertices are `2·cords + events`; edges are `2·events + cords`. The pair count matters because CrochetPARADE's scaffold term touches every pair each iteration.

Colours, face flags, source row numbers, and reference-image coordinates do not enter the graph or the energy. This is the same rule as astra.

## 2. What CrochetPARADE actually does

This section is a reading of `graph.cpp` (function `performLayout`), not of the manual, which does not describe the solver. Paraphrased formulas use `x_i` for node positions, `r_ij = |x_i − x_j|`, and `δ_ij` for the graph distance.

### 2.1 Input

A stitch is a small subgraph: named nodes plus **connections** `tail-length-head`, each with a rest length in stitch units (for example `!-1-A;B-0.4-A` in a slip stitch definition). The pattern chains these subgraphs into one graph. Nodes may carry fixed coordinates, or coordinates flagged as an initial guess only (`ic_guess`). In 3D the front end also emits **orientation quadruples** `(i1, i2, i3, i4, h)`; see §2.7.

### 2.2 All-pairs graph distances

Dijkstra runs from every node over the connection lengths, giving `δ_ij` for every pair. For adjacent pairs `δ_ij` is the connection length itself. Pairs in different connected components get `separate × (largest finite δ)`, default `separate = 1.5`, which pushes disjoint pieces apart.

### 2.3 Pair force

For every pair `(i, j)` with at least one free node and `0 < δ_ij < repulsion_radius`:

```text
f_ij = ½ · (r_ij² − δ_ij²) / (r_ij² + 0.001)                 scalar, dimensionless
       × α(t) / (δ_ij² + 0.001)      only if i and j are NOT adjacent
F_i += f_ij · (x_i − x_j)
F_j −= f_ij · (x_i − x_j)
```

with the anneal factor `α(t) = √(1 − t/T) + 10⁻³` for iteration `t` of `T`. When `inflate` is set, `δ_ij²` in the non-adjacent weight becomes `δ_ij^(2 + 2 (t/T)^inflate)`, so the weight decays from `1/δ²` toward `1/δ⁴` during the run.

This force is the gradient of a logarithmic spring:

```text
E_ij(r) = ¼ r² − ½ δ² ln r        minimum at r = δ, stiffness d²E/dr² = 1 there
```

Adjacent pairs are full-strength springs at their connection length. Non-adjacent pairs are the same spring at the graph distance, weighted by `α(t)/δ²`. The `1/δ²` weight is the Kamada–Kawai stress weight; the anneal turns the long-range part into scaffolding that is nearly gone by the end (`α` reaches `10⁻³`, not zero).

### 2.4 Update and restarts

Plain gradient descent on free nodes, `x_i ← x_i − η F_i`, with `η = learning_rate = 0.1`. Forces on **fixed** nodes are summed, divided by the number of free nodes, and that average is added to every free node's step (`x_i ← x_i − η F_i + η ⟨F_fixed⟩`). There is no convergence test. The loop runs `T = iterations = 500` steps and prints `√(Σ_adjacent f_ij² / |E|)` each step. If any coordinate exceeds `10⁵` or becomes NaN, `η` is divided by 3 and the whole run restarts from the same random seed, at most 11 times.

### 2.5 Initial positions

Uniform random in `[−5, 5]` per coordinate from the given seed, except nodes with fixed coordinates or an `ic_guess`, which start where specified.

### 2.6 Post-processing

If `viscous_iterations > 0` (default 10): scale all free positions about the origin so the mean edge length equals the mean rest length, then run kick–drift–kick dynamics on **adjacent springs only** with the Hookean force `(r − δ)/r · (x_i − x_j)`, time step `viscous_timestep = 0.1`, and implicit damping `v ← (dt·F + 2v)/(2 + dt·γ)`, `γ = viscous_damping = 1`.

### 2.7 3D orientation projection

After every 3D iteration, for each quadruple `(i1, i2, i3, i4, h)`:

```text
n  = normalize( (x3 − x1) × (x2 − x3) )
m  = (x3 + x4) / 2
x4 = m + h·n/2
x3 = x4 − h·n
```

Nodes 3 and 4 are placed `h` apart along the local surface normal, centred on their previous midpoint. This is a hard projection, not a force. It is the only term in the code that knows about orientation; the 2D path has no such term.

### 2.8 Defaults

| Parameter | Default | Role |
| --- | ---: | --- |
| `start` | 0 | random seed |
| `iterations` | 500 | gradient steps per attempt |
| `learning_rate` | 0.1 | step size, divided by 3 on blow-up |
| `inflate` | off (2.0 when given) | sharpen long-range decay over the run |
| `separate` | 1.5 | distance multiplier for disconnected pairs |
| `repulsion_radius` | 10¹⁰⁰ | graph-distance cutoff for pair terms, effectively none |
| `viscous_iterations` | 10 | polish steps |
| `viscous_timestep` | 0.1 | polish time step |
| `viscous_damping` | 1.0 | polish damping |
| `ic_guess` | false | use supplied coordinates as a start, not as anchors |

### 2.9 What it does not do

No excluded-volume repulsion (`repulsion_radius` is a cutoff, not a hard core). No bending or angle term. No planarity or crossing check. No convergence criterion. No gravity. The 2D mode has no orientation constraint, so a 2D layout can come out mirrored or locally folded, and the annealed long-range springs are the only thing working against that.

## 3. Stitch to split

| CrochetPARADE | Ply-split spring model |
| --- | --- |
| Stitch subgraph with named nodes | Split junction: one node in 2D, three nodes in 3D (§8) |
| Connection `tail-length-head` | Segment edge with rest length from the pitch profile |
| Previous stitch `!` | Previous visit along the same cord |
| Top node / bottom node | No analogue; cords have no row hierarchy, only visit order |
| Orientation quadruple, height `h` | Port orientation check (2D); splittee front/back bundle projection (3D) |
| Fixed node coordinates | Optional anchored start terminals; pinned unused cords |
| `ic_guess` coordinates | Wiring-diagram seed: gap position across, event order along |
| `separate` for disjoint pieces | Not used; unused cords are pinned and reported as unintegrated |

## 4. The spring model

Units are normalised by the cord diameter `d = 1`, as in astra.

### 4.1 Profile

| Symbol | Meaning | Default | Note |
| --- | --- | ---: | --- |
| `ℓ` | pitch: rest length between consecutive splits along a cord | `d / sin 2θ ≈ 1.05` | fitting parameter; astra's `pitchSS/TT/Mixed` collapsed to one value first |
| `θ` | half crossing angle; cords run at `±θ` to the braid axis | 36° | `cot θ ≈ 1.35`, the current preview's default elongation |
| `d_min` | excluded-volume distance between non-adjacent nodes | 0.9 | keeps digons and folds open |
| `ℓ_T` | terminal edge rest length | `1.5 ℓ` | weight 0.25; the free tails are not fabric |
| `ℓ_turn` | selvedge turn rest length: two consecutive visits of one cord at the same outer gap | `1.2 · 2ℓ cos θ ≈ 2.04` | the lattice puts those junctions `2ℓ cos θ` apart; see findings §2 |
| `w_bend` | straightness spring weight | 0.1 | |
| `w_cross` | crossing-angle spring weight | 0.5 | |
| `w_rep` | repulsion weight | 1 | |
| `α₀`, `α_min` | scaffold anneal start and floor | 1, 10⁻³ | CrochetPARADE's schedule |

The pitch argument: two cord families cross at angle `2θ`; if one family is packed side by side at spacing `d`, consecutive crossings along a cord of the other family are `d / sin 2θ` apart. This is a packing idealisation, not a measurement.

### 4.2 Physical springs

Every segment edge `e = (i, j)` with cord ID `c`:

```text
E_cord = Σ_e w_e · ((r_ij − ℓ_e) / d)²
         w_e = 1 for junction–junction edges, 0.25 for terminal edges
         ℓ_e = ℓ (junction–junction), ℓ_T (terminal)
```

Rest lengths may later depend on the two endpoint roles (splitter→splitter, splittee→splittee, role change), exactly astra's `pitchSS`, `pitchTT`, `pitchMixed`. Start with one value; add a role dependence only if a physical comparison demands it.

One role-independent exception is required. When a cord's two consecutive visits are both at the same outer gap, the cord has reached the selvedge and turned back. In the regular lattice those two junctions are `2ℓ cos θ` apart, not `ℓ`. That segment gets rest length `ℓ_turn` and its midpoint bows outward as the selvedge loop. Giving it `ℓ` compresses every selvedge and shears the whole interior wide (findings §2).

### 4.3 Straightness springs

A cord should not kink at a split. For each consecutive triple `(p, j, n)` along one cord, a second-neighbour spring at the straight-line rest length:

```text
E_bend = w_bend · Σ_(p,j,n) ((r_pn − ℓ_pj − ℓ_jn) / d)²
```

This is the standard mass–spring bending term. Skip every triple that spans a segment where the cord reverses its lane direction: selvedge turns and the interior reversals in transition rows. Direction at an event is `+1` when the cord moves to a higher lane and `−1` otherwise; the splitter moves toward the splittee and the splittee takes the splitter's old lane. Triples across a regular crossing are kept, including at selvedge junctions, because the crossing itself is lattice-regular and the turn happens along the turn segment.

### 4.4 Crossing-angle springs

Four equal springs around a junction form a rhombus that shears freely. Without a shear term the strip's elongation is arbitrary and the solver will pick whatever the anneal happens to leave. Encode the preferred crossing angle as springs between the two forward neighbours and between the two backward neighbours:

```text
at junction j with ports (a⁻, b⁻, a⁺, b⁺):
E_cross = w_cross · Σ_j [ ((r_{a⁺b⁺} − 2ℓ sin θ) / d)² + ((r_{a⁻b⁻} − 2ℓ sin θ) / d)² ]
```

Two segments of length `ℓ` meeting at angle `2θ` end `2ℓ sin θ` apart. The resulting rhombic cell has axial diagonal `2ℓ cos θ` and lateral diagonal `2ℓ sin θ`, so elongation `cot θ` emerges from the profile instead of being imposed by a frame. Because the springs attach to port neighbours, not to faces, they apply unchanged at the digon, triangle, and pentagon regions the audit found.

The implementation attaches these springs to the **adjacent** nodes (the edge midpoints, or a terminal), with the general rest length `√(ℓ_a² + ℓ_b² − 2 ℓ_a ℓ_b cos 2θ)` for adjacent edge rests `ℓ_a`, `ℓ_b`. At a digon the two junction-level forward neighbours are the same node, so the junction-level form is undefined there; the adjacent-node form is what opens the lens.

An equivalent alternative is a diagonal spring across each quadrilateral face at rest length `2ℓ cos θ` or `2ℓ sin θ`. It needs the face walk and a rule for non-quad faces, so the port form is preferred.

### 4.5 Excluded volume

Springs alone let the two parallel segments of a digon collapse onto one line and let neighbouring cords pass through each other. Add a hard-core repulsion between any two nodes that do not share an edge:

```text
E_rep = w_rep · Σ_{i<j, not adjacent, r_ij < d_min} ((d_min − r_ij) / d)²
```

Evaluate it with a uniform grid hash of cell size `d_min`; it is sparse. Exclude adjacent pairs and every pair of nodes that are ports of the same junction: two cords overlap where one passes through the other, and their in-ports sit only `ℓ sin θ ≈ 0.6 d` apart in a regular cell. Outside a junction neighbourhood the nearest nodes are about `d` apart, so this term is idle in healthy fabric and active only at collapsing digons, folds, and transition defects. To give the repulsion something to act on inside a segment, insert **one midpoint node per junction–junction edge** (astra §3, step 1). Midpoints carry the cord springs (rest `ℓ/2` each side) and repulsion, but not the scaffold term (§4.6), which keeps the pair count at the junction level.

### 4.6 Scaffold springs (CrochetPARADE's core)

For every pair of junction or terminal nodes, a weak spring at the graph distance, annealed away:

```text
δ_ij  = shortest-path length over segment edges, weights = rest lengths (Dijkstra from every node)
E_scaffold(t) = α(t) · Σ_{i<j} (d / δ_ij)² · ((r_ij − δ_ij) / d)²
α(t) = √(1 − t/T) + α_min           for t < T, then 0 during the polish
```

Either the Hookean form above or CrochetPARADE's logarithmic form (§2.3) is acceptable; they agree to second order at `r = δ`, and the logarithmic one avoids a square root and a `1/r` singularity. The Hookean form is used here because it gives a clean energy for backtracking, which the repository's existing `relaxSpacing` already relies on.

This term is the reason a random start unfolds into a strip. It must not survive to the end: graph distance on a mesh is a Manhattan-like metric that overestimates Euclidean distance by up to `√2`, so a permanent scaffold would swell the fabric toward the graph metric. Its job is to remove folds early, then hand the shape to the physical, straightness, and crossing springs.

### 4.7 Anchors and rigid motion

Default: no fixed nodes. After the solve, translate the centroid to the origin, rotate the principal axis of the junction positions to vertical, and choose the mirror so that the port orientation (§7) matches the canonical wiring order at the majority of junctions.

Options, mirroring astra's boundary profile: pin the start terminals to a line (`straight-anchor`) with a quadratic anchor term or as hard-fixed nodes; leave the end frontier free. Untouched cords are two-node components. CrochetPARADE would push them to `separate × max δ`; here they are pinned at their lane positions and reported as unintegrated material.

### 4.8 Total energy

```text
E(x, t) = E_cord + E_bend + E_cross + E_rep + E_scaffold(t) + E_anchor
```

All terms are dimensionless in `d`. Only `E_scaffold` depends on the iteration counter.

## 5. Solver

```text
build graph from Simulation (astra construction), insert midpoints
compute δ_ij by Dijkstra over junction/terminal nodes
x ← seed (wiring diagram) or uniform random in [−5, 5]^D with seed s
η ← 0.1
for attempt in 1..11:
    for t in 0..T−1:                                    T = 500
        α ← √(1 − t/T) + α_min
        F ← ∇E(x, t)                                    grid hash for E_rep, all pairs for E_scaffold
        x_free ← x_free − η F_free
        if any |x| > 10⁵ or NaN: η ← η/3, restart attempt from the same seed
        if t > T/2 and orientation is violated at junction j: reject the step for the nodes of j (backtrack)
    break when the attempt finishes
physical solve: rescale so mean edge length = mean rest length, then 3000 kick–drift–kick steps
        on every term except the scaffold, dt = 0.1, γ = 0.1 (under-damped), α = 0
report metrics; align rigid motion and mirror (§4.7)
```

The main loop unfolds; the physical solve is where the shape is decided. CrochetPARADE's ten over-damped steps are not enough here: the scaffold prefers the square lattice (both cell diagonals equal), and gradient descent cannot relax the global shear back to `2θ` in any practical number of steps. An under-damped run with momentum reaches a true minimum, with the gradient at zero and the same result at 3000 and 6000 steps (findings §2).

Points where this departs from CrochetPARADE, and why:

- **Seed.** Use the wiring-diagram positions (gap across, event order along) as `ic_guess` by default. It is a valid planar embedding of the exchange sequence, so it biases the solve toward the correct chirality. Random seeds are used for the invariance test (§11), not for the production layout.
- **Orientation penalty** in the second half of the schedule: at `t = T/2` the majority sign of the junction sectors picks the global mirror, then a quadratic penalty on any sector area below `s_min` holds local orientation. CrochetPARADE has nothing equivalent in 2D. It is not strong enough to unfold a badly folded random start (findings §5).
- **No fixed-node force redistribution.** The anchors here are few or none; the heuristic is not needed.
- **Stopping.** Keep the fixed iteration count for reproducibility, but also record `max |F|` and the RMS edge strain at the end so runs that did not settle are visible.

Outputs: node positions, per-edge strain `(r − ℓ)/ℓ`, per-junction realised crossing angle, scaffold energy at the end, orientation violations, sampled curve crossings (reuse `findCurveCrossings`), digon lens widths, and the seed and schedule that produced the result.

## 6. What the anneal buys and what it costs

The final layout is a local minimum of the physical energy **selected by the path** the scaffold took. Two runs with different seeds or different `T` can settle in different minima at comparable residual. That is not a defect of the implementation; it is the model. The consequences:

- Report residuals and the seed with every layout. Never present a single run as "the" shape.
- Run the invariance test (§11) before trusting a motif. If the Eyes bands differ across seeds at the same residual, the physical springs are not determining the shape and the angle terms are too weak or the model is missing a constraint.
- The `α_min` floor leaves a `10⁻³` bias toward the graph metric. The polish step removes it. Test `α_min ∈ {0, 10⁻³, 10⁻²}` to confirm the floor does not matter.

The scaffold also makes the outer frame of astra §3 unnecessary. The strip width is not declared; it emerges from `ℓ`, `θ`, and the cord count. Whether that emergent width matches the photograph is a test, not an assumption.

## 7. Chirality and folds

Every term in §4 depends on distances only. A reflected copy of any node set satisfies the same distances, so the energy cannot distinguish a junction whose ports run `a⁻, b⁻, a⁺, b⁺` counter-clockwise from one where they run clockwise. A global reflection is harmless: it is the back view, and §4.7 fixes it. A **local** reflection is a fold: one junction mirrored inside unmirrored neighbours, with inverted cells around it. Springs in the neighbours resist it but do not forbid it.

The check: at each junction take the four port directions (toward the adjacent midpoints), sort by cyclic port order, and require every signed turning angle to lie in `(0, π)` with total `2π`. This is `portConflicts` in `cordNetwork.ts`. Combined with the sampled crossing test, it is the acceptance gate. A layout that fails it is reported as unresolved with the offending junction IDs, following astra's rule: never fix a fold by moving one event by hand.

CrochetPARADE's answer in 3D is the projection of §2.7, which sets a signed normal from a cross product. The 3D template in §8 reuses that projection directly.

## 8. 3D extension: the split template

In 2D a split is one node. In 3D it becomes a three-node template on the local normal, which is the direct analogue of a CrochetPARADE stitch subgraph:

```text
F   splittee front bundle          T⁻ ── F ── T⁺        rest ℓ on each side
S   splitter core                  S⁻ ── S ── S⁺        rest ℓ on each side
B   splittee back bundle           T⁻ ── B ── T⁺        rest ℓ on each side
projection after every step:
    n = normalize( (x_{S⁺} − x_{S⁻}) × (x_{T⁺} − x_{T⁻}) )
    m = (x_F + x_B) / 2
    x_F = m + h·n,  x_B = m − h·n,  x_S = m             h = d/2
```

The splittee passes the junction as two half-cords straddling the splitter, which is the equal-partition surface model of astra §5, now as geometry. Scaffold, straightness, and crossing springs attach to `S`. With equal bundles the template is symmetric under `n → −n`, so chirality does not change the shape, only which side is called front. Fix that side once from the seed. The front camera then sees `F` over `S` over `B` at every junction, and the reverse view is the same object from the other side. Unequal partitions, ply twist, and fabric thickness need input the simulator does not have, and stay out of scope.

## 9. Compared with the harmonic model

| Aspect | Harmonic, `cordNetwork.ts` | Spring model |
| --- | --- | --- |
| Start | wiring seed with a fixed outer frame and side anchors | wiring seed or random; no frame |
| Global coupling | Laplacian solve, linear, unique for the frame | annealed stress, nonlinear, path-dependent |
| What sets the shape | frame plus neighbour averaging, then a spacing relaxation | rest lengths and crossing-angle springs |
| Width | fixed by the lane count | emergent from `ℓ`, `θ`, cord count |
| Non-quad regions | tiny cells from the seed, opened by relaxation | same springs everywhere; repulsion opens digons |
| Uniqueness | yes, given the frame | local minimum; needs restart tests |
| Orientation | sector backtracking during relaxation | same check, plus 3D projection |
| Cost per step | sparse, `O(V)` | `O(V²)` while the scaffold is active |
| 3D | none | split template with normal projection |
| Assumed by the frame | start and end fans, straight sides | nothing; edge turns must emerge |

The harmonic model is the safer default while the spring model is unvalidated. The spring model is the one that can answer whether a packed strip with these pitches and angles produces the Eyes stagger on its own.

## 10. Cost

Scaffold evaluation is `pairs × T`. For Eyes with `T = 500`: one block is `2.3×10⁴ × 500 ≈ 1.1×10⁷` pair evaluations, three blocks `1.6×10⁵ × 500 ≈ 7.8×10⁷`. Both fit inside the current Web Worker budget. Dijkstra from every node is `O(V·E log V)`, negligible at these sizes. Repulsion is sparse through the grid hash.

Beyond roughly 3,000 junctions, cut the scaffold at a graph radius (CrochetPARADE's `repulsion_radius`, which it never uses) or switch to a sparse pivot stress. Do not subdivide edges more finely than one midpoint until a photo comparison asks for curvature the midpoint cannot express.

## 11. Experiments that decide

Spring-specific tests, run before any of astra's photo phases:

| Test | Procedure | Pass condition |
| --- | --- | --- |
| Restart invariance | wiring seed plus 10 random seeds, Eyes 1 block | layouts agree after rigid and mirror alignment, within solver tolerance, at equal residual |
| Chirality | count junction orientation signs | all one sign; a global flip is allowed, a mixed count is a fold and fails |
| Shear | chevron with `w_cross ∈ {0, 0.1, 0.5, 2}` | elongation is arbitrary at 0 and settles to `cot θ` as `w_cross` grows |
| Digons | lens width at events 61/78 and 75/91 | approximately `d_min`, both segments distinct |
| Schedule sensitivity | `T ∈ {200, 500, 2000}`, `α_min ∈ {0, 10⁻³, 10⁻²}` | final layout unchanged within tolerance |
| Pitch and angle sweep | `ℓ ∈ [1.0, 1.3]`, `θ ∈ [30°, 45°]` | motif arrangement is stable; only proportions change |
| Removal experiment | drop source rows 5, 6, 15 (astra §6) | geometry changes although splittee colours do not |
| Empty and untouched | no events; a never-split cord | straight pinned cords, no fabricated surface |

Results of the rows that have been run are in [findings.md](findings.md). Then apply astra's gates unchanged: [Phase 3](../astra/validation.md#phase-3--compare-to-the-real-photo) photo comparison on the central Eyes region and [Phase 4](../astra/validation.md#phase-4--prove-the-rule-is-general) generality cases. The minimum qualitative gate is the same: nested bands, staggered arrangement, edge continuation, traceable continuous cords, zero topology violations.

## 12. Implementation sequence

1. **`docs/spring/experiment.mjs`** (done), run with `node --experimental-strip-types`, importing only the parser, simulator, and examples, like the astra audit. It builds the graph with the audit's incidence and port logic, runs the solver of §5, and writes surface and structure SVGs plus a metrics JSON per sample. No application files change.
2. Restart invariance, chirality, digons, schedule and turn-length sensitivity are in the script and reported in [findings.md](findings.md). Shear, removal, and empty-input tests remain.
3. **Done.** [`springNetwork.ts`](../../src/domain/springNetwork.ts) emits the existing `CordNetworkLayout`, so `renderCordNetworkSvg`, the surface patches, the face mirror, and the preview's inspector work unchanged. [`cordNetwork.worker.ts`](../../src/domain/cordNetwork.worker.ts) dispatches on a model name and streams intermediate layouts; the preview keeps `harmonic` selectable beside the default `springs`. Covered by [`tests/springNetwork.test.ts`](../../tests/springNetwork.test.ts).
4. 3D template and reverse-face rendering only after step 3 holds.

The app module differs from the experiment in two solver settings, both measured across all eight bundled samples: the scaffold is cut off at graph distance 8 rather than run over all pairs, and the main loop is 200 iterations rather than 500. Because the wiring seed is already a planar embedding, the long-range scaffold has little to unfold, and the shorter local one is 2.8x faster **and** leaves fewer topology conflicts. Everything else, including the physical solve, matches this document.

Parameter defaults to expose, all overridable from the experiment script:

| Parameter | Default |
| --- | ---: |
| `pitch ℓ` | `1 / sin 2θ` |
| `theta θ` | 36° |
| `dMin` | 0.9 |
| `terminalLength` | `1.5 ℓ`, weight 0.25 |
| `wBend`, `wCross`, `wRep` | 0.1, 0.5, 1 |
| `iterations T` | 500 in the experiment, 200 in the app |
| `learningRate η` | 0.1, ÷3 on blow-up, 11 attempts |
| `alphaMin` | 10⁻³ |
| `scaffoldRadius` | all pairs in the experiment, 8 in the app |
| `polishSteps`, `polishDt`, `polishDamping` | 3000, 0.1, 0.1 |
| `turnLength` | `1.2 · 2ℓ cos θ` |
| `seed` | wiring diagram; integer for random |
| `anchorStart` | off |

## 13. Assumptions to keep visible

- One pitch for all roles, one crossing angle everywhere, cords of equal diameter.
- One selvedge turn length for every edge turn, and straightness skipped across every lane-direction reversal.
- Equal-partition split template in 3D.
- Finished shape is a local minimum reached through a specific anneal, not a unique global optimum.
- Simulator lane convention is a persistent material frame (astra §3 of findings). If that changes, normalise the events before building the graph, not the springs.

## 14. References and licence

- Svetlin Tassev, *CrochetPARADE*, [repository](https://github.com/stassev/CrochetPARADE), [site](https://www.crochetparade.org/). Solver in `graph.cpp`; stitch grammar in [`Manual.md`](https://github.com/stassev/CrochetPARADE/blob/main/Manual.md). Code is GPLv3.
- Émile Greer and David Mould, *Modeling Crochet Patterns with a Force-directed Graph Layout*, Expressive 2025 (Eurographics), [record](https://diglib.eg.org/items/f96dda09-9180-4777-a11e-774723b7d2c0). The PDF could not be retrieved during this investigation; only the abstract was read.
- Kathryn Gray, Brian Bell, Stephen Kobourov, *A Graph Model and a Layout Algorithm for Knitting Patterns*, 2024, [arXiv:2406.13800](https://arxiv.org/abs/2406.13800). Directly relevant: planar graph with prescribed edge lengths and a no-crossing requirement, which is the constraint pure springs lack.
- T. Kamada and S. Kawai, *An algorithm for drawing general undirected graphs*, 1989, for the `1/δ²` stress weights; E. Gansner, Y. Koren, S. North, *Graph drawing by stress majorization*, 2004, for the majorisation alternative to gradient descent.

CrochetPARADE is GPLv3. This document describes its method; it copies no code. Implement the solver from this description in this repository's own code, and do not paste from `graph.cpp` unless the project adopts a GPL-compatible licence.
