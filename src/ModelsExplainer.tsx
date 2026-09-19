import { AnnealFigure, AverageFigure, EventGraphFigure, HarmonicSolveFigure, RhombusFigure, SpringEnergyFigure, SpringSolveFigure, ValleyFigure, termIcons } from './ModelsExplainerFigures';
import './modelsExplainer.css';

const contents = [
  ['problem', 'The problem'],
  ['why-springs', 'Why springs'],
  ['harmonic', 'The harmonic model'],
  ['springs', 'The spring model'],
  ['side-by-side', 'Side by side'],
  ['limits', 'What neither model is'],
  ['symbols', 'Symbols'],
] as const;

const terms = [
  { key: 'cord', name: 'Cord springs', formula: 'E = ½ Σ (r − ℓ)²', text: 'Every edge is a spring at the pitch length ℓ. A midpoint node is inserted in each junction-to-junction edge so the middle of a segment has something to push against. Loose tails to the start and end nodes get rest 1.5ℓ and weight 0.25. A segment where a cord turns back at the edge of the braid gets rest 1.2 × 2ℓ cos θ ≈ 2.0 instead: in the lattice those two junctions sit a full cell apart, and the cord between them is a loop.' },
  { key: 'straight', name: 'Straightness springs', formula: 'rest = |pj| + |jn|, weight 0.1', text: 'For every three consecutive nodes p, j, n along one cord, a weak spring from p straight to n. The only way p and n can be that far apart is if j lies on the line between them, so the spring is slack exactly when the cord is straight. Skipped where a cord genuinely reverses: selvedge turns and the interior reversals in transition rows.' },
  { key: 'cross', name: 'Crossing-angle springs', formula: 'rest = √(ℓ_a² + ℓ_b² − 2ℓ_aℓ_b cos 2θ), weight 0.5', text: 'A rhombus of four equal springs shears without stretching anything, so something must hold the angle. At every junction, one spring between the two in-neighbours and one between the two out-neighbours, at the length the law of cosines gives for two segments meeting at 2θ. Because they attach to neighbours rather than to cells, they work unchanged at triangles, two-sided cells and pentagons.' },
  { key: 'repel', name: 'Repulsion', formula: 'rest = d_min = 0.9, only while r < d_min', text: 'Springs cannot stop two cords passing through each other. Any two nodes closer than 0.9 diameters get a pushing spring, unless they already share an edge or are the four ports of one junction, where two cords really do overlap. In healthy fabric nearest nodes are about one diameter apart and this term is idle; it acts at collapsing cells and folds.' },
  { key: 'orient', name: 'Orientation penalty', formula: 'signed sector area ≥ 0.05, weight 1', text: 'Every other term depends on distances only, and a mirror image has all the same distances. A mirror of the whole drawing is just the back of the braid. A mirror of one junction inside unmirrored neighbours is a fold, which real cords cannot do. At each junction the four consecutive port pairs must go round anticlockwise; a sector whose signed area drops below 0.05 is pushed back open.' },
  { key: 'scaffold', name: 'Scaffold springs', formula: 'rest = graph distance δ, weight α(t) / δ²', text: 'Short springs relax only locally; two parts of the strip that should be far apart feel no pull. Following CrochetPARADE, every pair of junctions within graph distance 8 gets a weak spring at that graph distance. This pulls the whole network open, like flattening a crumpled map by pulling on distant points at once. It is annealed away because graph distance overestimates straight-line distance by up to √2.' },
];

