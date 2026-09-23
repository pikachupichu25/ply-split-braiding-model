# Packed model: taut, incompressible cords under working tension

Research date: 2026-09-22. Status: **shipped** as the Cord network view's third model on 2026-09-23, for previews under 300 splits ([findings §13](findings.md#13-in-the-application)). The model is implemented in [`experiment.mjs`](experiment.mjs) and in the app as [`src/domain/packedNetwork.ts`](../../src/domain/packedNetwork.ts). Tests 1–6 and 9–11 of §7 have been run; their outputs are the `chevron-*` and `eyes-*` SVG and metrics files beside this document, and the results are in [findings.md](findings.md). Companion to [`docs/elastic`](../elastic/README.md), whose graph, seed, dynamics loop, renderer contract and acceptance checks it keeps, and to the explainer [cord-network-models-explained.md](../cord-network-models-explained.md), which describes the two shipped models. §3 and §4 describe the model **as implemented**, including four corrections the chevron runs forced (marked *corrected*); §2 is the hand derivation, with what the runs showed appended to §2.4.

**Recommendation: keep the elastic model's graph and solver loop, and replace every spring that carries a rest length with three things that a real cord actually has: a width that cannot be compressed, a pull along its length that makes it as straight and as short as it can be, and nothing else.** The fabric is then held open only by the fact that cords cannot pass through each other, and its pitch, width, selvedge shape and cord take-up all become outputs instead of inputs. One dial remains, the working tension along the braid, because a packed lattice of taut cords has one free mode that no amount of packing or pulling on the cords can fix (§2.3). The default way to set it is a small axial pull, calibrated in closed form from the crossing angle; the elastic model's crossing-angle spring stays available as the fallback.

The three model names say what decides the shape. **Framed**: a rectangular frame. **Elastic**: the material's rest lengths. **Packed**: contact, which is to say the widths of the cords and the tension that presses them together.

Read this top to bottom. §1 turns the three requested properties into physics and shows that two of them are the same thing. §2 works the regular section by hand and finds the free mode. §3 defines the model, §4 the solver, §7 the experiments that decide whether it is better.

## 1. The three properties, as physics

The request was: each cord has a width that cannot be compressed; instead of springs, each cord is pressed to be as compact as possible; each cord has a pull tension and, unless something stops it, is as straight as possible. Each maps to one term, and the second turns out to be a consequence of the third.

### 1.1 Width that cannot be compressed

A cord is a tube of diameter `d`. In the plane of the drawing it is a ribbon of width `d` swept along its centreline, and two ribbons may not overlap. There is exactly one exception, which is the whole point of ply-splitting: at a split the splitter passes *through* the splittee, so the two ribbons overlap there by construction. Everywhere else the centrelines of any two cords are at least `d` apart.

