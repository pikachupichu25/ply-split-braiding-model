# How the framed, elastic and packed models work

Status: explainer. Last updated: 2026-09-23 (a third model, **packed**, joined the view; see §4.5 and [docs/packed](packed/README.md)).
Audience: anyone with first-year maths and physics. You need vectors and distances, the idea that a derivative is a slope, Hooke's law for a spring, Newton's second law with a drag force, and the law of cosines. Nothing else is assumed.
Purpose: explain why the app's Cord network view treats a ply-split braid as a physical network, and how its three models, **framed**, **elastic** and **packed**, turn a list of splits into a drawing of the finished fabric. The first two are spring networks and are the subject of most of this document; the third replaces every spring with contact and tension, and is summarised in §4.5.

The deeper references, in increasing depth: [framed/harmonic-embedding.md](framed/harmonic-embedding.md) (the maths behind the framed model's seed), [elastic/README.md](elastic/README.md) (the full elastic model), [elastic/findings.md](elastic/findings.md) (what its experiments showed), [packed/README.md](packed/README.md) and [packed/findings.md](packed/findings.md) (the packed model and its results). Source code: [`src/domain/framedNetwork.ts`](../src/domain/framedNetwork.ts), [`src/domain/elasticNetwork.ts`](../src/domain/elasticNetwork.ts) and [`src/domain/packedNetwork.ts`](../src/domain/packedNetwork.ts); the shared graph types, curve helpers, topology checks and renderer are in [`src/domain/cordNetwork.ts`](../src/domain/cordNetwork.ts). Every number in this document is taken from those files as they are today.

## 0. The names

The models are named after **what decides the shape**. In the *framed* model the shape is imposed from outside: the network is pinned to a rectangular frame and every free node is averaged into it. In the *elastic* model the shape emerges from the material: cords have a natural length, a preferred crossing angle and a thickness, and the strip finds its own width. In the *packed* model it emerges from contact: the cords have a width they cannot lose and a pull along their length, and everything else — the pitch, the loops, the width of the strip — is what those two facts leave room for.

They used to be called "harmonic" and "springs", and both words still appear below, but only for the physics. *Harmonic* names the averaging rule (a harmonic function, §3.1) that seeds the framed model. *Spring* describes what every term in **both** energies is: the framed model is a network of zero-length springs, the elastic model a network of springs with natural lengths. So "harmonic versus spring" was never a contrast, and to a physics reader "harmonic" already means a spring; "framed versus elastic" says what actually differs.

## 1. The problem: a pattern is a list of events, not a picture

A SCOT pattern says *what happens*, in order, and nothing about *where*:

```text
color: CBAAAABC

1 1>2,3,4
2 8>7,6,5,4
```

Row 1 means "the cord in lane 1 passes through the cords in lanes 2, 3 and 4, one after another". The simulator expands this into **split events**. One event is one cord (the **splitter**) passing through the plies of another cord (the **splittee**) at a particular gap between two lanes. After the split, the two cords have swapped lanes. For the pattern above the simulator produces seven events:

| Event | Splitter | Splittee | Gap |
| ---: | --- | --- | --- |
| 0 | C01 | C02 | between lanes 1 and 2 |
| 1 | C01 | C03 | 2 and 3 |
| 2 | C01 | C04 | 3 and 4 |
| 3 | C08 | C07 | 7 and 8 |
| 4 | C08 | C06 | 6 and 7 |
| 5 | C08 | C05 | 5 and 6 |
| 6 | C08 | C01 | 4 and 5 |

That is all the information there is. There are no coordinates, no lengths, no angles. Yet a real braid made from this pattern has a definite shape: a strip of a certain width, cords crossing at a certain angle, loops at the two edges where cords turn back, and a coloured surface. The Cord network view has to *compute* that shape from the event list alone.

Two things make this harder than filling in a grid:

- **Cords are continuous.** Cord C01 above takes part in events 0, 1, 2 and 6. Whatever we draw, C01 must be one unbroken line passing through those four places in that order. A picture that colours cells independently can break this without noticing.
- **The fabric is not a grid.** In a regular section the cords do form a neat diamond lattice, but wherever the pattern changes direction the cells are not four-sided. The audited block of the 20-cord Eyes pattern has 154 enclosed regions: 2 two-sided ones, 16 triangles, 132 four-sided and 4 five-sided ([framed/README.md](framed/README.md)). A grid has no place to put a triangle.

## 2. Why a network of springs

### 2.1 Turn the events into a network

The first step is the same in all three models. Build a **graph**:

- one **junction node** for every split event, where the two cords meet;
- one **start node** and one **end node** for every cord, for the loose tails;
- one **edge** for every stretch of cord between two consecutive places that cord visits.

Cord C01 visits `start → event 0 → event 1 → event 2 → event 6 → end`, so it contributes five edges. Every other cord in the example visits one event. Altogether the chevron graph has 23 nodes and 22 edges. The 20-cord Eyes block audited in [framed/README.md](framed/README.md) had 173 events, giving 213 nodes and 366 edges.

Once the graph exists, the question "what does the braid look like?" becomes "where should each node go?" That is a *graph drawing* problem, and the edges being real pieces of cord tells us what a good drawing is: one where every edge has a sensible length, cords do not kink, cords do not pass through each other, and the crossings look like real ply-split crossings.

### 2.2 Let physics choose the positions

Real cords settle into the shape that costs the least energy. A cord that is stretched pulls back; a bent cord wants to straighten; two cords cannot occupy the same space. So the natural thing to do is:

1. write down an **energy** `E(positions)` that is low for drawings with the properties above and high for drawings without them;
2. find the positions that make `E` as small as possible.

This is the whole strategy. All three models do exactly this; they differ in *which* energy and *how* they minimise it. (The packed model's energy is not made of springs, but it is still an energy minimised the same way; see §4.5.) The idea is not new: [CrochetPARADE](https://github.com/stassev/CrochetPARADE) lays out crochet this way, and Gray, Bell and Kobourov ([arXiv:2406.13800](https://arxiv.org/abs/2406.13800)) do the same for knitting. Ply-split braiding is another textile whose structure is a list of local interactions, so the same approach fits.

### 2.3 The physics you need

A spring of natural length `r₀` and stiffness `k`, stretched or squashed to length `r`, stores energy

```text
E = ½ k (r − r₀)²
```

and pulls its two ends toward each other (or pushes them apart) with force `k (r − r₀)`. Force is minus the slope of the energy: `F = −dE/dr`. In two dimensions, with node positions `x_i`, the force on node `i` is minus the gradient `−∂E/∂x_i`, a vector pointing "downhill" in energy.

Two consequences carry the whole document:

- **Equilibrium is a minimum of energy.** A node is at rest when the forces on it cancel, which is where the energy has zero slope in every direction.
- **A network of springs is just a sum.** The total energy is the sum of the energies of every spring, and the force on a node is the sum of the forces from every spring attached to it.

Everything below is a specific choice of springs and a specific way of finding where the forces cancel.

### 2.4 Why two models

The framed model came first. It is linear, has exactly one answer, is cheap, and has a mathematical guarantee that the drawing will not fold over itself. Those are good properties for a first attempt, and it is still in the app as the comparison baseline.

But it needs a frame to hold the fabric open, and the frame dictates the width and the overall shape. The braid should get its width from how many cords it has and how thick they are, its edge loops from the cords turning, and its "eye" motifs from the crossings; none of that should be imposed from outside. The elastic model was built to let those things emerge. It is the default view today.

## 3. The framed model

### 3.1 The rule in one sentence

**Every free node sits at the average position of its neighbours.**

If node `i` is joined by edges to nodes `j₁, j₂, …`, then

```text
x_i = ( x_j₁ + x_j₂ + … ) / (number of neighbours)
```

and the same for `y`. A function whose value at each point equals the average of its surroundings is called a **harmonic function** in mathematics, so this step is a *harmonic embedding*; the app used to call the whole model "harmonic" after it. Steady temperature in a metal plate obeys the same rule (each interior point is at the average temperature of its surroundings), and so does voltage in a network of equal resistors and the height of a soap film stretched on a wire loop. Physicists will also recognise the word from the harmonic oscillator, and that is not a coincidence, as the next section shows.

### 3.2 It is a spring network with zero natural length

Give every edge a spring of stiffness 1 and natural length **zero**, so its energy is just `½ |x_i − x_j|²`. The total energy of the network is

```text
E = ½ Σ_edges |x_i − x_j|²
```

The force on node `i` is the sum over its neighbours of `(x_j − x_i)`. Setting it to zero:

```text
Σ_j (x_j − x_i) = 0    ⇒    x_i = (Σ_j x_j) / (number of neighbours)
```

which is exactly the averaging rule. So "solve the harmonic embedding" and "let a network of zero-length springs relax" are the same problem: the framed model is a spring network too, and the two models differ in what their springs want, not in whether there are springs. A worked example: a free node joined to three fixed nodes at `(0, 0)`, `(2, 0)` and `(1, 3)` sits at `((0+2+1)/3, (0+0+3)/3) = (1, 1)`.

### 3.3 Why a frame is needed

Zero-length springs have one obvious flaw: if nothing is held still, every spring wants length zero and the whole network collapses to a single point. The model therefore **pins** some nodes and only lets the rest move. In [`buildFramedNetwork`](../src/domain/framedNetwork.ts) the pinned nodes are:

- every cord's start node, on a horizontal line at the top, in initial lane order;
- every cord's end node, on a line at the bottom, in final lane order;
- every junction at the two outermost gaps (the selvedges), on a vertical line at the left or right, spaced evenly in the order they occurred.

Together these form a rectangle: the **frame** that gives the model its name. Its height is set by the number of events per lane gap, scaled by the "Length / width" slider (`elongation`, default 1.35); its width is the number of cords plus a margin. Interior junctions are free and get averaged into it.

### 3.4 Why this was a good first model

- **One answer, found exactly.** The averaging rule is a system of linear equations, one per free node, with the pinned positions as the known right-hand side. The `x` and `y` coordinates do not interact, so it is two independent solves. The code uses conjugate gradient, a standard iterative method for large sparse systems, and stops when the residual is below `10⁻⁹`. There is no random start, no schedule, and running it twice gives the same drawing.
- **It cannot fold.** Tutte's spring theorem (1963) says: if a planar network is pinned to a convex outline and every interior edge is a positive-stiffness spring, then the equilibrium drawing has no crossing edges. The rectangle is convex, so the drawing is guaranteed crossing-free at the node level. (The strict theorem needs a triangulated, 3-connected graph; the implementation pins a rectangle and then checks for crossings afterwards rather than relying on the theorem blindly.)
- **It is cheap.** Each iteration is one pass over the edge list.

### 3.5 What it gets wrong, and the patch

The energy `½ Σ |x_i − x_j|²` only says "be short". It has no idea how long a piece of cord *should* be, no objection to a sharp kink, and no notion of cord thickness. In practice:

- cells in the transition rows of Eyes come out tiny, because nothing stops neighbouring junctions from bunching up;
- the width is fixed by the cord count, not by the physics;
- the frame's straight sides and evenly spaced selvedge junctions are guesses that get baked into the result.

The implementation adds a **spacing relaxation** (`relaxSpacing`) after the harmonic solve to reduce the first problem: every junction-to-junction edge becomes an ordinary spring with a real rest length (`√(1 + elongation²)`, the diagonal of one lattice cell in lane units) and the nodes take up to 80 small downhill steps. Each step is checked first: a move is rejected if it would flip or nearly flatten any of the angular sectors around a node, so the crossing-free property of the seed survives. This is a patch, not a physical model, and the UI note says as much: "junctions are averaged into a fixed strip frame, then spaced".

### 3.6 The framed model in one picture

A fishing net stretched over a rectangular frame. Pull the frame open and every knot settles to the average of its neighbours. The net can never tangle, but the frame decides the shape, and the mesh gets squeezed wherever the knots are dense.

## 4. The elastic model

### 4.1 The idea

Give every spring a **real** natural length and add the extra springs a mesh needs to hold its shape, then remove the frame entirely and let the fabric find its own width. The result is a minimum of a physical energy rather than an average inside a box.

That is what *elastic* means here: the material has a shape it wants to return to, which a zero-length spring never has. Natural length, crossing angle, thickness and a ban on folding are all elastic properties, and they are exactly what the framed model lacks.

The whole model is expressed in units of the cord diameter, `d = 1`. Colours, faces and source row numbers never enter it; they only affect how the finished drawing is painted.

### 4.2 The geometry of one crossing

In a regular section of ply-split fabric there are two families of cords, running at `+θ` and `−θ` to the length of the braid, so cords cross at angle `2θ`. The default "Length / width" slider value 1.35 is `cot θ`, which gives `θ ≈ 36.5°` and a crossing angle of about `73°`.

```text
   a⁻      b⁻        two cords arrive at a junction J,
     \    /          cross at angle 2θ,
      \  /           and leave through the other two ports.
       J             Port order around J: a-in, b-in, a-out, b-out.
      /  \
     /    \
   b⁺      a⁺
```

If the cords of one family lie side by side, touching, they are `d` apart measured perpendicular to themselves. A cord of the other family crosses them at angle `2θ`, so walking along it the crossings are

```text
ℓ = d / sin 2θ  ≈ 1.05          the pitch
```

apart. That is the natural length of a cord segment between two consecutive splits. Four such segments around a junction form a rhombus:

```text
        ●
       / \        side              = ℓ
      /   \       lateral diagonal  = 2ℓ sin θ ≈ 1.24
     ●     ●      axial diagonal    = 2ℓ cos θ ≈ 1.68
      \   /       axial / lateral   = cot θ    = 1.35
       \ /
        ●
```

So once `θ` is fixed, everything about the ideal cell follows. The energy terms below simply ask every piece of the network to look like this where it can.

### 4.3 The springs

Each term is a sum of ordinary springs, `E = ½ w (r − r₀)²`, over some set of node pairs. What changes is which pairs, what natural length and what weight.

**Cord springs.** Every edge of the graph is a spring at the pitch length `ℓ`. To give the middle of each segment something to push against, one extra **midpoint node** is inserted in every junction-to-junction edge, so the segment is two springs of rest `ℓ/2`. The loose tails to the start and end nodes get rest `1.5ℓ` and weight 0.25, because they are not fabric.

One exception matters. When a cord is split at an outer gap and its *next* split is at the same outer gap, the cord has reached the edge of the braid and turned back. In the rhombus lattice those two junctions are `2ℓ cos θ` apart, not `ℓ`, and the cord between them is a loop, longer than the straight line. That segment gets rest length `1.2 × 2ℓ cos θ ≈ 2.0`. Getting this wrong was one of the three corrections the experiment forced: with rest `ℓ` every selvedge was pulled together and the whole interior sheared wide to compensate ([elastic/findings.md §2.2](elastic/findings.md)).

**Straightness springs.** A cord should not kink at a split. For every three consecutive nodes `p, j, n` along one cord, add a weak spring (weight 0.1) directly from `p` to `n` with rest length equal to `|pj| + |jn|`. The only way `p` and `n` can be that far apart is if `j` lies on the straight line between them, so this spring is satisfied exactly when the cord is straight and pulls it straight otherwise. It is skipped wherever the cord genuinely reverses direction: at selvedge turns and at the interior reversals in transition rows.

**Crossing-angle springs.** Four equal springs around a junction make a rhombus, and a rhombus with fixed side lengths still has one free angle: it can shear flat without stretching anything. Something has to hold `2θ`. At every junction, add a spring (weight 0.5) between the two "in" neighbours and another between the two "out" neighbours. Two segments of lengths `ℓ_a` and `ℓ_b` meeting at angle `2θ` have far ends

```text
r₀ = √( ℓ_a² + ℓ_b² − 2 ℓ_a ℓ_b cos 2θ )       (law of cosines)
```

apart, so that is the rest length. Because these springs attach to a junction's immediate neighbours rather than to the cells around it, they work unchanged at the triangles, two-sided cells and pentagons that a grid could not handle.

**Repulsion.** Springs cannot stop two cords from passing through each other, and cannot keep the two sides of a two-sided cell apart. Add a spring of rest `d_min = 0.9` between any two nodes that come closer than `d_min`, provided they are not already joined by an edge and are not the four ports of one junction (where two cords really do overlap). The spring only exists while the pair is too close, so it is a pure push. In healthy fabric nearest nodes are about `d` apart and this term is idle; it acts only at collapsing cells and folds. A grid of cells the size of `d_min` finds the candidate pairs cheaply.

**Orientation penalty.** Every term so far depends on distances only, and a mirror image of a drawing has all the same distances. So the energy cannot tell a junction whose four ports go round anticlockwise from one that goes round clockwise. A mirror image of the *whole* drawing is harmless: it is the back of the braid, and the model picks one side at the end. A mirror image of *one* junction inside unmirrored neighbours is a **fold**, which real cords cannot do but springs happily allow. At every junction, for each pair of consecutive ports, compute the signed area of the little triangle they make with the junction (a 2D cross product). If any of the four areas drops below 0.05, a penalty spring pushes it back up.

**Scaffold springs.** The terms above describe the finished fabric, but a network of short springs relaxes only *locally*: two parts of the strip that should be far apart feel no pull from each other. CrochetPARADE's answer is to add a weak spring between every pair of junctions, with rest length equal to their **graph distance** (the shortest walk along cord segments, computed by Dijkstra's algorithm) and weight `α / δ²`, weaker for distant pairs. This pulls the whole network open, like flattening a crumpled map by pulling on distant points at once.

The scaffold must not survive to the end. Walking along the edges of a square from one corner to the opposite one covers 2 sides, but the straight-line distance is `√2` sides; graph distance overestimates real distance by up to 40 %, and a permanent scaffold would swell the fabric to match. So its strength is **annealed**: `α = √(1 − t/T) + 0.001` at step `t` of `T`, going from 1 at the start to nearly 0 at the end. The app also only creates scaffold springs between nodes within graph distance 8, because the starting layout is already unfolded and a local scaffold is 2.8× faster with fewer topology errors.

The total energy is the sum:

```text
E(x, t) = E_cord + E_straight + E_cross + E_repulsion + E_orientation + α(t) · E_scaffold
```

Only the last term depends on the step counter.

### 4.4 The starting layout

Minimising a non-linear energy needs a starting guess, and a good one matters. The model starts from the **wiring diagram**: every junction is placed across the strip at the gap where it happened and along the strip in the order it happened, with terminals just beyond each end. This is a valid drawing of the exchange sequence with no crossings, so it already has the right topology and the right handedness; the solve only has to reshape it. Random starts were tried in the experiments: half of them unfold onto the same layout as the wiring seed, half fold irrecoverably ([elastic/findings.md §4](elastic/findings.md)). Random starts remain a test, not the production path.

### 4.5 The solver, in two acts

**Act 1: unfold.** With the scaffold switched on, take 200 steps of **gradient descent**:

```text
x_i ← x_i − η ∇_i E          η = 0.1
```

Each node moves a small distance straight downhill. Halfway through, the model counts how many junctions are oriented each way and mirrors the whole drawing if the majority is clockwise; from then on the orientation penalty is active. If any coordinate blows up (exceeds `10⁵` or becomes NaN), the step size is divided by 3 and the attempt restarts from the seed, at most 11 times.

**Act 2: settle.** Switch the scaffold off, rescale the drawing so the mean edge length equals the mean rest length, and then run **damped dynamics** rather than gradient descent:

```text
m dv/dt = F − γ v            m = 1, γ = 0.1, time step 0.1
```

Every node has unit mass, feels the spring forces, and is slowed by a weak drag. This runs for up to 3000 steps and stops as soon as the largest force on any node is below `2 × 10⁻³`. Then the drawing is moved to the origin, rotated so its long axis is vertical, flipped so the cords start at the top, and mirrored if needed so the majority of junctions are anticlockwise.

Why momentum? Gradient descent is a ball rolling in honey: each step is proportional to the slope, so in a long, shallow valley it crawls. The energy of a strip has exactly such a valley: a **global shear**, where every cell tilts a little, changes the energy very slowly and gradient descent needs a number of steps that grows with the square of the strip length to relax it. Worse, the scaffold prefers a square lattice (both diagonals equal) and leaves the fabric sheared toward `90°`. With CrochetPARADE's ten over-damped polish steps the Eyes lattice stuck at a crossing angle of `89.7°`. With 3000 under-damped steps it reached `79.4°`, the gradient went to zero, and 6000 steps gave the identical answer ([elastic/findings.md §2.1](elastic/findings.md)). A ball with a little friction rolls along the valley floor and stops at the bottom.

### 4.6 What comes out

Node positions become the drawing directly: each cord is drawn as a smooth curve through its junctions and midpoints, and at each junction the splittee's colour is painted over the splitter, because the splittee's plies pass in front of and behind the splitter. The same two checks run on every model's output afterwards: sampled curve crossings (`findCurveCrossings`) and port order at every junction (`portConflicts`). A layout that fails either is reported as unresolved, with the offending junctions listed; nothing is ever fixed by moving one event by hand.

With the default profile, the 8-cord chevron settles to a crossing angle of `72.0° ± 0.5°` with negligible strain. One block of Eyes comes out at `78.5° ± 16.4°`, with the spread concentrated in the transition rows, where the pattern's direction changes leave a lattice defect that a flat spring sheet cannot fully absorb. The full Eyes motif, a nested eye in the centre and half eyes at each edge, emerges from colours and connectivity alone, and over three blocks the eyes alternate between the centre and side-by-side pairs, which is what the photograph shows.

### 4.5 The packed model, in short

The elastic model has to be told a segment's length, a selvedge loop's length and a crossing's preferred angle. The **packed** model asks what is left if none of them is given. A cord keeps only two properties: a width of one diameter that cannot be compressed and cannot overlap another cord, and a constant pull along its length, which makes it as short and as straight as its neighbours allow. Pressing the fabric compact needs no term of its own, because in a threaded network it is the same thing as pulling every cord tight.

The pitch is then a result rather than a parameter, and it comes out at `d / sin φ` for the realised crossing angle `φ`, within 0.2 % — which is the value §4.2 assumes. The selvedge loop shapes itself, with no `ℓ_turn`. On Eyes the model removes every topology conflict its elastic seed arrives with, because tubes that cannot pass through each other cannot fold.

One thing cannot emerge. Both packing and tension prefer a square lattice, and in between lies a whole family of packed configurations, one per angle, all with the cords straight and touching: the lattice is a scissor mechanism, and with nothing else the strip is floppy. The packed model selects a member of that family with the **working pull** the maker keeps on the braid, `f / T = cos 2θ / cos³ θ`, which is its only dial. A real strip is stiffer in shear than an infinite sheet because of its selvedges, so the same pull gives 82° on eight cords and 75° on twenty-four, and a patterned fabric such as Eyes adds a bias of its own.

It is much slower than the spring models — contact has to be checked between the cords themselves, not at a few nodes — so the app offers it only for previews under 300 splits. [packed/findings.md](packed/findings.md) has the measurements.

### 4.7 The elastic model in one picture

A mesh of real springs lying on a table with no frame. It finds its own width, bulges into loops where cords turn at the edges, and settles into a diamond lattice wherever the pattern lets it. Shake it a little at the end so it does not get stuck part-way down.

## 5. Side by side

The packed model's column is the short version of §4.5; [packed/README.md](packed/README.md) §9 has the full comparison.

| | Framed | Elastic | Packed |
| --- | --- | --- | --- |
| Technical name | harmonic (Tutte) embedding, then spacing | rest-length spring network, force-directed and annealed | taut inextensible tubes with contact, under a working pull |
| What the cords are | springs of zero natural length | springs at a natural length, plus straightness, angle, repulsion, orientation | tubes one diameter thick that cannot overlap, pulled tight |
| What holds it open | a pinned rectangular frame | nothing; the rest lengths and crossing angle do | nothing but contact between the cords |
| Length between splits | whatever the frame leaves | assumed, `d / sin 2θ` | computed; comes out at `d / sin φ` |
| Width of the strip | set by the cord count | emerges from `ℓ`, `θ` and the cord count | emerges from contact alone |
| Edge loops | pinned to a straight line | emerge from the turn rest length | emerge from tension and the bend limit |
| Crossing angle | from the frame | a spring at every junction | one global pull, `f / T = cos 2θ / cos³ θ` |
| Energy | quadratic (linear equations) | non-linear | non-linear, with one-sided contact terms |
| Number of answers | exactly one | one per energy minimum; the path chooses | one per pull; with no pull the strip is floppy |
| Solver | conjugate gradient, then 80 spacing steps | 200 gradient steps with an annealed scaffold, then up to 3000 damped-dynamics steps | damped dynamics from the elastic layout, to a step cap or a time budget |
| Crossing-free? | guaranteed at the node level (Tutte) | checked afterwards; folds are penalised, not forbidden | contact forbids it; still checked afterwards |
| Cost per step | one pass over the edges | one pass over edges plus scaffold pairs within radius 8 | one pass over contact pairs between cord pieces |
| Time for one block of Eyes (190 events, Node, measured 2026-09-19; packed 2026-09-23) | ≈ 0.06 s | ≈ 0.4 s, streamed to the view as it settles | ≈ 8 s, streamed; offered below 300 splits |
| Role in the app | comparison baseline | default | experimental, short previews only |

## 6. What none of them is

- **Not a material simulation.** There is no twist and no friction in any of them. The framed and elastic models also have no tension from the maker's hands and no bending stiffness beyond the straightness spring, and their pitch `ℓ`, angle `θ` and turn length are packing idealisations rather than measurements. The packed model removes those idealisations and adds the maker's pull, but it still has no friction — which is exactly why it needs that pull to choose an angle at all (§4.5).
- **Flat.** All three models live in two dimensions. Real fabric can spend strain in the third dimension; the wide junctions in the Eyes transition rows are probably where the real braid puckers. A 3D extension is sketched in [elastic/README.md §8](elastic/README.md) but not built.
- **Colour-blind.** Colours, faces and row numbers never enter any of these energies. The motif has to come from the structure. That is deliberate: a removal experiment showed that dropping three rows of Eyes changes 35 later pairings without changing a single visible colour, so colour alone cannot be the model ([framed/README.md](framed/README.md)).
- **Not validated against a photograph yet.** The elastic model produces the Eyes motif qualitatively, and the packed model turns several of these questions into numbers — a pitch, a strip width, a cord take-up, a digon lens, and how far the braid relaxes when the pull comes off. Whether any of them match the real braid is a measurement still to be made.

## 7. Symbols

| Symbol | Meaning | Default |
| --- | --- | ---: |
| `d` | cord diameter, the unit of length in the elastic model | 1 |
| `θ` | half the crossing angle; cords run at `±θ` to the braid axis | `≈ 36.5°` from the slider value `cot θ = 1.35` |
| `ℓ` | pitch: natural length of a cord segment between consecutive splits, `d / sin 2θ` | `≈ 1.05` |
| `ℓ_turn` | natural length of a selvedge turn, `1.2 × 2ℓ cos θ` | `≈ 2.0` |
| `d_min` | distance below which repulsion acts | 0.9 |
| `w` | spring weight (stiffness) | 1 cord, 0.1 straightness, 0.5 crossing, 1 repulsion, 1 orientation, 0.25 tails |
| `δ_ij` | graph distance between nodes `i` and `j` | computed |
| `α(t)` | scaffold strength at step `t` of `T`, `√(1 − t/T) + 0.001` | from 1 to 0.001 |
| `η` | gradient-descent step size | 0.1 |
| `γ` | drag coefficient in the settling dynamics | 0.1 |
| `T` | unfolding steps | 200 |
| `x_i` | position of node `i`, a 2D vector | |
| `r_ij` | distance between nodes `i` and `j` | |