export default function ModelsExplainer() {
  return <main className="mx-page">
    <header className="mx-header">
      <a className="mx-back" href="#/" aria-label="Back to SCOT Braid Studio">←</a>
      <div className="mx-title">
        <p className="mx-kicker">SCOT Braid Studio · the physics behind the Cord network view</p>
        <h1>How the harmonic and spring models work</h1>
      </div>
      <p className="mx-header-note">For anyone with first-year maths and physics. Every figure marked <em>interactive</em> is live, and the two chevron figures run the app's real solvers.</p>
    </header>

    <div className="mx-sheet">
      <nav className="mx-toc" aria-label="Contents">
        <p className="mx-kicker">Contents</p>
        <ol>{contents.map(([id, label], i) => <li key={id}><a href={`#/models#${id}`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><span>{String(i + 1).padStart(2, '0')}</span>{label}</a></li>)}</ol>
        <p className="mx-toc-note">Deeper reading lives in the repository: <code>docs/cord-network-models-explained.md</code>, <code>docs/harmonic</code> and <code>docs/spring</code>.</p>
      </nav>

      <article className="mx-article">
        <p className="mx-lede">A SCOT pattern says <em>what happens</em>, in order, and nothing about <em>where</em>. The Cord network view has to compute the shape of the finished braid from that list alone. Both of its models do it the same way: turn the splits into a network, write down an energy that is low for good drawings, and find the drawing with the least energy. They differ in which energy, and in how they go looking for the minimum.</p>

        <section id="problem" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">01</span><h2>The problem: a pattern is a list of events, not a picture</h2></header>
          <p>Row <code>1 1&gt;2,3,4</code> means "the cord in lane 1 passes through the cords in lanes 2, 3 and 4, one after another". The simulator expands it into <strong>split events</strong>: one cord, the <em>splitter</em>, passes through the plies of another, the <em>splittee</em>, at a particular gap between two lanes, and afterwards the two have swapped lanes. For the eight-cord chevron that is seven events per block.</p>
          <table className="mx-table mx-table--compact">
            <thead><tr><th>Event</th><th>Splitter</th><th>Splittee</th><th>Gap</th></tr></thead>
            <tbody>
              {[['0', 'C01', 'C02', '1 · 2'], ['1', 'C01', 'C03', '2 · 3'], ['2', 'C01', 'C04', '3 · 4'], ['3', 'C08', 'C07', '7 · 8'], ['4', 'C08', 'C06', '6 · 7'], ['5', 'C08', 'C05', '5 · 6'], ['6', 'C08', 'C01', '4 · 5']].map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}
            </tbody>
          </table>
          <p>That is all the information there is: no coordinates, no lengths, no angles. Yet the real braid has a definite shape, and two things make computing it harder than filling in a grid.</p>
          <ul>
            <li><strong>Cords are continuous.</strong> Cord C01 takes part in events 0, 1, 2 and 6. Whatever is drawn, it must be one unbroken line through those four places in that order. A picture that colours cells independently can break this without noticing.</li>
            <li><strong>The fabric is not a grid.</strong> In a regular section the cords form a neat diamond lattice, but wherever the pattern changes direction the cells are not four-sided. The audited block of the 20-cord Eyes pattern has 154 enclosed regions: 2 two-sided, 16 triangles, 132 four-sided and 4 five-sided. A grid has no place to put a triangle.</li>
          </ul>
          <p>So the first step in both models is to build a <strong>graph</strong>: one node per split, a start and an end node per cord, and one edge for every stretch of cord between two consecutive places that cord visits. The question "what does the braid look like?" becomes "where should each node go?"</p>
          <EventGraphFigure />
        </section>

        <section id="why-springs" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">02</span><h2>Why a network of springs</h2></header>
          <p>Real cords settle into the shape that costs the least energy. A stretched cord pulls back, a bent cord wants to straighten, and two cords cannot occupy the same space. So: write down an energy <code>E(positions)</code> that is low for drawings with those properties, and find the positions that make it smallest. <a href="https://github.com/stassev/CrochetPARADE" target="_blank" rel="noreferrer">CrochetPARADE</a> lays out crochet this way and Gray, Bell and Kobourov do the same for knitting; ply-split braiding is another textile whose structure is a list of local interactions.</p>
          <p>The physics needed is one spring. Stretched or squashed from its natural length <code>r₀</code> to length <code>r</code>, a spring of stiffness <code>k</code> stores</p>
          <pre className="mx-math">E = ½ k (r − r₀)²</pre>
          <p>and pulls its ends back with force <code>k (r − r₀)</code>. Force is minus the slope of the energy. Two consequences carry everything that follows: a node is at rest where the forces on it cancel, which is where the energy has zero slope in every direction; and the energy of a network is simply the sum over its springs, so the force on a node is the sum of the forces from every spring attached to it.</p>
          <SpringEnergyFigure />
          <p>The harmonic model came first. It is linear, has exactly one answer, is cheap, and has a mathematical guarantee that the drawing will not fold. But it needs a frame to hold the fabric open, and the frame dictates the width and overall shape. The spring model was built so that width, edge loops and the eye motifs could emerge from the cords themselves. It is the default view today; the harmonic model stays as the comparison.</p>
        </section>

        <section id="harmonic" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">03</span><h2>The harmonic model</h2></header>
          <p className="mx-rule">Every free node sits at the average position of its neighbours.</p>
          <p>If node <code>i</code> is joined to nodes <code>j₁, j₂, …</code>, then <code>x_i = (x_j₁ + x_j₂ + …) / (number of neighbours)</code>, and the same for <code>y</code>. A function whose value at each point equals the average of its surroundings is called a <strong>harmonic function</strong>; that is where the model's name comes from. Steady temperature in a metal plate obeys the same rule, and so does the voltage in a network of equal resistors and the height of a soap film on a wire loop.</p>
          <p>It is also a spring network. Give every edge a spring of stiffness 1 and natural length <em>zero</em>, so its energy is <code>½ |x_i − x_j|²</code>. The force on node <code>i</code> is the sum over its neighbours of <code>(x_j − x_i)</code>, and setting that to zero gives</p>
          <pre className="mx-math">Σ_j (x_j − x_i) = 0    ⇒    x_i = (Σ_j x_j) / (number of neighbours)</pre>
          <p>which is exactly the averaging rule. The name is not a coincidence either: <code>½kx²</code> is the harmonic-oscillator potential, and this is a network of them at rest.</p>
          <AverageFigure />
          <h3>Why a frame is needed</h3>
          <p>Zero-length springs have one obvious flaw: with nothing held still, every spring wants length zero and the whole network collapses to a point. So some nodes are <strong>pinned</strong>: every cord's start on a line at the top, every cord's end on a line at the bottom, and every split at the two outermost gaps on a vertical line at the left or right, spaced evenly in the order they occurred. Together these make a rectangle, the frame. Its height comes from the number of events per lane gap scaled by the Length / width slider; its width is the cord count plus a margin. Everything else is free and gets averaged into it.</p>
          <h3>Why it was a good first model</h3>
          <ul>
            <li><strong>One answer, found exactly.</strong> The averaging rule is a system of linear equations, one per free node, with the pinned positions as the known right-hand side. The <code>x</code> and <code>y</code> coordinates do not interact, so it is two independent solves, done by conjugate gradient, a standard iterative method for large sparse systems. No random start, no schedule; running it twice gives the same drawing.</li>
            <li><strong>It cannot fold.</strong> Tutte's spring theorem (1963): pin a planar network to a convex outline, make every interior edge a positive spring, and the equilibrium has no crossing edges. The rectangle is convex. (The strict theorem needs a triangulated, 3-connected graph; the implementation pins a rectangle and then checks for crossings rather than trusting the theorem blindly.)</li>
            <li><strong>It is cheap.</strong> Each iteration is one pass over the edge list.</li>
          </ul>
          <h3>What it gets wrong, and the patch</h3>
          <p>The energy only says "be short". It has no idea how long a piece of cord <em>should</em> be, no objection to a kink, and no notion of thickness. Cells in the transition rows of Eyes come out tiny because nothing stops neighbouring junctions bunching up; the width is fixed by the cord count; the frame's straight sides are a guess baked into the result. The implementation adds a <strong>spacing relaxation</strong> after the solve: every junction-to-junction edge becomes an ordinary spring with a real rest length and the nodes take up to 80 small downhill steps, each checked first so that no angular sector around a node flips or flattens. It is a patch, not a physical model.</p>
          <HarmonicSolveFigure />
          <aside className="mx-pull"><p className="mx-kicker">In one picture</p><p>A fishing net stretched over a rectangular frame. Pull the frame open and every knot settles to the average of its neighbours. The net can never tangle, but the frame decides the shape, and the mesh gets squeezed wherever the knots are dense.</p></aside>
        </section>

        <section id="springs" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">04</span><h2>The spring model</h2></header>
          <p className="mx-rule">Give every spring a real natural length, add the springs a mesh needs to hold its shape, remove the frame, and let the fabric find its own width.</p>
          <p>The whole model is written in units of the cord diameter, <code>d = 1</code>. Colours, faces and row numbers never enter it; they only affect how the finished drawing is painted.</p>
          <h3>The geometry of one crossing</h3>
          <p>In a regular section there are two families of cords running at <code>+θ</code> and <code>−θ</code> to the length of the braid, so cords cross at <code>2θ</code>. The slider's default 1.35 is <code>cot θ</code>, which gives <code>θ ≈ 36.5°</code> and a crossing of about 73°. If the cords of one family lie side by side, touching, they are one diameter apart measured across themselves; walking along a cord of the other family, which crosses them at <code>2θ</code>, the crossings are</p>
          <pre className="mx-math">ℓ = d / sin 2θ  ≈ 1.05          the pitch</pre>
          <p>apart. That is the natural length of a cord segment between two consecutive splits. Four such segments around a junction form a rhombus whose diagonals are <code>2ℓ cos θ ≈ 1.68</code> along the braid and <code>2ℓ sin θ ≈ 1.24</code> across it. Once <code>θ</code> is fixed, everything about the ideal cell follows; the energy terms below ask every piece of the network to look like this where it can.</p>
          <RhombusFigure />
          <h3>The six terms</h3>
          <p>Each is a sum of ordinary springs, <code>E = ½ w (r − r₀)²</code>, over some set of node pairs. What changes is which pairs, what natural length and what weight.</p>
          <div className="mx-terms">
            {terms.map(t => <article key={t.key} className="mx-term">
              {termIcons[t.key]}
              <h4>{t.name}</h4>
              <code className="mx-term-formula">{t.formula}</code>
              <p>{t.text}</p>
            </article>)}
          </div>
          <pre className="mx-math">E(x, t) = E_cord + E_straight + E_cross + E_repulsion + E_orientation + α(t) · E_scaffold</pre>
          <p>Only the last term depends on the step counter.</p>
          <AnnealFigure />
          <h3>The starting layout</h3>
          <p>Minimising a non-linear energy needs a starting guess, and a good one matters. The model starts from the <strong>wiring diagram</strong> of Fig. 1: every junction at the gap where it happened and in the order it happened. That is already a valid drawing of the exchange sequence with no crossings and the right handedness, so the solve only has to reshape it. Random starts were tried in the experiments: half unfold onto the same layout, half fold irrecoverably. They remain a test, not the production path.</p>
          <h3>The solver, in two acts</h3>
          <p><strong>Act one: unfold.</strong> With the scaffold on, take 200 steps of gradient descent, <code>x_i ← x_i − η ∇_i E</code> with <code>η = 0.1</code>: each node moves a small distance straight downhill. Halfway through, the majority orientation picks the global mirror and the orientation penalty switches on. If any coordinate blows up, the step size is divided by three and the attempt restarts from the seed, at most eleven times.</p>
          <p><strong>Act two: settle.</strong> Switch the scaffold off, rescale so the mean edge length equals the mean rest length, and then run <strong>damped dynamics</strong> instead of gradient descent:</p>
          <pre className="mx-math">m dv/dt = F − γ v            m = 1, γ = 0.1, time step 0.1</pre>
          <p>Every node has unit mass, feels the spring forces, and is slowed by a weak drag, for up to 3000 steps or until the largest force on any node is below <code>2 × 10⁻³</code>. Then the drawing is centred, rotated so its long axis is vertical, turned so the cords start at the top, and mirrored if needed.</p>
          <p>Why momentum? Gradient descent is a ball rolling in honey: each step is proportional to the slope, so in a long, shallow valley it crawls. The energy of a strip has exactly such a valley, a <em>global shear</em> where every cell tilts a little. Worse, the scaffold prefers a square lattice and leaves the fabric sheared toward 90°. With ten over-damped polish steps the Eyes lattice stuck at 89.7°; with 3000 under-damped steps it reached 79.4°, the gradient went to zero, and 6000 steps gave the identical answer.</p>
          <ValleyFigure />
          <SpringSolveFigure />
          <h3>What comes out</h3>
          <p>Node positions become the drawing directly: each cord is a smooth curve through its junctions and midpoints, and at each junction the splittee's colour is painted over the splitter, because the splittee's plies pass in front of and behind it. The same two checks then run on both models' output: sampled curve crossings and port order at every junction. A layout that fails either is reported as unresolved, with the offending junctions listed; nothing is ever fixed by moving one event by hand.</p>
          <p>With the default profile the chevron settles to <code>72.0° ± 0.5°</code> with negligible strain. One block of Eyes comes out at <code>78.5° ± 16.4°</code>, the spread concentrated in the transition rows, where a lattice defect leaves a shear that a flat spring sheet cannot fully absorb. The Eyes motif, a nested eye in the centre and half eyes at each edge, emerges from colours and connectivity alone; over three blocks the eyes alternate between the centre and side-by-side pairs, which is what the photograph shows.</p>
          <aside className="mx-pull"><p className="mx-kicker">In one picture</p><p>A mesh of real springs lying on a table with no frame. It finds its own width, bulges into loops where cords turn at the edges, and settles into a diamond lattice wherever the pattern lets it. Shake it a little at the end so it does not get stuck part-way down.</p></aside>
        </section>

        <section id="side-by-side" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">05</span><h2>Side by side</h2></header>
          <table className="mx-table">
            <thead><tr><th /><th>Harmonic</th><th>Springs</th></tr></thead>
            <tbody>
              {[
                ['Springs', 'zero natural length', 'real natural lengths, plus straightness, angle, repulsion, orientation'],
                ['What holds it open', 'a pinned rectangular frame', 'nothing; the rest lengths and crossing angle do'],
                ['Width of the strip', 'set by the cord count', 'emerges from ℓ, θ and the cord count'],
                ['Edge loops', 'pinned to a straight line', 'emerge from the turn rest length'],
                ['Energy', 'quadratic, so linear equations', 'non-linear'],
                ['Number of answers', 'exactly one', 'one per energy minimum; the path chooses'],
                ['Solver', 'conjugate gradient, then 80 spacing steps', '200 gradient steps with an annealed scaffold, then up to 3000 damped-dynamics steps'],
                ['Crossing-free?', 'guaranteed at the node level (Tutte)', 'checked afterwards; folds are penalised, not forbidden'],
                ['Cost per step', 'one pass over the edges', 'edges plus scaffold pairs within graph distance 8'],
                ['One block of Eyes, 190 events', '≈ 0.06 s', '≈ 0.4 s, streamed to the view as it settles'],
                ['Role in the app', 'comparison baseline', 'default'],
              ].map(r => <tr key={r[0]}><th scope="row">{r[0]}</th><td>{r[1]}</td><td>{r[2]}</td></tr>)}
            </tbody>
          </table>
        </section>

        <section id="limits" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">06</span><h2>What neither model is</h2></header>
          <ul>
            <li><strong>Not a material simulation.</strong> No twist, no friction, no bending stiffness beyond the straightness spring, no tension from the maker's hands. The pitch, the angle and the turn length are packing idealisations, not measurements.</li>
            <li><strong>Flat.</strong> Both models live in two dimensions. Real fabric can spend strain in the third; the wide junctions in the Eyes transition rows are probably where the real braid puckers. A 3D extension is sketched in the spring model's notes but not built.</li>
            <li><strong>Colour-blind.</strong> Colours, faces and row numbers never enter either energy, so the motif has to come from the structure. That is deliberate: dropping three rows of Eyes changes 35 later pairings without changing a single visible colour, so colour alone cannot be the model.</li>
            <li><strong>Not yet validated against a photograph.</strong> The spring model produces the Eyes motif qualitatively. Whether its proportions match the real braid is a measurement still to be made.</li>
          </ul>
        </section>

        <section id="symbols" className="mx-section">
          <header className="mx-section-head"><span className="mx-numeral">07</span><h2>Symbols</h2></header>
          <table className="mx-table">
            <thead><tr><th>Symbol</th><th>Meaning</th><th>Default</th></tr></thead>
            <tbody>
              {[
                ['d', 'cord diameter, the unit of length in the spring model', '1'],
                ['θ', 'half the crossing angle; cords run at ±θ to the braid axis', '≈ 36.5° from the slider value cot θ = 1.35'],
                ['ℓ', 'pitch: natural length of a segment between consecutive splits, d / sin 2θ', '≈ 1.05'],
                ['ℓ_turn', 'natural length of a selvedge turn, 1.2 × 2ℓ cos θ', '≈ 2.0'],
                ['d_min', 'distance below which repulsion acts', '0.9'],
                ['w', 'spring weight', '1 cord · 0.1 straightness · 0.5 crossing · 1 repulsion · 1 orientation · 0.25 tails'],
                ['δ_ij', 'graph distance between nodes i and j', 'computed'],
                ['α(t)', 'scaffold strength at step t of T, √(1 − t/T) + 0.001', '1 → 0.001'],
                ['η', 'gradient-descent step size', '0.1'],
                ['γ', 'drag coefficient in the settling dynamics', '0.1'],
                ['T', 'unfolding steps', '200'],
              ].map(r => <tr key={r[0]}><td><code>{r[0]}</code></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}
            </tbody>
          </table>
          <p className="mx-colophon">Numbers on this page are taken from <code>src/domain/cordNetwork.ts</code> and <code>src/domain/springNetwork.ts</code>; the experimental results are from <code>docs/spring/findings.md</code>. Method reference: Svetlin Tassev, CrochetPARADE (GPLv3); this app describes its method and copies no code.</p>
        </section>
      </article>
    </div>
  </main>;
}
