# Physics behind the harmonic seed

Companion to [Proposed system](system.md) §3 and its implementation, [`harmonicSolve`](../../src/domain/cordNetwork.ts). This covers only the linear seed step — the "positive-weight harmonic embedding" used to produce a guaranteed-planar starting layout before the nonlinear fit in system.md §4. It is not a physical material model; treat it as a topology-safe initialiser, per system.md:119.

## 1. What "harmonic" means here

A function defined on graph vertices is discrete harmonic at a vertex if that vertex's value equals the weighted average of its neighbours' values:

```text
x_i = ( Σ_j w_ij x_j ) / ( Σ_j w_ij )     for every free vertex i
```

This is the discrete form of Laplace's equation, `∇²φ = 0`. The same equation describes several unrelated-looking physical equilibria once boundary values are fixed:

- Steady-state temperature in a plate, with fixed temperatures on the boundary — each interior point settles to the average of its surroundings.
- Electric potential in a resistor network, with fixed voltages at boundary terminals — Kirchhoff's current law at every interior node reduces to the same averaging condition, with `w_ij` as edge conductance.
- The shape of a soap film or stretched membrane held on a fixed wire boundary.

The junction/terminal graph from system.md §2 plays the role of this network: terminals and the outer frame are the fixed boundary, junctions are free interior nodes, and cord segments are edges.

## 2. Harmonic embedding as a zero-rest-length spring network

Give every edge a linear (Hookean) spring with stiffness `w_ij` and **zero natural length**. Total elastic energy:

```text
E(x) = ½ Σ_(i,j)∈E  w_ij |x_i − x_j|²
```

This is the same quantity `harmonicSolve` minimises (the Dirichlet energy). At mechanical equilibrium the net spring force on every free node is zero:

```text
Σ_j w_ij (x_j − x_i) = 0
```

— which rearranges to exactly the averaging condition in §1. So solving the harmonic embedding and letting this zero-rest-length spring network relax to equilibrium with the boundary pinned are the same problem. `harmonicSolve` does not simulate that relaxation over time (slow, and only conditionally stable); it solves the linear system directly.

## 3. Why a convex fixed boundary is required

Tutte's spring theorem (Tutte, *How to Draw a Graph*, 1963): for a 3-connected planar graph, if the boundary vertices are fixed to a strictly convex polygon and every interior edge has positive weight, the equilibrium embedding has no self-intersections — every internal face lands as a valid, non-degenerate polygon.

This is why system.md §3 step 5 requires "the outer frame fixed on a strictly convex outline" before solving — that phrase is the exact hypothesis of the guarantee, not an arbitrary layout choice. It is also why the seed procedure (system.md §3 step 2) attaches a temporary convex frame before solving, then relaxes the frame toward the real strip shape afterward (step 6): the convexity is only needed at solve time, to get a crossing-free starting point.

The guarantee is purely topological. It says nothing about physical plausibility — real cord spacing, thickness, or curvature — which is why system.md calls this step an initialisation only, feeding into the constrained energy fit described in [the earlier discussion of §4](system.md#4-fit-packed-cord-geometry-globally).

## 4. What the harmonic energy deliberately leaves out

`Σ w_ij |x_i − x_j|²` penalises squared Euclidean distance between adjacent nodes, nothing else:

- **No preferred length.** Minimised alone, with no pinned boundary, it collapses every node to one point. Pinning the boundary is what keeps the network spread out.
- **No bending stiffness.** Three collinear points and three sharply bent points cost the same energy if the endpoint-to-endpoint span matches — there is no `∫κ² ds` term. That term is added only in the nonlinear stage (`wBend` in system.md §4).
- **No thickness or collision.** Cords have zero width in this model. Freedom from crossings comes entirely from Tutte's combinatorial guarantee, not from any finite-diameter clearance check. Real diameter constraints are enforced afterward, by `findCurveCrossings` and the hard constraints in system.md §4.

Every one of these gaps is filled by a later, non-linear step. The harmonic solve's only job is to hand that step a starting layout that is already crossing-free.

## 5. How the code solves it

[`harmonicSolve`](../../src/domain/cordNetwork.ts) assembles nothing but a matrix-vector product (`multiply`) representing `L x`, where `L` is the graph Laplacian restricted to free vertices: its diagonal is vertex degree, its off-diagonal action is "subtract each neighbour's current value." It solves `L x = b` — one solve for the x-coordinates, one for y, since the energy has no cross term between coordinates and so separates exactly — using Jacobi-preconditioned conjugate gradient (the `z = r / degree` step is the Jacobi/diagonal preconditioner). This avoids ever building a dense matrix: each CG iteration costs one pass over the edge list, and convergence for a mesh this size and this well-conditioned is fast relative to the vertex count.

## Further reading

- Tutte, *How to Draw a Graph*, Proc. London Math. Soc., 1963 — the convex-boundary planarity guarantee used in §3.
- Doyle & Snell, *Random Walks and Electric Networks* — the harmonic-function/electrical-network correspondence used as intuition in §1, developed from first principles.
- Strang, *Introduction to Applied Mathematics* — the shared derivation of the Laplace equation from spring networks, resistor networks, and membranes; useful for seeing why the three physical pictures in §1 are the same equation.
- Shewchuk, *An Introduction to the Conjugate Gradient Method Without the Agonizing Pain* — the solver `harmonicSolve` implements, including why Jacobi preconditioning helps.
- Crane, *Discrete Differential Geometry: An Applied Introduction* (course notes) — discrete Laplacians and harmonic maps on meshes, in the same notation family as this document.