This is a **hard constraint**, not an energy. The elastic model approximates it with a soft spring of rest length `0.9 d` between *nodes* that come too close; two segments can still overlap between their nodes, and the three-block Eyes layout showed six such folds at selvedge loops ([elastic findings §3](../elastic/findings.md#3-where-the-residual-stress-sits)). A wall between the cords themselves, sampled finely enough, cannot be crossed.

Incompressibility also says something along the cord. When a tube bends to a centreline radius `R`, its inner surface is compressed by a factor `(R − d/2)/R`. A material that cannot be compressed cannot bend tighter than `R = d/2`, where the inner surface has zero length. So the same property gives a **minimum bend radius** `R_min = d/2`, and with it a selvedge loop that is round rather than a hairpin, without any turn-length parameter.

### 1.2 Pull tension: straight unless bounded

A cord under tension `T` stores energy `T` per unit length, so its energy is `T × (its length)`. Minimising length makes a cord straight wherever nothing touches it and makes it hug whatever it is deflected by: this is a taut string, and it is the property asked for. Between two contacts the cord is a straight line; around an obstacle it follows the obstacle at the minimum radius allowed. There is no rest length and no preferred pitch.

The force on an interior sample of the cord is `T (û₋ + û₊)`, the sum of the unit vectors toward its two neighbours along the cord. On a straight run the two cancel and the force is zero regardless of spacing; at a bend of angle `ψ` it has magnitude `2T sin(ψ/2)` and points to the inside of the bend. It is a constant-magnitude force, not a spring: pulling harder on a longer cord does not happen. This replaces the elastic model's cord springs (rest `ℓ`), its straightness springs (weight 0.1, which let junctions in the Eyes transition rows open to 141°), its terminal springs and its turn rest length.

### 1.3 Pressed to be as compact as possible: tension already does it

Take the eight-cord chevron. Cord C01 passes through C02, C03 and C04 in turn. Tension on C01 pulls its three junctions toward each other along C01, which presses C02, C03 and C04 side by side until their widths stop them. Tension on C02 pulls *its* junctions together, which presses the cords that pass through C02 side by side. Every cord in the fabric passes through other cords and is passed through, so tension on all cords presses every cord against its neighbours in every direction, and the walls of §1.1 are the only thing that stops the fabric shrinking further.

So "press each cord to be as compact as its neighbours allow" and "pull each cord tight" are the same term in a threaded network. This is what a maker does: pulling each split tight *is* the compaction. No separate pressure term is needed, and none is proposed; §8 lists it as the first thing to add if the experiment shows loose selvedge loops.

The consequence worth stating plainly: with rest lengths gone, the cord's natural pitch between splits is no longer assumed. It is computed by pressing incompressible cords together, and §2.1 shows what comes out.

## 2. The regular section, worked by hand

Everything here is a regular section of fabric: two families of straight cords at `±θ` to the braid axis, crossing at `φ = 2θ`, every cord of one family side by side with the next. Units are `d = 1`, `T = 1`.

### 2.1 Packing gives the pitch and the width

If the cords of family B lie side by side, touching, their centrelines are `d` apart measured perpendicular to themselves. A cord of family A crosses them at angle `φ`, so along A the crossings are

```text
ℓ = d / sin φ = d / sin 2θ
```

apart. This is exactly the pitch the elastic model *assumes* ([elastic README §4.1](../elastic/README.md#41-profile)). In the packed model it is a prediction, and the first experiment (§7) checks that the solver reproduces it. The cell is the same rhombus: axial diagonal `d / sin θ`, lateral diagonal `d / cos θ`.

Each family has about `n/2` cords, and across the braid their side-by-side spacing is `d / cos θ`, so the finished width is

```text
W = (n / 2) · d / cos θ         W / (n d) = 1 / (2 cos θ)
```

[The empirical note](../ply-split-braiding-empirical-data.md) records finished width ≈ 60 % of the cords laid side by side, `W ≈ 0.6 n d`. That gives `cos θ = 0.833`, `θ ≈ 33.6°`, a crossing angle of `67°`. The app's default "Length / width" of `cot θ = 1.35` is `θ = 36.5°`, crossing `73°`, which gives `62 %`. The two agree to within the precision of a rule of thumb, which is a useful sign that the packing picture is the right one and a first calibration for the dial in §2.4.

### 2.2 The elastic model's exception for selvedge turns disappears

Where a cord reaches the outer gap and comes back, the elastic model needs a special rest length, `1.2 × 2ℓ cos θ`, and the findings show the interior angle is wrong without it ([elastic findings §2.2](../elastic/findings.md#22-selvedge-turns-are-not-pitch-length-segments)). In the packed model the turning cord is simply a taut tube: it leaves the last interior junction, bends by `θ` at the first selvedge junction, runs along the edge, bends by `θ` again at the second, and re-enters. Each bend is limited by `R_min`. The loop's length and its outward bulge follow from that; there is no factor to choose. §6 lists what this predicts and §7 how to check it.

### 2.3 The free mode: packing and tension both prefer a square lattice

Here is the catch that any rest-length-free model must face. In the packed lattice every length is a function of `θ`: segment `ℓ = 1 / sin 2θ`, cell area `1 / sin 2θ`. Both are smallest at `2θ = 90°`. So

- pressing the fabric as compact as possible drives it to a **square** lattice, and
- pulling every cord as short as possible drives it to the **same** square lattice.

There is a one-parameter family of packed configurations, one per `θ`, and the cords are straight and touching in all of them: the lattice is a scissor mechanism. The energy difference is small, `2 (1 / sin 73° − 1) ≈ 0.09 T d` per junction between 73° and 90°, which is why the elastic model's scaffold, which is symmetric in the two diagonals, sat at 89.7° until the crossing springs were given 3000 momentum steps to shear it back ([elastic findings §2.1](../elastic/findings.md#21-the-physical-solve-needs-momentum)). A model with only widths and tension will settle at 90° for a *physical* reason, and give a braid `0.71 n d` wide instead of `0.6 n d`.

So one more input is unavoidable. In a real braid it is friction: the angle is set while the row is made and locked when the split is pulled tight. A static model without friction has to supply the angle some other way, and there are two honest choices.

### 2.4 Choice A (default): the working pull

While a braid is made, the work hangs from an anchor and the maker pulls the ends: the braid is under axial tension, visible in the [reference photograph](../../public/expected-layouts/eyes.webp), where the finished strip is being held taut. Add that pull to the model as an axial force `f` on each cord's two ends, and let the lattice find its angle.

Per cord and per junction, the energy is the tension on a segment plus the pull times the axial length that segment contributes:

```text
E(θ) / (T d) = 1 / sin 2θ  −  (f / T) / (2 sin θ)
```

Setting `dE/dθ = 0` gives the working-pull ratio that holds a given angle:

```text
f / T = cos 2θ / cos³ θ
```

| `θ` | crossing `2θ` | slider `cot θ` | pitch `ℓ / d` | width `W / (n d)` | `f / T` |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 30° | 60° | 1.73 | 1.155 | 0.577 | 0.770 |
| 33.6° | 67° | 1.51 | 1.085 | 0.600 | 0.672 |
| 36.5° | 73° | 1.35 | 1.045 | 0.622 | 0.562 |
| 40° | 80° | 1.19 | 1.015 | 0.653 | 0.386 |
| 45° | 90° | 1.00 | 1.000 | 0.707 | 0 |

Checked numerically: at `f / T = 0.562` the energy has its minimum at 36.5°, and it is shallow, with ±3.5° costing under 1 % of the tension energy. The angle is therefore *soft* in this model, as it is in a real braid, which stretches and narrows when pulled. The sensitivity is `dθ / d(f/T) ≈ −24°` per unit, so a 10 % error in the ratio moves the angle by about 1.5°.

Two things make this the recommended choice. It has no spring: the model is tension, walls and a pull, which is the model that was asked for. And it is a different physical hypothesis from the elastic model's: the angle is a property of how the braid was made, not of each junction, so the transition rows of Eyes are free to take whatever local angles tension and packing give them instead of being forced toward 73° and failing.

Its cost is the boundary: the pull acts at the ends, and the end rows will neck slightly. Compare interiors, as the elastic findings already do.

**What the chevron runs showed (2026-09-22).** The formula is for an infinite regular sheet, and a real strip is stiffer in shear than the sheet because of its selvedges: a turn segment's length goes as `1 / sin θ`, which prefers 90° about 3.5× more strongly per segment than an interior segment's `1 / sin 2θ`, and on an eight-cord chevron 14 of 104 segments are turns. At `f / T = 0.562` the eight-cord strip settles at `81.9 ± 2.5°`, a sixteen-cord chevron at `75.8 ± 1.9°` and a twenty-four-cord one at `74.9 ± 2.8°`, converging on the sheet's 73° as the selvedge fraction falls. The equilibrium is genuine, not a jam: seeds at 60°, 73° and 84° all land within 0.5° of each other. Over the sweep `f / T ∈ {0.386, 0.562, 0.672, 0.770}` the eight-cord angle goes `87°, 82°, 74°, 63°` against the sheet's `80°, 73°, 67°, 60°`, and the realised pitch tracks `d / sin φ` at the realised angle to within 2 %. So the dial is `f / T`, the formula is its estimate for a wide braid, and a narrow braid needs a larger pull for the same angle, exactly as a real narrow braid would.

The free limit is also sharper than "settles at 90°": with no pull the packed strip has no preferred shear anywhere, so it is a floppy mechanism that wanders and jams under contact noise (`91.6 ± 10°`, residual never below 40). The pull is what gives the packed model a shape at all.

### 2.5 Choice B (fallback): the split angle

Keep the elastic model's crossing-angle term at each junction, reinterpreted: the parted plies of the splittee grip the splitter at the angle the split was made, and resist scissoring. This is local and it is a spring. It cannot be weak: to hold 73° against the `0.09 T d` per junction that tension gains toward 90°, its stiffness has to be comparable to `T d`, and in the transition rows it will be frustrated exactly as it is today. It is listed because it already exists in the code path and because the experiment should run both and compare them on Eyes.

## 3. The model

Units: `d = 1` for length, `T = 1` for force. Every other constant is dimensionless in those. Colours, faces and row numbers never enter, as in both existing models.

### 3.1 Representation

The graph is the elastic model's: one junction node per split event, one segment per pair of consecutive visits along a cord, the cyclic port order `a-in, b-in, a-out, b-out` at each junction. Two changes:

- **Samples.** Each segment carries interior sample nodes at arc-length spacing `h ≤ d/3`, at least two per segment (about three on a regular segment of length `≈ 1.05 d`, six on a selvedge turn). The elastic model's single midpoint is not enough to resolve a bend of radius `d/2` or to let a turn curve. Sample counts are fixed when the graph is built, from the elastic layout's segment lengths; positions are redistributed to equal spacing during the solve (§4.3). Walls act between the links joining consecutive samples, not between the samples themselves (§3.3).
- **Terminals are drawn, not solved.** The loose tails beyond a cord's first and last junction are not fabric. They are rendered as straight continuations of length `1.5 d` and take part in no term. The pull of §3.5 acts at the first and last junction of each cord.

Each sample knows its cord, its segment, and its arc-length distance to the junction at each end of its segment. That is all the wall term needs.

### 3.2 Tension

```text
E_T = T · Σ_cords Σ_links | x_{k+1} − x_k |
```

over every link between consecutive samples, junction nodes included. The force on a sample is `T (û₋ + û₊)` as in §1.2; a cord's first and last junction feel `T û` toward their single neighbour, which is the maker snugging the last split. A link of zero length has no defined direction and is skipped, as the spring code already does for `r < 10⁻¹²`. `E_T` is convex, a sum of norms, which the constraints below are not.

### 3.3 Walls: the width constraint (*corrected*)

For every pair of **links** (the straight pieces between consecutive samples) on different cords, and for pairs on the same cord more than `1.6 d` apart along it, the closest points of the two links must be at least the clearance apart:

```text
r ≥ c          c = d,  except near a junction the two cords share
```

Near a shared junction the splitter is inside the splittee and the two tubes overlap by construction. Let `s` and `t` be the arc-length distances of the two closest points from that junction along their cords. The clearance there is the distance two **straight tubes crossing at the minimum split angle `φ_min`** would have at those arc lengths:

```text
c(s, t) = min( d, √( s² + t² − 2 s t cos φ_min ) )          φ_min = 30°
```

This is tight for a straight crossing at any angle in `[φ_min, 90°]`, so it never fires on healthy fabric; it lets a cord kink at the junction by up to `180° − φ_min`, which a selvedge turn needs; and it only stops a cord bending *toward* its partner beyond what a `φ_min` crossing would do. A split more glancing than `φ_min` would need the splittee open for more than `d / sin φ_min` of the splitter's length, which a gripfid does not do. `φ_min` is the one number here, and nothing drives an interior split toward it, since tension prefers 90°. At a digon (two consecutive junctions of the same pair) the same rule holds the lens open to `L sin(φ_min / 2)` at its middle for junctions `L` apart, about `0.4 d` at `L = 1.7 d`; the [framed findings](../framed/findings.md) already allow a closed lens ("this does not require a visible air gap"), so whether that is right is a photo question.

Two things here differ from the first draft of this document and were forced by the runs:

- **Links, not samples.** The draft proposed checking sample pairs and accepted a 1.4 % under-read of the clearance between parallel tubes. That under-read is not harmless: it depends on how the samples of neighbouring cords are phased, which depends on the shear angle (`cot φ / h`), so it modulates the tension energy by about 1.4 % as the lattice shears, comparable to the whole 73°-versus-90° difference of §2.3. With sample walls the realised pitch came out `0.994 d` at 81°; with link walls it is `1.012 d`, against `1 / sin 81° = 1.0125`. Segment-to-segment distance (Ericson, *Real-Time Collision Detection* §5.1.9) is the implemented form.
- **A crossing rule, not tiers.** The draft graded the clearance in steps (0 within `0.6 d`, `d / 2` to `1.3 d`, `d` beyond) by the larger of the two arc distances. That is loose in the wrong places, letting a selvedge loop press to `d / 2` of the next cord, and a first attempt at an exact rule that distinguished in-ports from out-ports assumed both cords run straight through the junction, which a turning cord does not. The side-agnostic straight-crossing rule above has neither problem.

Enforcement is a stiff one-sided penalty, over a grid hash of link midpoints with cell `d + h`:

```text
E_W = ½ k_w · Σ_{link pairs, r < c} (c − r)²          k_w = 50 T/d
```

applied at the closest points and distributed to the four link endpoints by their barycentric weights. The wall is stiff, not hard: under a contact force of order `T` the overlap is `T / k_w`, and the runs show `0.02 d`. A projection (position-based) version is the upgrade if the stiffness ever limits the step; see §4.4.

### 3.4 Bend limit (*corrected*)

Three consecutive samples at spacing `h` turning through `ψ` describe an arc of radius `h / (2 sin(ψ/2))`. With `R_min = d/2`:

```text
ψ ≤ ψ_max = 2 arcsin( h / d )       = 38.9° per sample at h = d/3
E_B = ½ k_b · Σ_free samples max(0, ψ − ψ_max)²        k_b = 5 T d
```

The limit applies at **free samples only**, not at junction nodes. A cord passing through another cord is gripped there and may kink; the runs showed why the exemption is needed: the selvedge turn wants its whole bend of `θ` at the junction (tension keeps both legs straight), and at 90° that bend is 45°, over the per-sample limit, so a limit at the junction fights the tension at every selvedge and the strip disorders. `k_b` is 5 rather than the 20 first proposed because the bend gradient scales as `1 / h`, and the elastic seed has kinks up to 97° at selvedge junctions that tension alone straightens; §4.2's ramp exists for the same reason.

At the default spacing a turn of `36.5°` fits in one sample, so the packed selvedge is two kinks at the junctions and a straight run between them; `R_min` then shapes only what bends *between* junctions, and test 4 measures how little that is.

### 3.5 Working pull

```text
E_P = − f · Σ_cords â · ( x_last − x_first )        f = T · cos 2θ / cos³ θ
```

where `x_first`, `x_last` are the cord's first and last junction and `â` is the unit vector from the centroid of the first-row junctions to the centroid of the last-row junctions, recomputed each step so the pair of pulls exerts no torque. A cord visited once has `x_first = x_last` and feels no pull, which is right: it transmits nothing. The slider `cot θ` sets `f` through the table in §2.4 and nothing else. Set `f = 0` to run the control in §7.

### 3.6 Orientation, unchanged

The signed-sector penalty of the elastic model stays as a safety net, idle when every junction is healthy. A continuous motion of non-penetrating tubes from a planar seed cannot fold, so it should never fire; if it does, the diagnostics say so, and the port-order and curve-crossing audits still gate acceptance.

### 3.7 Total

```text
E = E_T + E_W + E_B + E_P + E_orient        ( + E_cross, choice B only, off by default )
```

### 3.8 What each elastic parameter becomes

| Elastic model | Packed model |
| --- | --- |
| pitch `ℓ = d / sin 2θ`, assumed | an output; predicted to be the same in regular sections |
| turn rest length `1.2 × 2ℓ cos θ` | gone; selvedge shape from tension and `R_min` |
| terminal rest `1.5 ℓ`, weight 0.25 | tails drawn, not solved |
| straightness springs, weight 0.1 | tension `T`, a constant force; plus the bend limit |
| crossing-angle springs, weight 0.5 | the working pull `f`, one number from `θ` (fallback: kept as choice B) |
| repulsion at `d_min = 0.9`, weight 1, node to node | link-to-link walls at exactly `d`, reduced at a shared junction to a `φ_min` crossing's clearance, stiff |
| scaffold `α(t)`, radius 8, 200 unfolding steps | gone; the solve starts from the elastic layout |
| orientation penalty, `s_min = 0.05` | kept as a safety net |
| polish `dt = 0.1`, `γ`, 3000 steps, tolerance | kept, with a step cap, a stiffness ramp and a settled test |
| new | `T = 1`, `f / T`, `R_min = d/2`, `φ_min = 30°`, spacing `h = d/3`, `k_w`, `k_b` |

Of the new constants only `f / T` shapes the fabric. `R_min` and `φ_min` are physical floors with stated meanings; `h`, `k_w`, `k_b` are discretisation and should not change the answer (experiment 7; the runs show `k_w` and `k_b` do not, and `h` carries a 1.4° systematic over a 2× range, [findings §5](findings.md#5-sensitivity)).

## 4. Solver

### 4.1 Seed

Start from the **elastic model's converged layout**, sampled along its curves. It is planar, has the right handedness, and is already within a few percent of packed in regular sections, so the packed solve only tightens it: no scaffold and no unfolding stage. The wiring seed is not usable directly, because its row pitch of `2ℓ cos θ / (n − 1)` per event stacks samples on top of each other and the walls would blow it apart; stretching it axially by `n − 1` before the walls come on is the fallback if the elastic layout is ever unavailable.

This makes the packed model a **stage after the elastic model** rather than a replacement of its code: `elastic → packed`. The preview's model toggle gains a third entry.

### 4.2 Dynamics (*corrected*)

The elastic model's under-damped kick–drift–kick loop, for the same reason it was needed there: the free mode of §2.3 is the softest mode of the strip and gradient descent crawls along it. Changes:

- **Step cap.** No sample moves more than `d / 10` in one step, so nothing can tunnel through a wall between two evaluations.
- **Normal motion only for samples.** A sample's motion along its own cord is reparametrisation, not physics: the tension energy does not depend on where along a straight run a sample sits. Left free, samples drift along the cord under any tangential force, bunch up, and the bend gradient (which scales as one over the link length) blows up; the first runs exploded this way. So the tangential component of every sample's velocity is removed each step, and the residual reported for convergence is the normal component of the force. Junction nodes move freely.
- **Stiffness ramp.** `k_w` and `k_b` rise from 10 % to full over the first 200 steps, so tension straightens the seed's artefacts (the elastic curves kink up to 97° at selvedge junctions) before the constraints act on them.
- **Stability and damping.** An explicit integrator with a wall of stiffness `k_w` and unit mass needs `dt < 2 / √k_w = 0.28`; `dt = 0.1` is safe for `k_w = 50`. Contacts chatter, and the constant-magnitude tension force makes every bend a bouncing ball, so the damping is `γ = 3` rather than the elastic model's 0.1; the soft shear mode is over-damped at that value and still relaxes in about 1,500 steps on the chevron. The answer does not depend on it: `γ ∈ {1, 3, 5}` and `dt ∈ {0.1, 0.05}` give the same angle within 0.1°.
- **Neighbour list.** A grid hash of link midpoints rebuilt every step; the elastic model's Verlet list is the optimisation if the cost matters.
- **Settled, not converged.** A penalty-contact system with a tangential projection keeps a small residual from contacts switching, typically `0.1–0.3 T` on the chevron. The stopping test is therefore that the interior crossing angle has moved less than `0.1°` and the envelope width less than `0.2 %` over the last 300 steps, with the residual below `0.5 T`.

### 4.3 Redistribution (*corrected*)

Every step, move each segment's interior samples to equal arc length along their current polyline. This is a reparametrisation with no physical content; with the normal-only motion above it keeps the link lengths uniform, which the bend term needs.

### 4.4 Position-based alternative

If the stiff penalty limits the step size too much, the walls and the bend limit become **projections**: after the tension and pull forces move the samples, sweep the violated pairs and push each apart to exactly `c` (splitting the move equally), sweep the over-bent triples and open them to `ψ_max`, repeat two or three times, then update velocities from the projected positions. This is position-based dynamics (Müller et al., 2007), and it is how yarn-level cloth and rope simulators keep contacts hard without a stiffness constant. It is the same loop with the wall term moved from the force pass to a projection pass; keep it in reserve.

### 4.5 Cost

Measured in the experiment script (Node, research machine): the eight-block chevron, 322 nodes and 354 links, takes 2.5 s to settle in 1,750 steps, about 1.4 ms per step; one block of Eyes (the app's 190-event preview length), 1,037 nodes and 1,167 links, runs at about 5 ms per step, so 3,000 steps is 15 s against the elastic model's 0.4 s. Almost all of it is the link-pair wall over a grid hash rebuilt every step. A Verlet list, fewer steps from a better seed, and typed arrays in place of objects are the obvious reductions before this is worth putting in the worker.

## 5. Output

The same `CordNetworkLayout`, so the renderer, surface patches, face mirror, download and inspector work unchanged:

- **Curves.** One cubic per segment, fitted by least squares through the segment's samples with its endpoints fixed (two unknown control points, a linear solve). `junctionPatch` reads only the two curves adjacent to a junction, so a segment that needs two cubics, such as a selvedge turn, can carry an intermediate node in `nodes`/`curves` without touching the patch code.
- **Diagnostics.** As now: convergence, sampled crossings, port order. Add the residual wall overlap (largest `c − r`) and the number of active contacts, so a layout that was still pressing when it stopped is visible.
- **Take-up.** The solved length of every cord, per block, is a by-product. [The empirical note](../ply-split-braiding-empirical-data.md) lists the length shrinkage ratio as an open question; this model predicts it and the prediction can be checked against a real sample.

## 6. What this model predicts that the elastic model cannot

Each of these is a test, not a claim.

1. **Pitch and width emerge.** A regular section comes out at `ℓ = d / sin 2θ` and `W = n d / (2 cos θ)` with no length assumed. The 60 % rule then reads as `θ ≈ 34°`, and the app's default 1.35 gives 62 %.
2. **The braid narrows under pull and relaxes toward square when released.** Run with `f` and then with `f = 0` from the same state. A real sample under working tension and then slack should do the same, and by how much is a number the model gives.
3. **Selvedges** are shaped by `R_min` and tension alone. Expect straighter edges with shallower scallops than the elastic model's `1.2×` loops; the photograph shows nearly straight selvedges with small scallops.
4. **Transition rows** take whatever local angles tension and packing allow instead of being pulled toward 73° and failing. The 141° junctions of the elastic layout should either disappear or move; either is informative.
5. **No folds by construction.** A planar seed under non-penetrating motion stays planar. The six selvedge folds of the three-block Eyes layout should not occur. If the audit still reports conflicts, the step cap or the wall stiffness is wrong, not the topology.
6. **Cord take-up** per cord per block is predicted.

## 7. Experiments that decide

Follow the elastic experiment's form: `docs/packed/experiment.mjs`, run with `node --experimental-strip-types`, importing the parser, simulator, examples and, for the seed, `buildElasticNetwork`; writing surface and structure SVGs and a metrics JSON per run; results in `findings.md`. Angles are the realised crossing angle at each junction; "interior" excludes the first and last two rows.

| # | Test | Procedure | Pass condition |
| ---: | --- | --- | --- |
| 1 | Pitch and width | chevron, 8 blocks, `f/T = 0.562`; also 16 and 24 cords | pitch equals `d / sin φ` at the realised angle within 2 %; the angle approaches the sheet's 73° and the width `0.62 n d` as the strip widens. **Run:** 8 cords `81.9 ± 2.5°`, pitch `1.012` vs `1.0125`, width `0.73 n d`; 16 cords `75.8°`, `0.68`; 24 cords `74.9°`, `0.65` |
| 2 | Free mode | same with `f = 0` | no preferred angle: the strip is floppy. **Run:** `91.6 ± 10°`, never settles, 8 over-bent samples |
| 3 | Pull calibration | `f/T ∈ {0.386, 0.562, 0.672, 0.770}` | monotone, ending at 60° for 0.770 and heading to 90° for 0; the sheet's `80°, 73°, 67°, 60°` are approached from above on a narrow strip. **Run:** `87 ± 5°, 82 ± 2°, 74 ± 3°, 63 ± 3°` |
| 4 | Selvedge | chevron, `R_min ∈ {0.5, 0.75, 1.0} d` | scallop depth and loop length reported; compare to the photograph's edge. **Run:** loop length `1.69–1.71 d` over a chord of `1.5 d`, bulge `0.37 d`, unchanged by `R_min` because the turn happens at the junctions (§3.4); larger `R_min` only adds over-bent samples |
| 5 | Eyes, one block | default profile | zero port conflicts, zero crossings, angle histogram of the transition rows against the elastic layout's 17 junctions above 100° |
| 6 | Eyes, three blocks | default profile | zero conflicts where the elastic model has six selvedge folds |
| 7 | Discretisation | `h ∈ {d/2, d/3, d/4}`, `k_w ∈ {25, 50, 100}` | angle and width unchanged within 1 %; residual overlap scales as `1 / k_w` |
| 8 | Choice B | Eyes, split-angle term instead of the pull | side-by-side angle histograms and conflict counts; pick the one that matches the photograph's transitions |
| 9 | Digons | lens width at Eyes events 61/78 and 75/91 | reported; decide from the photograph whether a floor is needed |
| 10 | Release | Eyes from the converged pulled state, `f → 0` | angle change and width change reported; a prediction for a real sample |
| 11 | Take-up | every sample | cord length per block in diameters; a prediction for the empirical note |
| 12 | Cost | every sample | steps to converge from the elastic seed, and time |

Then the framed plan's photo comparison ([Phase 3](../framed/validation.md#phase-3--compare-to-the-real-photo)) unchanged, on the central Eyes region.

## 8. Risks and open points

- **The angle is soft, and a strip is not a sheet.** The pull sets the angle globally and nothing holds it locally; selvedges stiffen a narrow strip toward 90° (§2.4), so the same `f / T` gives different angles on different widths, and with no pull at all the strip has no shape. Calibrate `f / T` per width from the finished-width rule, or accept choice B's local spring. Local wandering of several degrees in a strip with defects is expected; experiments 5 and 12 measure it.
- **End rows.** The pull is applied at cord ends, so the first and last rows carry it and will neck. Report interiors. If it is ugly in the app, spread the pull over the last two rows or crop the render.
- **Digons and glancing splits.** `φ_min` bounds how glancing a split may be and how far a digon lens opens. It is a physical guess. Experiment 9 and the photograph decide it.
- **No lateral pressure term.** §1.3 argues tension is enough. If selvedge loops come out loose, a weak pressure toward the braid axis is the first thing to add, and it is a fudge.
- **Contact chatter.** Stiff walls oscillate, and the residual never reaches zero (§4.2). At `γ = 3` it does not move the answer; the position-based variant of §4.4 removes it if a later sample needs a cleaner stop.
- **Still flat.** Like both existing models this is two-dimensional. Real fabric spends the transition strain in the third dimension; the 3D split template of [elastic README §8](../elastic/README.md#8-3d-extension-the-split-template) applies here too, with tubes becoming capsules and the junction clearance becoming the front/back straddle.
- **Still no friction.** The angle comes from a pull because friction is not modelled. A row-by-row solve that packs each new row against the locked previous rows would be closer to the making process; it would inherit its angle from the first row and needs the same dial, so it is not proposed.

## 9. Compared with the other two models

| | Framed | Elastic | Packed |
| --- | --- | --- | --- |
| What decides the shape | a pinned rectangular frame | rest lengths and a crossing-angle spring | widths, tension, and a working pull |
| Cord length between splits | averaged | assumed `d / sin 2θ` | computed; predicted `d / sin 2θ` |
| Cord straightness | none | weak spring, kinks to 141° | taut string; straight unless touched |
| Cord width | none | soft node repulsion at `0.9 d` | hard wall at `d`, graded at a junction |
| Selvedge turns | pinned to a line | rest length `1.2 × 2ℓ cos θ` | emergent from tension and `R_min` |
| Crossing angle | from the frame | spring at every junction | one global pull, `f/T = cos 2θ / cos³ θ` |
| Free parameters that shape the fabric | elongation | `ℓ`, `θ`, `ℓ_turn`, `d_min`, four weights | `θ` (as `f/T`) |
| Folds | impossible (Tutte) | penalised, audited | impossible under the step cap, audited |
| Seed | wiring, pinned | wiring, scaffold-unfolded | the elastic layout |
| Cost, one Eyes block | 0.06 s | 0.4 s | about 15 s in the experiment script (§4.5), unoptimised |
| Predicts take-up | no | no | yes |

## 10. Implementation sequence

1. **Done:** [`experiment.mjs`](experiment.mjs) samples the elastic layout, runs the loop of §4 with the terms of §3, and writes surface and structure SVGs plus a metrics JSON per run. Experiments 1–4 have been run on the chevron; the pitch, the pull response and the free mode came out as §2.4 now describes, after the four corrections marked above.
2. Experiments 5–9 and 12 on Eyes, and a pull calibrated per cord count ([findings §12](findings.md#12-what-this-says-about-the-model-and-what-is-next)).
3. **Done.** [`packedNetwork.ts`](../../src/domain/packedNetwork.ts) emits `CordNetworkLayout` and is dispatched from `cordNetwork.worker.ts` as a third model that runs after the elastic solve, with the slider mapped to `f`. Covered by [`tests/packedNetwork.test.ts`](../../tests/packedNetwork.test.ts) and described on the `#/models` page. The conflicts are gone on Eyes at one and three blocks ([findings §8](findings.md#8-eyes-the-topology-result-tests-5-and-6)); the limit is speed, so it is offered below 300 splits ([findings §13](findings.md#13-in-the-application)).
4. Photo comparison, then a pull calibrated per pattern rather than per sheet.

## 11. Symbols

| Symbol | Meaning | Default |
| --- | --- | ---: |
| `d` | cord diameter, the unit of length | 1 |
| `T` | tension along every cord, the unit of force | 1 |
| `θ` | half the crossing angle in a regular section; the one calibrated dial, from the slider `cot θ` | 36.5° |
| `f` | working pull on each cord's ends, along the braid axis | `T cos 2θ / cos³ θ ≈ 0.56 T` |
| `h` | sample spacing along a cord | `d / 3` |
| `R_min` | minimum bend radius of a centreline, from incompressibility | `d / 2` |
| `ψ_max` | largest turning angle per sample, `2 arcsin(h / d)` | 38.9° |
| `s`, `t` | arc-length distances of two links' closest points from the junction their cords share | |
| `c(s, t)` | clearance between the two links: `min(d, √(s² + t² − 2 s t cos φ_min))` near a shared junction, else `d` | |
| `φ_min` | most glancing split allowed; the only parameter of the junction clearance | 30° |
| `k_w` | wall stiffness, numerical | `50 T / d` |
| `k_b` | bend-limit stiffness, numerical, free samples only | `5 T d` |
| `â` | braid axis, first-row centroid to last-row centroid | recomputed each step |
| `dt`, `γ` | time step and damping of the dynamics | 0.1, 3 |

## 12. References

- Method: tightening a knotted tube by shrinking it while pushing overlapping parts apart is the SONO algorithm, P. Pierański, *In search of ideal knots*, 1998, and its constrained-gradient successor, T. Ashton, J. Cantarella, M. Piatek, E. Rawdon, *Knot tightening by constrained gradient descent*, Experimental Mathematics, 2011. The packed model is that algorithm applied to a threaded sheet, with the tube's excluded volume as the wall and its length as the energy.
- Position-based constraints: M. Müller, B. Heidelberger, M. Hennix, J. Ratcliff, *Position based dynamics*, 2007, for §4.4.
- Yarn-level contact: J. Kaldor, D. James, S. Marschner, *Simulating knitted cloth at the yarn level*, SIGGRAPH 2008, for inextensible yarns with contact as the model of a textile's shape.
- The analogy for §2.4: in machine braiding the braid angle is set by take-up speed against carrier speed, a process parameter, not by the yarn. Here the working pull plays that role.
- Everything the packed model keeps from the elastic model is referenced in [elastic README §14](../elastic/README.md#14-references-and-licence).
