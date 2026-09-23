# Findings: packed layout of the chevron and Eyes graphs

Experiment dates: chevron 2026-09-22, Eyes 2026-09-23. Script: [`experiment.mjs`](experiment.mjs). Model: [README](README.md) §3–§4. Tests 1–6 and 9–11 of [README §7](README.md#7-experiments-that-decide). Sections 1–7 are the chevron; 8–11 are Eyes. Nothing here is photo-validated; the comparison target remains [`eyes.webp`](../../public/expected-layouts/eyes.webp).

```sh
node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8                                              # 1 pitch and width
node --experimental-strip-types docs/packed/experiment.mjs chevron16 source=docs/packed/chevron16.scot blocks=8 steps=6000
node --experimental-strip-types docs/packed/experiment.mjs chevron24 source=docs/packed/chevron24.scot blocks=8 steps=6000
node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8 pull=0 tag=free                              # 2 free mode
node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8 pull=0.386,0.562,0.672,0.770 tag=pull        # 3 calibration
node --experimental-strip-types docs/packed/experiment.mjs chevron blocks=8 rmin=0.5,0.75,1 tag=rmin                     # 4 selvedge
node --experimental-strip-types docs/packed/experiment.mjs eyes blocks=1 steps=20000 release=5000                        # 5, 9, 10, 11
node --experimental-strip-types docs/packed/experiment.mjs eyes blocks=1 steps=20000 release=5000 pull=0.62 tag=cal      # 5, calibrated pull
node --experimental-strip-types docs/packed/experiment.mjs eyes blocks=3 steps=20000 release=5000 tag=b3                 # 6
```

Each run writes `<sample>-<tag>-<run>-surface.svg` (cords as tubes with the splittee patch on top at every split), `-structure.svg` (centrelines, samples, event IDs, contact lines, conflict markers) and one `<sample>-<tag>-metrics.json` per invocation. The script imports the parser, the simulator, the examples, and `buildElasticNetwork` for its seed. It changes no application file.

**Summary.** The packed model reproduces the ply-split lattice from cord width and tension alone: no rest length, no pitch, no crossing-angle spring, no turn length. Segment length comes out at `d / sin φ` for the realised crossing angle `φ`, to within 0.2 %, on every run. The selvedge loop shapes itself. On Eyes it removes every topology conflict its elastic seed arrives with, at one block and at three, and halves the count of over-opened junctions — the fold-free result the model was built for.

Five results change the model as it was proposed. The crossing angle is **not** set by the working pull alone: selvedges stiffen a strip toward 90°, so the same pull gives 82° on eight cords, 76° on sixteen and 75° on twenty-four (§2), and a patterned fabric adds a bias of its own, putting Eyes at 83° (§8.1). With no pull at all the strip is a floppy mechanism rather than a square lattice (§3). The bend limit `R_min` does nothing at the default sample spacing, because the selvedge turn happens at the junctions (§4). And the junction clearance `φ_min`, inert on the chevron, turns out to set the geometry of an isolated single split exactly (§8.2). Getting this far needed four corrections to the first draft of the model, recorded in §6.

## 1. Results with the final defaults

Profile: `θ = 36.53°` (the app's elongation 1.35), `f / T = 0.562`, `φ_min = 30°`, `R_min = 0.5 d`, `h = d/3`, `k_w = 50`, `k_b = 5`, `dt = 0.1`, `γ = 3`, stiffness ramp 200 steps. Seeded from the elastic layout at the same `θ`. Angles are the realised crossing angle between the two out-ports, as in the elastic metrics; "interior" excludes the outer gaps and the first and last two rows.

| Sample | Cords | Events | Nodes | Links | Steps | Interior angle | Outer angle | Segment `d` | `1 / sin φ` | Width `/ (n d)` | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chevron, 8 blocks | 8 | 56 | 322 | 354 | 1,750 | 81.9 ± 2.5° | 79.7 ± 4.3° | 1.012 ± 0.009 | 1.010 | 0.734 | 0 |
| Chevron 16, 8 blocks | 16 | 120 | 642 | 714 | 6,000 | 75.9 ± 1.9° | 76.9 ± 4.4° | 1.030 ± 0.009 | 1.031 | 0.678 | 0 |
| Chevron 24, 8 blocks | 24 | 184 | 962 | 1,074 | 6,000 | 74.7 ± 2.9° | 75.7 ± 5.1° | 1.036 ± 0.014 | 1.037 | 0.645 | 0 |

"Conflicts" is orientation violations plus sampled curve crossings, both zero everywhere in this document. Every junction is positively oriented in every run. Residual wall overlap is `0.013 d` at full clearance and `0.021 d` near a junction, matching the `T / k_w = 0.02 d` that a penalty wall of this stiffness predicts.

Figures, all at the default pull:

- [`chevron-surface.svg`](chevron-surface.svg) and [`chevron-structure.svg`](chevron-structure.svg): the eight-cord chevron as a packed lattice with rounded selvedge loops. In the structure view the red and orange lines are active contacts; they fill the interior evenly, which is what "pressed as compact as possible" looks like.
- [`chevron16-surface.svg`](chevron16-surface.svg), [`chevron24-surface.svg`](chevron24-surface.svg): the same pattern at 16 and 24 cords, from [`chevron16.scot`](chevron16.scot) and [`chevron24.scot`](chevron24.scot).

### 1.1 The pitch is a prediction and it holds

This is the result the model was built for. The elastic model *assumes* `ℓ = d / sin 2θ` and then measures how far the solve strays from it. The packed model has no length at all: cords have width, they are pulled tight, and the distance between consecutive splits is whatever comes out. What comes out is `d / sin φ` at the realised angle `φ`:

| Sample | Realised angle | Measured segment | `d / sin φ` | Error |
| --- | ---: | ---: | ---: | ---: |
| Chevron 8 | 81.88° | 1.012 d | 1.0101 d | +0.2 % |
| Chevron 16 | 75.86° | 1.030 d | 1.0312 d | −0.1 % |
| Chevron 24 | 74.74° | 1.036 d | 1.0365 d | −0.05 % |

The packing argument of [README §2.1](README.md#21-packing-gives-the-pitch-and-the-width) is therefore not an idealisation that has to be fitted; it is what a sheet of incompressible cords under tension does. The spread is `±0.9 %` across a strip, an order of magnitude tighter than the elastic model's edge strain on Eyes.

The width does **not** come out as cleanly. Measured envelope width per cord against `1 / (2 cos θ)` at the realised angle: 0.734 against 0.662 (8 cords), 0.678 against 0.634 (16), 0.645 against 0.629 (24). The excess is 0.4–0.7 `d` in absolute terms, roughly one selvedge loop's bulge on each side, because the envelope measures the outermost tube surface and the loops stand outside the junction lattice. The junction extent alone (4.53 `d` at 8 cords, against the elastic model's lattice figure of 3.71) is the comparable quantity, and it is wider for the same reason the elastic layouts were: loops push the outer columns out.

## 2. The crossing angle: a strip is not a sheet

The closed form of [README §2.4](README.md#24-choice-a-default-the-working-pull), `f / T = cos 2θ / cos³ θ`, is derived for an infinite regular sheet. The runs say it is the right shape of answer and the wrong number for a narrow braid.

| `f / T` | Sheet's `2θ` | Measured, 8 cords | Measured, 16 | Measured, 24 |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 90° | 91.6 ± 10.0° (never settles) | | |
| 0.386 | 80.0° | 87.1 ± 5.3° | | |
| 0.562 | 73.0° | 81.9 ± 2.5° | 75.9 ± 1.9° | 74.7 ± 2.9° |
| 0.672 | 67.1° | 74.3 ± 2.5° | | |
| 0.770 | 60.0° | 63.1 ± 2.5° | | |

The response is monotone and lands on the sheet value at both ends of the range, but sits 6–9° above it in the middle, and the gap closes as the strip widens: 8.8° at 8 cords, 2.8° at 16, 1.7° at 24.

The cause is the selvedges, and it is arithmetic. An interior segment has length `d / sin 2θ`, whose derivative pushes toward 90° weakly. A selvedge turn's length goes as `1 / sin θ`, about 3.5 times more strongly at these angles, and every turn is a length the tension wants to shorten by opening the angle. The eight-cord chevron has 14 turn segments in 104, one in 7.4; the sixteen-cord has 14 in 224, one in 16; the twenty-four-cord 14 in 344, one in 25. The angle excess falls with the turn fraction, as it should.

So `f / T` is the dial, the formula is its estimate for a wide braid, and a narrow braid needs a larger pull to reach the same angle — which is what a narrow braid does in the hand. Interpolating the sweep, hitting 73° on eight cords needs `f / T ≈ 0.68` rather than 0.562.

### 2.1 The equilibrium is real, not a jam

Seeded from elastic layouts built at three different angles, the packed solve lands in the same place:

| Elastic seed `2θ` | Packed interior angle | Segment |
| ---: | ---: | ---: |
| 60° | 83.2 ± 3.3° | 1.009 d |
| 73° | 81.9 ± 2.5° | 1.012 d |
| 84° | 81.1 ± 2.0° | 1.014 d |

A spread of 2.1° over a 24° spread of seeds, with the 60° seed the outlier because it had not settled at the step limit. The energy has one basin here, as the elastic model's does for this graph. The layout is not a memory of its seed.

## 3. The free mode is floppy, not square

[README §2.3](README.md#23-the-free-mode-packing-and-tension-both-prefer-a-square-lattice) predicted that with no pull the lattice would settle at 90°, since both packing and tension prefer it. The measurement is worse than that prediction, and more interesting.

With `f = 0` the eight-cord chevron wanders between 88° and 94° for 3,000 steps and never settles: interior angle `91.6 ± 10.0°`, residual never below 40 (against 0.3 when pulled), 8 samples over the bend limit, and 9 junctions above 100° where the pulled run has none. Segment length is `1.054 ± 0.069 d`, a spread seven times the pulled run's. The layout is still topologically sound — zero crossings, zero orientation violations — but it is not a shape.

The reason is that the scissor mechanism of §2.3 is nearly flat in energy but not smooth: it is flat *through contact*, and contacts switch. The energy difference between 73° and 90° is about `0.09 T d` per junction, which is the same order as the noise from a penalty wall of stiffness 50 toggling on and off. Without a pull nothing selects a member of the family, so the strip drifts along it under contact noise.

That is the sharpest statement of what the working pull is for. It is not a correction to a model that would otherwise give 90°; **it is the only thing that gives the packed model a shape at all**, and a packed model without it is under-determined. A real braid escapes this through friction and through being made under tension; this model has the second.

## 4. The selvedge shapes itself, and `R_min` is idle

At the default pull the turn segment comes out 1.69 `d` long over a chord of 1.50 `d`, bulging 0.37 `d` beyond the line joining its two junctions (worst 0.41). Nothing set that: the elastic model needs `ℓ_turn = 1.2 × 2ℓ cos θ ≈ 2.04` as an explicit parameter and [its findings §2.2](../elastic/findings.md#22-selvedge-turns-are-not-pitch-length-segments) show the interior shears wide when the value is wrong. Here the loop is what a taut tube that cannot pass through its neighbours does, and the interior is at the same angle as the rest of the fabric (outer 79.7° against interior 81.9°).

The loop does lengthen with the pull, as it must, since a longer braid pulls its edges in: 1.69 `d` at `f / T = 0.562`, 1.87 at 0.672, 2.09 at 0.770.

Varying `R_min` changes nothing:

| `R_min` | Interior angle | Turn length | Bulge | Samples over the bend limit |
| ---: | ---: | ---: | ---: | ---: |
| 0.5 d | 81.9 ± 2.5° | 1.694 d | 0.374 d | 0 |
| 0.75 d | 81.4 ± 2.5° | 1.701 d | 0.368 d | 12 |
| 1.0 d | 81.3 ± 2.7° | 1.709 d | 0.366 d | 18 |

The turn is unchanged to 1 % and the bulge actually shrinks slightly as the limit tightens. The explanation is [README §3.4](README.md#34-bend-limit-corrected): at `h = d/3` the per-sample limit is 38.9°, a turn of `θ ≈ 41°` at the realised angle fits in one or two kinks, and those kinks are **at the junctions**, where the limit does not apply. `R_min` only shapes what bends between junctions, and at these angles almost nothing does. The count of over-limit samples rising with `R_min` while the geometry does not move says the term is being violated at a few places and paying for it, not reshaping the fabric.

So test 4's answer is that the selvedge is set by tension and by the junction geometry, not by cord stiffness. If a photograph shows rounder loops than 0.37 `d`, the missing ingredient is bending stiffness as a real energy (a cord resists curvature everywhere, not just past a limit), not a larger `R_min`.

## 5. Sensitivity

Eight-cord chevron, default profile, one parameter changed at a time. "Angle" is the interior mean.

| Change | Angle | Segment | Width `/(n d)` | Note |
| --- | ---: | ---: | ---: | --- |
| default | 81.9° | 1.012 | 0.734 | 1,750 steps to settle |
| `h = d/2` | 81.5° | 1.013 | 0.719 | |
| `h = d/4` | 82.9° | 1.012 | 0.719 | not settled at 9,000 steps |
| `k_w = 25` | 81.0° | 1.012 | 0.705 | overlap doubles, as expected |
| `k_w = 100`, `dt = 0.1` | 77.1 ± 8.3° | 1.109 | 0.779 | **unstable**; see below |
| `k_w = 100`, `dt = 0.05` | 81.8° | 1.015 | 0.784 | |
| `k_w = 100`, `dt = 0.03` | 81.7° | 1.015 | 0.784 | |
| `k_b = 2.5` | 81.8° | 1.012 | 0.734 | |
| `k_b = 10` | 81.9° | 1.012 | 0.734 | |
| `γ = 1` | 81.8° | 1.012 | 0.732 | |
| `γ = 5` | 81.8° | 1.012 | 0.734 | |
| `dt = 0.05` | 81.8° | 1.012 | 0.734 | |
| `φ_min = 20°` | 81.9° | 1.012 | 0.734 | identical to default |
| `φ_min = 56°` | 80.0° | 1.014 | 0.749 | turn length 1.83 vs 1.69 |
| `selfExempt = 1.2` or `2.2` | 81.9° | 1.012 | 0.734 | identical to default |

Reading:

- **The solver settings do not choose the answer.** Damping over 1–5, time step over 0.03–0.1, and the bend stiffness over a factor of four all give the same angle to 0.1° and the same segment length to 0.3 %. This is the check that the shape is a property of the energy and not of the integrator, and it is the check the elastic model failed at first ([elastic findings §2.1](../elastic/findings.md#21-the-physical-solve-needs-momentum)).
- **`k_w = 100` at `dt = 0.1` is an integrator limit, not physics.** An explicit step needs `dt < 2 / √k_w`, which is 0.2 there, and the contact forces are stiff enough that the margin is not enough; lowering `dt` recovers the same 81.8°. A first draft of this document claimed `k_w` moved the angle by half a degree — that was this instability, not a stiffness dependence.
- **The sample spacing does matter, mildly.** Halving `h` from `d/2` to `d/4` moves the angle 1.4°, about 1.7 %, more than [README §7](README.md#7-experiments-that-decide)'s test 7 allows. The residual dependence is in the junction clearance, which is evaluated at link closest points and so resolves the crossing a little differently at each spacing, and in the fact that the finer runs settle more slowly. `h = d/3` is within 0.4° of `h = d/2` at a third of the cost of `h = d/4`; it is a reasonable default, but the 1.4° should be carried as a known systematic and not read as signal.
- **`φ_min` is inert over the range that matters.** Dropping it from 30° to 20° changes nothing at all, so nothing in a healthy chevron is pressing against the junction clearance. Raising it to 56°, the first draft's value, does change the fabric (angle −1.9°, turn +8 %), which means 56° *is* active: it was pushing selvedge loops apart. That is the argument for the lower value — the clearance should be a floor that never fires on sound fabric, not a shaping force.
- **The self-exemption window is inert**, so the same-cord rule is not doing hidden work.

## 6. Four corrections the runs forced

The first draft of [README](README.md) §3–§4 did not run. Each correction is marked *corrected* in the README; this is what went wrong.

### 6.1 Samples drift along their own cord

The tension energy of a straight run does not depend on where along it a sample sits, so any tangential force moves samples freely. They bunched, the bend gradient (which scales as `1/h`) blew up, the bend energy reached 490 against a tension energy of 369, and the strip inflated to twice its width. The fix is to remove the tangential component of every sample's velocity each step and to redistribute samples to equal arc length every step, not every ten. The residual reported for convergence is then the *normal* force, since the tangential one is not something a sample can respond to.

This is not a numerical detail. It is the statement that a sample is a discretisation of a cord, not a bead on it, and the model has one degree of freedom per sample, not two.

### 6.2 Point walls read the clearance wrong, in an angle-dependent way

The draft checked sample pairs and accepted the 1.4 % under-read of the distance between two parallel tubes sampled at `h = d/3`. The under-read depends on how neighbouring cords' samples are phased, which depends on the shear angle, so it modulates the tension energy by about 1.4 % as the lattice shears — comparable to the entire 73°-versus-90° difference the pull is fighting over. Measured: with sample walls the pitch came out `0.994 d` at 81°, 1.8 % below `d / sin φ`; with link-to-link (capsule) walls it is `1.012 d`, 0.2 % above. The clean pitch result of §1.1 exists only because the walls are exact.

### 6.3 Graded clearance tiers are loose in the wrong places

The draft's tiers (0 within `0.6 d` of a shared junction, `d/2` out to `1.3 d`, `d` beyond) keyed on the larger of the two arc distances, which lets a selvedge loop press to half a diameter of an unrelated cord. A second attempt derived an exact rule for two straight tubes but distinguished in-ports from out-ports, which assumes both cords run straight through the junction; a turning cord does not, and its loop was crushed. The side-agnostic form now in [README §3.3](README.md#33-walls-the-width-constraint-corrected), the distance two straight tubes crossing at `φ_min` would have, is tight for any straight crossing and allows a kink at the junction.

### 6.4 The bend limit must not apply at junctions

With the limit at every node, the strip disordered: at 90° a selvedge turn needs a 45° bend, which is over the 38.9° per-sample limit, and since tension keeps both legs of the loop straight, that bend wants to happen entirely at the two junctions. A limit there fights the tension at every selvedge, every step. Exempting junction nodes is also the physically right call — a cord gripped inside another cord's plies is exactly where it *can* kink. Stiffness `k_b` came down from 20 to 5 for the same reason, and the ramp (§4.2) exists because the elastic seed arrives with kinks up to 97° at selvedge junctions that tension straightens on its own within a few hundred steps.

## 7. Cost

Measured back to back on an otherwise idle machine (Node 22), 400 steps per sample:

| Sample | Nodes | Links | ms / step | Steps to settle | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chevron, 8 blocks | 322 | 354 | 2.3 | 1,750 | 4.0 s |
| Chevron 16, 8 blocks | 642 | 714 | 4.8 | > 6,000 | 29 s |
| Chevron 24, 8 blocks | 962 | 1,074 | 7.4 | > 6,000 | 44 s |
| Eyes, 1 block | 1,037 | 1,167 | 7.5 | > 3,000 | 22 s |

Per step the cost is linear in node count and dominated by the link-pair wall over a grid hash rebuilt every step. Against the elastic model's 0.4 s for one Eyes block this is 50 times slower, and the gap is the reason this is a research model today. The reductions, in order: a Verlet neighbour list (the elastic model's own history says 70 % of runtime, and the skin logic already exists in `elasticNetwork.ts`), typed arrays in place of the link and segment objects, and fewer steps from a better seed. None of them changes the model.

Timings taken while other work ran on the host were discarded; two runs reported wall-clock times near an hour because the machine slept mid-run, which is also why the step counts above are the reliable figure and the seconds are indicative.

### 7.1 The settled test does not scale

The stopping rule is a stationary angle and width plus a residual below `0.5 T`. The residual from contacts switching grows with the number of contacts, so the threshold is met on 8 cords (0.32) and not on 16 (1.2) or 24 (3.4), even though the angle in those runs is stationary to 0.05° (16 cords) and 0.07° (24 cords) and the width to better than 0.1 % over their last 600 steps. The threshold should scale with node count, or the residual should be an RMS rather than a maximum. Until then, wide samples report "not settled" while being settled, and the log in the metrics JSON is the thing to read.

## 8. Eyes: the topology result (tests 5 and 6)

One written block of Eyes is 190 events with the current source. **The elastic findings' Eyes numbers describe a different fabric**: commit `d4226f8` extended the pattern after they were written, so their 173-event block, and the event IDs in it, no longer correspond. Every comparison below is therefore against the elastic layout **as a seed on the identical graph**, measured by the same code in the same run, not against the published elastic numbers.

| | Elastic seed | Packed | Elastic seed | Packed |
| --- | ---: | ---: | ---: | ---: |
| | *1 block* | *1 block* | *3 blocks* | *3 blocks* |
| Events | 190 | 190 | 570 | 570 |
| Orientation violations | 2 | **0** | 2 | **0** |
| Curve crossings | 2 | **0** | 2 | **0** |
| Junctions above 100° | 33 | **15** | 129 | **62** |
| Interior angle | 82.6 ± 19.3° | 83.0 ± 17.9° | 87.8 ± 21.9° | 86.9 ± 15.3° |
| Digon lens, widest | 1.09 d | 0.83 d | 1.09 d | 0.83 d |

Both tests pass on their stated condition. The packed solve removes every topology conflict the seed arrives with, at one block and at three, and it halves the count of over-opened junctions in both. That is the prediction of [README §6](README.md#6-what-this-model-predicts-that-the-elastic-model-cannot) item 5: a planar layout moved by non-penetrating tubes cannot fold, so the conflicts that a spring network tolerates are removed by construction rather than penalised.

Neither run settled at 20,000 steps, and the residual behaves as §7.1 describes. The shape, though, is stationary: over the last 600 steps of the one-block run the angle moves within 1.5° and the width within 0.7 %, oscillating rather than drifting.

### 8.1 Eyes is not a chevron, and the angle says so

At the same pull, Eyes comes out at 83.0° where a sixteen-cord chevron with almost the same selvedge fraction (20 turns in 360 segments, against 14 in 224) settles at 75.9°. The selvedge argument of §2 does not explain that. The difference is the pattern's own defects: the transition rows leave the fabric unable to close to the lattice angle, and the strain shows up as a 7° bias and a spread of ±18° that no chevron has. The elastic seed on the identical graph sits at 82.6 ± 19.3°, so **both models agree the Eyes fabric is more open than a chevron** — that is a property of the pattern, not of either energy.

Raising the pull to 0.620 moves the angle to 80.7 ± 17.8° and halves the wide junctions again, 15 → 8, at the cost of stretching the regular segments from 1.100 to 1.128 d. The response is about −40° per unit of pull here, against −62° on the eight-cord chevron, so reaching 73° on Eyes would need roughly `f / T ≈ 0.81`.

### 8.2 Where the strain sits: the single-split rows

Per source row of the one-block layout, with the packed length at the realised angle being 1.008 d:

| Row | Junctions | Mean angle | Min | Max | Mean segment |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | 78.0° | 61.3° | 91.7° | 1.083 |
| 3 | 24 | 86.3° | 73.0° | 104.2° | 1.094 |
| **5** | **1** | **30.0°** | 30.0° | 30.0° | **2.452** |
| **6** | **1** | **30.1°** | 30.1° | 30.1° | **2.420** |
| 8 | 5 | 84.1° | 28.5° | 114.1° | 1.194 |
| 12 | 24 | 93.6° | 68.7° | 157.5° | 1.044 |
| **15** | **1** | **29.4°** | 29.4° | 29.4° | **1.444** |
| 18 | 5 | 75.0° | 7.4° | 106.0° | 1.045 |

Rows 5, 6 and 15 are the single-split rows of the source (`5 5>6`, `6 15>16`, `15 10>11`), and they are exactly the rows the framed removal experiment singles out. In the packed model each sits at **precisely the minimum split angle**, and the cords reaching it are stretched to 2.4–2.7 d against a packed 1.008.

That is not a coincidence, and re-running with `φ_min = 20°` proves it: those three rows move to 19.7°, 19.6° and 20.0°, tracking the floor exactly, while every other row changes by about a degree. **The junction clearance, which §5 found inert on the chevron, is what sets the geometry of an isolated split.** The mechanism is plain: a lone split has no neighbouring splits to pack against, so tension pulls its two cords toward parallel until the only thing left to stop them is the fact that the splitter has to fit through the splittee.

This is the model's sharpest prediction about Eyes, and it is testable against the photograph: at those three places the two cords should lie nearly parallel, with a long unsupported run leading in. It is also the clearest difference from the elastic model, which forces the same junctions toward 73° with a spring and pays for it elsewhere.

One caution about the metric: the `7.4°` minima in rows 17 and 18 are at the free end frontier, where a junction's outgoing port is a loose tail rather than another junction. Tails carry no tension and no wall in this model, so an angle measured into one is meaningless. Those are an artifact of the measure, not folds.

## 9. Digons (test 9)

The two digons of a block, where the same pair of cords meets twice in a row, open to a lens of **0.83 d** at their middle, against **1.09 d** in the elastic seed. They are not symmetric: one side is a direct segment of about 1.0 d, the other bows around at 2.2 d. With the closest points then at arc 0.5 and 1.11 from the shared junctions, the `φ_min` rule asks for 0.725 d of clearance and the fabric gives 0.83, so the lens is held open by the junction clearance with a little slack, not pressed against it.

The elastic findings' digon figure for the older pattern was 0.56 d, so all three values differ and the photograph has to decide. What the packed model adds is that the lens width is **not free**: it follows from `φ_min` and the length of the bowed side, both of which are structural.

Across three blocks, five of the six digons agree at 0.83–0.84 d. The sixth, at events 265/281, opens only to 0.48 d, and its junctions are 1.21 d apart rather than 1.0 — a defect worth a look in the structure view rather than a separate mechanism.

## 10. Release (test 10)

From the settled pulled state, with the pull switched off and 5,000 further steps:

| | 1 block, pulled → released | 3 blocks, pulled → released |
| --- | ---: | ---: |
| Interior angle | 83.0° → **89.7°** | 86.9° → **90.4°** |
| Width per cord | 0.867 → 0.880 d | 0.905 → 0.917 d |
| Length | 18.82 → **16.96** d | 53.48 → 51.01 d |
| Take-up per cord per block | 21.06 → 20.38 d | 22.69 → 22.58 d |
| Conflicts | 0 → 0 | 0 → 0 |

Releasing the pull shortens the strip by 9.9 % at one block and widens it by 1.5 %, opening the crossing toward the square lattice, exactly as [README §6](README.md#6-what-this-model-predicts-that-the-elastic-model-cannot) item 2 predicts. It is a concrete, falsifiable number for a real sample: **a braid under working tension is about a tenth longer and a fiftieth narrower than the same braid slack.**

Two details are worth keeping. The released state is reached from *both* starting pulls with almost identical results — 89.7° against 89.9°, take-up 20.383 against 20.381 d — so it is a well-defined configuration even though §3 showed that a *cold* start with no pull never settles. And the released fabric has 54 junctions above 100° against the pulled 15, which is the same statement as §3 from the other side: with no pull the angle is unconstrained, so the fabric opens wherever its defects let it.

## 11. Take-up (test 11)

Cord length consumed per cord per block, a by-product of the solve and an answer to an open question in [the empirical note](../ply-split-braiding-empirical-data.md):

| | Pulled | Released |
| --- | ---: | ---: |
| Eyes, 1 block | 21.06 d | 20.38 d |
| Eyes, 3 blocks | 22.69 d | 22.58 d |
| Chevron, per block | 1.79 d | — |

The one-block figure is inflated by the end frontiers, where cords run out of fabric; the three-block figure is the better estimate, and the two bracket the honest range. The prediction to test against a real sample is the **ratio**, not the absolute: a cord consumes about 22 diameters of its own length per written block of this pattern, and about 3 % of that is recovered when the work is released.

## 13. In the application

The model ships as [`src/domain/packedNetwork.ts`](../../src/domain/packedNetwork.ts), a third option in the Cord network view beside elastic and framed, and is described on the `#/models` explainer page. It emits the same `CordNetworkLayout`, so the renderer, surface patches, face mirror, SVG download and click-to-inspect work unchanged. Covered by [`tests/packedNetwork.test.ts`](../../tests/packedNetwork.test.ts).

Four things differ from this experiment script, and the first three are the reason it is usable at all:

- **Typed arrays and a Verlet neighbour list.** The candidate contact pairs are cached with a skin of 0.25 d and rebuilt only when some node has moved half of it, the per-pair bound follows the live link lengths so a stretched segment cannot slip through it, and nothing in the step loop allocates. One block of Eyes went from 7.5 ms per step in the script to 2.0 ms, with identical geometry: junction width 4.530 against the script's 4.528, regular chord 1.011 ± 0.009 against 1.012 ± 0.009.
- **A wall-clock budget**, 20 s by default, checked alongside the step cap. Long previews stop there and say so in the diagnostics rather than running for minutes.
- **A settled test without the residual gate.** §7.1's defect is fixed by dropping the absolute residual from the criterion: the app stops when the angle and width have been stationary for 300 steps, which is what "settled" means and does not mis-scale with the node count.
- **Tails are drawn from the seed's directions.** The tails are not fabric and carry no tension or wall here, so extending them straight along the cord let neighbouring tails cross at the start fan — a rendering artifact that the audit, correctly, flagged. They now keep the direction the elastic seed solved for them.

The model is offered only below **300 splits**. Above that it cannot finish inside the budget, and an unfinished packed solve is genuinely worse than the elastic layout it started from: stopped part-way it leaves overlaps the seed did not have (24 conflicts at 20 s on the 760-event Eyes preview, against the seed's 5). The same preview given 180 s reaches 1 conflict, so this is a speed limit and not a defect in the model. Measured at the app's default of four repeats: the chevron settles in 0.4 s, the 24-cord double chevron in 1.9 s, and one block of Eyes at 190 splits takes about 8 s and clears all five of its seed's conflicts.

## 12. What this says about the model, and what is next

Answering the three properties the model was asked for:

- **Width that cannot be compressed.** Works, and is now the only thing holding the fabric apart. Residual overlap is 2 % of a diameter. No settled layout in any run here has a crossing or a fold — including on Eyes at one and three blocks, where the elastic seed arrives with conflicts and the packed solve removes all of them (§8).
- **Pressed to be as compact as possible.** Works, and needed no term of its own: tension on every cord presses its neighbours together, and §1.1 shows the result is the packed lattice to 0.2 %.
- **Pull tension, straight unless bounded.** Works, and is what replaces the pitch, the turn length and the straightness spring. But it cannot set the crossing angle by itself (§3), so the model keeps one dial, and that dial is now known to depend on both the width (§2) and the pattern (§8.1).

One thing the model does that was not asked for and is worth stating: it makes the **junction clearance** a real structural parameter. On regular fabric it never fires, but at an isolated split it is the only thing holding the crossing open, and it sets that geometry exactly (§8.2). If the photograph disagrees there, `φ_min` is the number to change.

Next, in order:

1. **The photograph.** Three predictions are now specific enough to check against it, and all three are independent of the angle calibration: the single-split rows should show two nearly parallel cords with a long unsupported run leading in (§8.2); the digon lens should be about 0.8 d, not closed (§9); and the strip should shorten by a tenth when released (§10). [Framed Phase 3](../framed/validation.md#phase-3--compare-to-the-real-photo) is the procedure.
2. **Calibrate the pull per pattern, not just per width.** §2 gives the width dependence and §8.1 shows Eyes needs about `f / T = 0.81` where the chevron needs 0.68 and the sheet formula says 0.562. Either fit it, or accept choice B's local spring for the angle and keep the pull for the length.
3. **Test 7 properly** (the `h` systematic of §5), then tests 8 and 12.
4. **Speed.** The app now ships the model (§13), and it is the limit on where it can be offered.
