import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { parsePattern } from './domain/parser';
import { simulatePattern } from './domain/simulate';
import { chevronPattern } from './examples/chevron';
import { buildCordNetwork, curvePath, curvePoint } from './domain/cordNetwork';
import type { CordNetworkLayout } from './domain/cordNetwork';
import { buildSpringNetwork, resolveSpringProfile } from './domain/springNetwork';
import { buildColorMap } from './domain/colourway';
import type { SplitEvent } from './domain/types';

/**
 * Figures for the model explainer (#/models). The two "live" figures run the real
 * harmonic and spring solvers on the bundled chevron sample; nothing here is a mock-up.
 */

const ink = '#17293d', paper = '#f8f0de', gold = '#d3a448', rust = '#d76b52', teal = '#77b6c9';
const deg = (rad: number) => rad * 180 / Math.PI;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
type Point = { x: number; y: number };

// ---------------------------------------------------------------- shared
const chevron = (() => {
  const parsed = parsePattern(chevronPattern);
  const colors = buildColorMap(parsed.pattern?.colors ?? [], parsed.pattern?.colorAssignments ?? {});
  return { pattern: parsed.pattern!, colors, colorOf: (symbol: string) => colors.get(symbol) ?? '#a89b84' };
})();
const simulateChevron = (repeats: number) => simulatePattern(chevron.pattern, repeats);

/** Realised crossing angle at each junction, from the directions to the two outgoing curve midpoints. */
function meanCrossingAngle(layout: CordNetworkLayout, events: SplitEvent[]): number {
  if (!events.length || !layout.cords.length) return NaN;
  const byId = new Map(layout.cords.map(c => [c.id, c]));
  let sum = 0;
  events.forEach((e, i) => {
    const gap = Math.min(e.fromLane, e.toLane);
    const [u, v] = [e.lanesBefore[gap - 1].id, e.lanesBefore[gap].id].map(id => {
      const cord = byId.get(id)!, curve = cord.curves[cord.nodes.indexOf(i)].points, mid = curvePoint(curve, 0.5);
      return { x: mid.x - curve[0].x, y: mid.y - curve[0].y };
    });
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
    sum += deg(Math.acos(clamp(cos, -1, 1)));
  });
  return sum / events.length;
}

/** Pointer dragging inside an SVG, reported in viewBox coordinates. Arrow keys nudge the same node. */
function useSvgDrag(onMove: (id: string, p: Point) => void) {
  const ref = useRef<SVGSVGElement>(null);
  const active = useRef<string | null>(null);
  const toLocal = (e: ReactPointerEvent): Point => {
    const matrix = ref.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return { x: pt.x, y: pt.y };
  };
  const handle = (id: string, current: Point, step = 4) => ({
    tabIndex: 0,
    role: 'button' as const,
    className: 'mx-handle',
    onPointerDown: (e: ReactPointerEvent) => { active.current = id; (e.currentTarget as Element).setPointerCapture(e.pointerId); onMove(id, toLocal(e)); e.preventDefault(); },
    onPointerMove: (e: ReactPointerEvent) => { if (active.current === id) onMove(id, toLocal(e)); },
    onPointerUp: () => { active.current = null; },
    onPointerCancel: () => { active.current = null; },
    onKeyDown: (e: ReactKeyboardEvent) => {
      const d: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
      if (d[e.key]) { onMove(id, { x: current.x + d[e.key].x, y: current.y + d[e.key].y }); e.preventDefault(); }
    },
  });
  return { ref, handle };
}

export function Figure({ n, title, live, caption, children, controls }: { n: number; title: string; live?: boolean; caption?: ReactNode; children: ReactNode; controls?: ReactNode }) {
  return <figure className="mx-figure" aria-label={`Figure ${n}: ${title}`}>
    <div className="mx-figure-head"><span className="mx-figure-n">Fig. {n}</span><span className="mx-figure-title">{title}</span>{live && <span className="mx-figure-live"><i />interactive</span>}</div>
    <div className="mx-figure-body">{children}</div>
    {controls && <div className="mx-figure-controls">{controls}</div>}
    {caption && <figcaption>{caption}</figcaption>}
  </figure>;
}

const Readout = ({ items }: { items: [string, string][] }) => <dl className="mx-readout">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;

// ---------------------------------------------------------------- Fig 1: events → graph
export function EventGraphFigure() {
  const simulation = useMemo(() => simulateChevron(1), []);
  const [hovered, setHovered] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const hover = hovered ?? focused;
  const cords = simulation.snapshots[0].lanes, events = simulation.events, n = cords.length;
  const laneX = (lane: number) => 50 + (lane - 1) * 62, top = 44, bottom = 44 + (events.length + 1) * 46;
  const finalLanes = events.at(-1)?.lanesAfter ?? cords;
  const chains = cords.map((cord, lane) => {
    const visits = events.map((e, i) => ({ e, i })).filter(({ e }) => e.splitterId === cord.id || e.splitteeId === cord.id);
    const points: Point[] = [{ x: laneX(lane + 1), y: top },
      ...visits.map(({ e, i }) => ({ x: laneX((e.fromLane + e.toLane) / 2), y: top + (i + 1) * 46 })),
      { x: laneX(finalLanes.findIndex(c => c.id === cord.id) + 1), y: bottom }];
    return { cord, points, visits: visits.map(v => v.i) };
  });
  const active = chains.find(c => c.cord.id === hover);
  return <Figure n={1} title="From a list of splits to a network" live
    caption={<>The eight-cord chevron, one block. Hover or tap a cord to trace it. Each split is a node placed at the gap where it happened (across) and in the order it happened (down); each stretch of cord between two visits is an edge. This drawing is also the <em>wiring seed</em> that the spring model starts from.</>}
    controls={<Readout items={active
      ? [['cord', `${active.cord.id} · colour ${active.cord.colorSymbol}`], ['visits', `start → ${active.visits.join(' → ')} → end`], ['edges', String(active.points.length - 1)]]
      : [['trace', 'hover or tap a cord to follow it through every split']]} />}>
    <svg viewBox={`0 0 ${laneX(n) + 50} ${bottom + 40}`} className="mx-svg" role="img" aria-label="Chevron split graph">
      {cords.map((_, lane) => <line key={lane} x1={laneX(lane + 1)} x2={laneX(lane + 1)} y1={top} y2={bottom} className="mx-lane" />)}
      {cords.map((_, lane) => <text key={lane} x={laneX(lane + 1)} y={top - 18} className="mx-label" textAnchor="middle">lane {lane + 1}</text>)}
      {chains.map(({ cord, points }) => {
        const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
        const dim = hover && hover !== cord.id;
        return <g key={cord.id} onPointerEnter={() => setHovered(cord.id)} onPointerLeave={() => setHovered(undefined)} onFocus={() => setFocused(cord.id)} onBlur={() => setFocused(undefined)} tabIndex={0} aria-label={`Cord ${cord.id}`} style={{ cursor: 'pointer', outline: 'none' }}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={22} />
          <path d={d} fill="none" stroke={chevron.colorOf(cord.colorSymbol)} strokeWidth={hover === cord.id ? 9 : 6} strokeLinejoin="round" strokeLinecap="round" opacity={dim ? 0.22 : 1} style={{ transition: 'opacity .15s, stroke-width .15s' }} />
        </g>;
      })}
      {events.map((e, i) => <g key={i} transform={`translate(${laneX((e.fromLane + e.toLane) / 2)} ${top + (i + 1) * 46})`} pointerEvents="none">
        <circle r={12} fill={ink} stroke={paper} strokeWidth={2} />
        <text y={4} textAnchor="middle" fill={paper} fontSize={11} fontWeight={500}>{i}</text>
      </g>)}
      {chains.map(({ cord, points }) => <g key={cord.id} pointerEvents="none">
        <rect x={points[0].x - 6} y={points[0].y - 6} width={12} height={12} fill={paper} stroke={ink} strokeWidth={1.6} />
        <rect x={points.at(-1)!.x - 6} y={points.at(-1)!.y - 6} width={12} height={12} fill={paper} stroke={ink} strokeWidth={1.6} />
      </g>)}
      <text x={laneX(1) - 14} y={top + 4} className="mx-label" textAnchor="end">start</text>
      <text x={laneX(1) - 14} y={bottom + 4} className="mx-label" textAnchor="end">end</text>
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- Fig 2: one spring
export function SpringEnergyFigure() {
  const [r, setR] = useState(1.45);
  const rest = 1, k = 1, energy = 0.5 * k * (r - rest) ** 2, force = -k * (r - rest);
  const { ref, handle } = useSvgDrag((_, p) => setR(clamp((p.x - 60) / 190, 0.15, 2.3)));
  const px = 60 + r * 190, massY = 240;
  const plotX = (v: number) => 60 + v * 190, plotY = (e: number) => 150 - e * 200;
  const curve = Array.from({ length: 61 }, (_, i) => i / 30).map((v, i) => `${i ? 'L' : 'M'}${plotX(v)} ${plotY(0.5 * k * (v - rest) ** 2)}`).join(' ');
  const teeth = 12, sx = 60, ex = px - 14;
  const zigzag = [`M${sx} ${massY}`, `L${sx + 14} ${massY}`, ...Array.from({ length: teeth }, (_, i) => `L${sx + 14 + (ex - sx - 28) * (i + 0.5) / teeth} ${massY + (i % 2 ? 11 : -11)}`), `L${ex} ${massY}`, `L${px} ${massY}`].join(' ');
  return <Figure n={2} title="One spring, its energy and its force" live
    caption={<>Drag the block. The stored energy is the height of the dot on the bowl, <code>E = ½k(r − r₀)²</code>; the force is minus the slope, always pointing back toward the natural length. Everything in both models is a sum of terms like this one.</>}
    controls={<Readout items={[['r', r.toFixed(2)], ['r₀', '1.00'], ['E', energy.toFixed(3)], ['F = −k(r − r₀)', force.toFixed(2)]]} />}>
    <svg ref={ref} viewBox="0 0 560 300" className="mx-svg" role="img" aria-label="Spring energy and force">
      <line x1={60} y1={150} x2={520} y2={150} className="mx-axis" /><line x1={60} y1={40} x2={60} y2={150} className="mx-axis" />
      <text x={522} y={154} className="mx-label">r</text><text x={66} y={40} className="mx-label">E</text>
      <line x1={plotX(rest)} y1={150} x2={plotX(rest)} y2={40} className="mx-guide" /><text x={plotX(rest)} y={168} className="mx-label" textAnchor="middle">r₀</text>
      <path d={curve} fill="none" stroke={ink} strokeWidth={1.6} />
      <line x1={px} y1={plotY(energy)} x2={px} y2={massY - 22} className="mx-guide" />
      <circle cx={px} cy={plotY(energy)} r={5.5} fill={gold} stroke={ink} strokeWidth={1.4} />
      <rect x={48} y={massY - 34} width={12} height={68} fill={ink} />
      <path d={zigzag} fill="none" stroke={ink} strokeWidth={1.8} strokeLinejoin="round" />
      {Math.abs(force) > 0.02 && <g stroke={rust} fill={rust} strokeWidth={2.4}>
        <line x1={px} y1={massY - 40} x2={px + force * 110} y2={massY - 40} />
        <path d={`M${px + force * 110} ${massY - 40} l${force > 0 ? -8 : 8} -5 v10 z`} stroke="none" />
      </g>}
      <text x={px} y={massY - 48} textAnchor="middle" className="mx-label" fill={rust}>F</text>
      <g {...handle('mass', { x: px, y: massY }, 6)} aria-label="Drag the block to stretch or squash the spring" transform={`translate(${px} ${massY})`}>
        <circle r={26} fill="transparent" />
        <rect x={-14} y={-18} width={28} height={36} rx={2} fill={gold} stroke={ink} strokeWidth={1.6} />
      </g>
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- Fig 3: average of neighbours
export function AverageFigure() {
  const [pins, setPins] = useState<Point[]>([{ x: 120, y: 80 }, { x: 430, y: 110 }, { x: 300, y: 270 }]);
  const { ref, handle } = useSvgDrag((id, p) => setPins(current => current.map((q, i) => i === Number(id) ? { x: clamp(p.x, 24, 536), y: clamp(p.y, 24, 296) } : q)));
  const free = { x: pins.reduce((s, p) => s + p.x, 0) / pins.length, y: pins.reduce((s, p) => s + p.y, 0) / pins.length };
  const arrow = (p: Point) => { const dx = (p.x - free.x) * 0.38, dy = (p.y - free.y) * 0.38, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    return { x2: free.x + dx, y2: free.y + dy, head: `M${free.x + dx} ${free.y + dy} l${-ux * 9 - uy * 4.5} ${-uy * 9 + ux * 4.5} l${uy * 9} ${-ux * 9} z` }; };
  return <Figure n={3} title="The harmonic rule: sit at the average of your neighbours" live
    caption={<>Three pinned nodes (squares) and one free node (disc) joined to them by zero-length springs. Drag a pinned node: the free node moves to the mean of the three positions, where the three spring forces (arrows) cancel exactly. With more free nodes the rule holds at every one of them at once.</>}
    controls={<Readout items={[['free node', `( (${pins.map(p => Math.round(p.x)).join(' + ')}) / 3 , (${pins.map(p => Math.round(p.y)).join(' + ')}) / 3 ) = (${free.x.toFixed(0)}, ${free.y.toFixed(0)})`], ['Σ F', '(0, 0)']]} />}>
    <svg ref={ref} viewBox="0 0 560 320" className="mx-svg" role="img" aria-label="Free node at the average of three pinned nodes">
      {pins.map((p, i) => <line key={i} x1={free.x} y1={free.y} x2={p.x} y2={p.y} className="mx-edge" />)}
      {pins.map((p, i) => { const a = arrow(p); return <g key={i} stroke={rust} fill={rust} strokeWidth={2.2}><line x1={free.x} y1={free.y} x2={a.x2} y2={a.y2} /><path d={a.head} stroke="none" /></g>; })}
      <circle cx={free.x} cy={free.y} r={11} fill={gold} stroke={ink} strokeWidth={1.6} />
      <text x={free.x + 16} y={free.y - 12} className="mx-label">free</text>
      {pins.map((p, i) => <g key={i} {...handle(String(i), p)} aria-label={`Drag pinned node ${i + 1}`} transform={`translate(${p.x} ${p.y})`}>
        <circle r={24} fill="transparent" />
        <rect x={-9} y={-9} width={18} height={18} fill={ink} stroke={paper} strokeWidth={2} />
        <text x={14} y={-12} className="mx-label">pinned {i + 1}</text>
      </g>)}
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- network drawing shared by the live figures
function NetworkDrawing({ layout, pinned, offset }: { layout: CordNetworkLayout; pinned?: Set<number>; offset?: Point }) {
  return <g transform={offset ? `translate(${offset.x} ${offset.y})` : undefined}>
    {layout.cords.map(c => <path key={c.id} d={c.curves.map((s, i) => curvePath(s.points, i === 0)).join('')} fill="none" stroke={chevron.colorOf(c.colorSymbol)} strokeWidth={0.18} strokeLinecap="round" strokeLinejoin="round" />)}
    {layout.junctions.map((j, i) => <circle key={i} cx={j.position.x} cy={j.position.y} r={pinned?.has(i) ? 0 : 0.13} fill={ink} />)}
    {pinned && layout.points.map((p, i) => pinned.has(i) && <rect key={i} x={p.x - 0.16} y={p.y - 0.16} width={0.32} height={0.32} fill={gold} stroke={ink} strokeWidth={0.05} />)}
  </g>;
}

// ---------------------------------------------------------------- Fig 4: the harmonic solve, for real
export function HarmonicSolveFigure() {
  const [relaxed, setRelaxed] = useState(false);
  const data = useMemo(() => {
    const simulation = simulateChevron(6), n = simulation.snapshots[0].lanes.length, E = simulation.events.length;
    const pinned = new Set<number>();
    simulation.events.forEach((e, i) => { const gap = Math.min(e.fromLane, e.toLane); if (gap === 1 || gap === n - 1) pinned.add(i); });
    const layouts = { averaged: buildCordNetwork(simulation, { relax: false }), relaxed: buildCordNetwork(simulation) };
    for (let i = E; i < layouts.averaged.points.length; i++) pinned.add(i);
    const box = (layout: CordNetworkLayout) => { const pts = [...pinned].map(i => layout.points[i]); return { x: Math.min(...pts.map(p => p.x)), y: Math.min(...pts.map(p => p.y)), X: Math.max(...pts.map(p => p.x)), Y: Math.max(...pts.map(p => p.y)) }; };
    return { simulation, pinned, layouts, angles: { averaged: meanCrossingAngle(layouts.averaged, simulation.events), relaxed: meanCrossingAngle(layouts.relaxed, simulation.events) }, frame: box(layouts.averaged) };
  }, []);
  const layout = relaxed ? data.layouts.relaxed : data.layouts.averaged, angle = relaxed ? data.angles.relaxed : data.angles.averaged;
  return <Figure n={4} title="The harmonic model on the chevron, six blocks" live
    caption={<>Computed by <code>buildCordNetwork</code>, the same code the app runs. Squares are pinned: every start and end, and every split at the two outer gaps, on a rectangular frame (dashed). Every other node is at the average of its neighbours. The second view adds the 80-step spacing relaxation that gives the segments a preferred length.</>}
    controls={<>
      <div className="mx-toggle" role="group" aria-label="Harmonic stage">
        <button type="button" aria-pressed={!relaxed} className={relaxed ? '' : 'is-active'} onClick={() => setRelaxed(false)}>averaging only</button>
        <button type="button" aria-pressed={relaxed} className={relaxed ? 'is-active' : ''} onClick={() => setRelaxed(true)}>then spaced</button>
      </div>
      <Readout items={[['pinned nodes', String(data.pinned.size)], ['free nodes', String(layout.points.length - data.pinned.size)], ['mean crossing angle', `${angle.toFixed(1)}°`], ['solve', `${layout.quality.iterations} CG iterations · ${layout.quality.relaxationSteps} spacing steps`]]} />
    </>}>
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="mx-svg mx-svg--network" role="img" aria-label="Harmonic layout of the chevron">
      <rect x={data.frame.x} y={data.frame.y} width={data.frame.X - data.frame.x} height={data.frame.Y - data.frame.y} fill="none" stroke={rust} strokeWidth={0.04} strokeDasharray="0.18 0.14" />
      <NetworkDrawing layout={layout} pinned={data.pinned} />
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- Fig 5: the rhombus and the crossing-angle spring
export function RhombusFigure() {
  const profile = useMemo(() => resolveSpringProfile({}), []);
  const theta = deg(profile.theta), ell = profile.pitch, restLength = 2 * ell * Math.sin(profile.theta);
  const [phi, setPhi] = useState(54);
  const anim = useRef<number>(0);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  const letGo = () => {
    cancelAnimationFrame(anim.current);
    const from = phi, start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900), ease = 1 - Math.pow(1 - t, 3), wobble = Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.12;
      setPhi(from + (theta - from) * (ease + wobble));
      if (t < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  };
  const rad = phi * Math.PI / 180, L = 112, cx = 190, cy = 152;
  const port = (sx: number, sy: number): Point => ({ x: cx + sx * L * Math.sin(rad), y: cy + sy * L * Math.cos(rad) });
  const aIn = port(-1, -1), bIn = port(1, -1), aOut = port(1, 1), bOut = port(-1, 1);
  const length = 2 * ell * Math.sin(rad), energy = 0.5 * profile.wCross * (length - restLength) ** 2, stretched = length > restLength;
  const rx = 440, ry = 152, c = 70;
  const cell = [[rx, ry - c * Math.cos(rad)], [rx + c * Math.sin(rad), ry], [rx, ry + c * Math.cos(rad)], [rx - c * Math.sin(rad), ry]];
  return <Figure n={5} title="A rhombus shears for free; the crossing-angle spring holds it" live
    caption={<>Two cords through a junction with the two crossing-angle springs (dashed) between the in-ports and between the out-ports. Their natural length is <code>2ℓ sin θ</code>, so they are slack only at the target angle. Shear the crossing with the slider, then let go. On the right, the lattice cell that four such junctions make; its diagonals are <code>2ℓ cos φ</code> and <code>2ℓ sin φ</code>.</>}
    controls={<>
      <label className="mx-slider">current half-angle φ<input type="range" min={18} max={72} step={0.5} value={phi} onChange={e => { cancelAnimationFrame(anim.current); setPhi(Number(e.target.value)); }} aria-label="Current half-angle of the crossing in degrees" /><output>{phi.toFixed(1)}°</output></label>
      <button type="button" className="mx-button" onClick={letGo}>let go</button>
      <Readout items={[['crossing angle 2φ', `${(2 * phi).toFixed(1)}°`], ['target 2θ', `${(2 * theta).toFixed(1)}°`], ['spring length', `${length.toFixed(2)} d (rest ${restLength.toFixed(2)})`], ['E per spring', energy.toFixed(3)], ['cell elongation cot φ', (1 / Math.tan(rad)).toFixed(2)]]} />
    </>}>
    <svg viewBox="0 0 560 300" className="mx-svg" role="img" aria-label="Crossing with its angle springs and the resulting lattice cell">
      <line x1={aIn.x} y1={aIn.y} x2={aOut.x} y2={aOut.y} stroke={gold} strokeWidth={9} strokeLinecap="round" />
      <line x1={bIn.x} y1={bIn.y} x2={bOut.x} y2={bOut.y} stroke={teal} strokeWidth={9} strokeLinecap="round" />
      {[[aIn, bIn], [aOut, bOut]].map(([p, q], i) => <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={rust} strokeWidth={stretched ? 1.6 : 3} strokeDasharray={stretched ? '9 6' : '3 5'} />)}
      {[aIn, bIn, aOut, bOut].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={6} fill={paper} stroke={ink} strokeWidth={1.6} />)}
      <circle cx={cx} cy={cy} r={7} fill={ink} />
      <text x={aIn.x - 8} y={aIn.y - 10} className="mx-label" textAnchor="end">a⁻</text><text x={bIn.x + 8} y={bIn.y - 10} className="mx-label">b⁻</text>
      <text x={aOut.x + 8} y={aOut.y + 20} className="mx-label">a⁺</text><text x={bOut.x - 8} y={bOut.y + 20} className="mx-label" textAnchor="end">b⁺</text>
      <path d={`M${cx} ${cy - 34} A34 34 0 0 1 ${cx + 34 * Math.sin(2 * rad)} ${cy - 34 * Math.cos(2 * rad)}`} fill="none" stroke={ink} strokeWidth={1} transform={`rotate(${-phi} ${cx} ${cy})`} />
      <text x={cx} y={cy - 44} className="mx-label" textAnchor="middle">2φ</text>
      <text x={(aIn.x + bIn.x) / 2} y={aIn.y - 12} className="mx-label" textAnchor="middle" fill={rust}>2ℓ sin φ</text>
      <polygon points={cell.map(p => p.join(',')).join(' ')} fill={`${gold}33`} stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={cell[0][0]} y1={cell[0][1]} x2={cell[2][0]} y2={cell[2][1]} className="mx-guide" /><line x1={cell[1][0]} y1={cell[1][1]} x2={cell[3][0]} y2={cell[3][1]} className="mx-guide" />
      {cell.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={ink} />)}
      <text x={rx} y={cell[0][1] - 10} className="mx-label" textAnchor="middle">2ℓ cos φ</text>
      <text x={cell[1][0] + 8} y={ry + 4} className="mx-label">2ℓ sin φ</text>
      <text x={rx} y={cell[2][1] + 22} className="mx-label" textAnchor="middle">side ℓ</text>
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- Fig 6: the anneal schedule
export function AnnealFigure() {
  const alphaMin = 1e-3, T = 200;
  const x = (t: number) => 60 + t * 440, y = (a: number) => 170 - a * 130;
  const path = Array.from({ length: 101 }, (_, i) => i / 100).map((t, i) => `${i ? 'L' : 'M'}${x(t)} ${y(Math.sqrt(1 - t) + alphaMin)}`).join(' ');
  return <Figure n={6} title="The scaffold fades: α(t) = √(1 − t/T) + 0.001"
    caption={<>Strength of the scaffold springs over the unfolding loop, <code>T = 200</code> steps in the app. It stays strong for most of the run and collapses in the last fifth. At <code>T/2</code> the model counts junction orientations, mirrors the whole drawing if the majority is clockwise, and switches on the orientation penalty.</>}>
    <svg viewBox="0 0 560 210" className="mx-svg" role="img" aria-label="Anneal schedule">
      <line x1={60} y1={170} x2={510} y2={170} className="mx-axis" /><line x1={60} y1={30} x2={60} y2={170} className="mx-axis" />
      <text x={514} y={174} className="mx-label">t</text><text x={60} y={22} className="mx-label" textAnchor="middle">α</text>
      <text x={44} y={y(1) + 4} className="mx-label" textAnchor="end">1</text><text x={44} y={y(0) + 4} className="mx-label" textAnchor="end">0</text>
      <text x={x(0)} y={188} className="mx-label" textAnchor="middle">0</text><text x={x(1)} y={188} className="mx-label" textAnchor="middle">T</text>
      <line x1={x(0.5)} y1={30} x2={x(0.5)} y2={170} className="mx-guide" /><text x={x(0.5)} y={188} className="mx-label" textAnchor="middle">T/2 · mirror vote</text>
      <path d={path} fill="none" stroke={rust} strokeWidth={2.2} />
      <text x={x(0.3)} y={y(Math.sqrt(0.7)) - 12} className="mx-label" fill={rust}>scaffold pulling the network open</text>
      <text x={x(0.98)} y={y(0.12) - 6} className="mx-label" textAnchor="end">nearly gone</text>
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- Fig 7: honey versus friction
export function ValleyFigure() {
  const N = 1000, k = 0.008, eta = 0.1, dt = 0.1, gamma = 0.1;
  const paths = useMemo(() => {
    const honey = [1], friction = [1];
    let x = 1, v = 0;
    for (let i = 1; i <= N; i++) {
      honey.push(honey[i - 1] - eta * k * honey[i - 1]);
      v = (-dt * k * x + 2 * v) / (2 + dt * gamma); x += v * dt; friction.push(x);
    }
    return { honey, friction };
  }, []);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => { setStep(s => { if (s >= N) { setPlaying(false); return s; } return Math.min(N, s + 8); }); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const vx = (x: number) => 280 + x * 200, vy = (x: number) => 118 - 70 * x * x + 70;
  const valley = Array.from({ length: 61 }, (_, i) => -1.25 + i / 24).map((x, i) => `${i ? 'L' : 'M'}${vx(x)} ${vy(x)}`).join(' ');
  const tx = (i: number) => 60 + i / N * 450, ty = (x: number) => 300 - x * 60;
  const trace = (xs: number[]) => xs.slice(0, step + 1).map((x, i) => `${i ? 'L' : 'M'}${tx(i)} ${ty(x)}`).join(' ');
  const honey = paths.honey[step], friction = paths.friction[step];
  return <Figure n={7} title="Why the settling pass needs momentum" live
    caption={<>Two balls released on the same very shallow valley, <code>E = ½kx²</code> with <code>k = 0.008</code>. Gold moves by plain gradient descent with the model's step <code>η = 0.1</code>, the largest the stiff cord springs allow: each step is proportional to the slope, so on a gentle slope it crawls. Rust obeys <code>m dv/dt = F − γv</code> with <code>γ = 0.1</code>: it rolls through, swings back, and settles. A long strip's global shear is such a valley.</>}
    controls={<>
      <button type="button" className="mx-button" onClick={() => { if (step >= N) setStep(0); setPlaying(p => !p); }}>{playing ? 'pause' : step >= N ? 'replay' : 'play'}</button>
      <label className="mx-slider">step<input type="range" min={0} max={N} value={step} onChange={e => { setPlaying(false); setStep(Number(e.target.value)); }} aria-label="Simulation step" /><output>{step}</output></label>
      <Readout items={[['gradient descent · x', honey.toFixed(3)], ['damped dynamics · x', friction.toFixed(3)]]} />
    </>}>
    <svg viewBox="0 0 560 320" className="mx-svg" role="img" aria-label="Gradient descent against damped dynamics in a shallow valley">
      <path d={valley} fill="none" stroke={ink} strokeWidth={1.6} />
      <text x={vx(0)} y={vy(0) + 22} className="mx-label" textAnchor="middle">minimum</text>
      <circle cx={vx(honey)} cy={vy(honey) - 9} r={9} fill={gold} stroke={ink} strokeWidth={1.4} />
      <circle cx={vx(friction)} cy={vy(friction) - 9} r={9} fill={rust} stroke={ink} strokeWidth={1.4} />
      <line x1={60} y1={ty(0)} x2={510} y2={ty(0)} className="mx-axis" /><line x1={60} y1={ty(1.15)} x2={60} y2={ty(-1.15)} className="mx-axis" />
      <text x={514} y={ty(0) + 4} className="mx-label">step</text><text x={44} y={ty(1) + 4} className="mx-label" textAnchor="end">x</text>
      <path d={trace(paths.honey)} fill="none" stroke={gold} strokeWidth={2.2} /><path d={trace(paths.friction)} fill="none" stroke={rust} strokeWidth={2.2} />
    </svg>
  </Figure>;
}

// ---------------------------------------------------------------- Fig 8: the spring solve, for real
type Frame = { label: string; phase: 'seed' | 'unfold' | 'settle' | 'done'; layout: CordNetworkLayout; angle: number };
export function SpringSolveFigure() {
  const data = useMemo(() => {
    const simulation = simulateChevron(6), events = simulation.events, profile = resolveSpringProfile({}), T = profile.iterations;
    const frames: Frame[] = [];
    const seed = buildSpringNetwork(simulation, { iterations: 0, polishSteps: 0 });
    frames.push({ label: 'wiring seed · before any step', phase: 'seed', layout: seed, angle: meanCrossingAngle(seed, events) });
    const final = buildSpringNetwork(simulation, {}, (progress, build) => {
      const layout = build();
      if (progress < 0.4) {
        const t = Math.round(progress / 0.4 * T);
        frames.push({ label: `unfold · step ${t + 1} of ${T} · scaffold α = ${(Math.sqrt(1 - t / T) + profile.alphaMin).toFixed(2)}`, phase: 'unfold', layout, angle: meanCrossingAngle(layout, events) });
      } else {
        frames.push({ label: `settle · step ${layout.quality.relaxationSteps + 1} · scaffold off`, phase: 'settle', layout, angle: meanCrossingAngle(layout, events) });
      }
    });
    frames.push({ label: `settled · step ${final.quality.relaxationSteps} · every force below ${profile.tolerance}`, phase: 'done', layout: final, angle: meanCrossingAngle(final, events) });
    const width = Math.max(...frames.map(f => f.layout.width)), height = Math.max(...frames.map(f => f.layout.height));
    return { frames, width, height, target: 2 * deg(profile.theta), simulation };
  }, []);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setIndex(i => { if (i >= data.frames.length - 1) { setPlaying(false); return i; } return i + 1; }), 420);
    return () => window.clearInterval(id);
  }, [playing, data.frames.length]);
  const frame = data.frames[index], last = data.frames.length - 1;
  const gauge = (a: number) => 60 + clamp((a - 55) / 50, 0, 1) * 440;
  return <Figure n={8} title="The spring model on the chevron, six blocks, step by step" live
    caption={<>Every frame is a real intermediate layout from <code>buildSpringNetwork</code>, captured as the app's own progress callback delivers it. Watch the gauge: the scaffold pulls the crossing wider, toward the square lattice it prefers, and the settling pass brings it back to the target and rings around it before every force dies away. The wiring seed is already close to a lattice, so the app's local scaffold has little to unfold here; on the Eyes pattern with an all-pairs scaffold the unfold parked the fabric at 90°.</>}
    controls={<>
      <button type="button" className="mx-button" onClick={() => { if (index >= last) setIndex(0); setPlaying(p => !p); }}>{playing ? 'pause' : index >= last ? 'replay' : 'play'}</button>
      <label className="mx-slider">frame<input type="range" min={0} max={last} value={index} onChange={e => { setPlaying(false); setIndex(Number(e.target.value)); }} aria-label="Solver frame" /><output>{index} / {last}</output></label>
      <Readout items={[['stage', frame.label], ['mean crossing angle', `${frame.angle.toFixed(1)}° (target ${data.target.toFixed(1)}°)`]]} />
    </>}>
    <div className="mx-solve">
      <svg viewBox={`0 0 ${data.width} ${data.height}`} className="mx-svg mx-svg--network" role="img" aria-label={`Spring layout, ${frame.label}`}>
        <NetworkDrawing layout={frame.layout} offset={{ x: (data.width - frame.layout.width) / 2, y: (data.height - frame.layout.height) / 2 }} />
      </svg>
      <svg viewBox="0 0 560 44" className="mx-svg mx-gauge" role="img" aria-label="Crossing angle gauge">
        <line x1={60} y1={22} x2={500} y2={22} className="mx-axis" />
        {[60, 70, 80, 90, 100].map(a => <g key={a}><line x1={gauge(a)} y1={17} x2={gauge(a)} y2={27} className="mx-axis" /><text x={gauge(a)} y={42} className="mx-label" textAnchor="middle">{a}°</text></g>)}
        <line x1={gauge(data.target)} y1={8} x2={gauge(data.target)} y2={36} stroke={rust} strokeWidth={2} /><text x={gauge(data.target)} y={6} className="mx-label" textAnchor="middle" fill={rust}>target</text>
        <circle cx={gauge(frame.angle)} cy={22} r={7} fill={frame.phase === 'unfold' ? teal : gold} stroke={ink} strokeWidth={1.4} style={{ transition: 'cx .25s ease-out' }} />
      </svg>
    </div>
  </Figure>;
}

// ---------------------------------------------------------------- the six energy terms, as small icons
const Icon = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 120 64" className="mx-term-icon" aria-hidden="true">{children}</svg>;
const coil = (x1: number, y1: number, x2: number, y2: number, teeth = 6, amp = 5) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = -dy / len * amp, ny = dx / len * amp;
  return [`M${x1} ${y1}`, ...Array.from({ length: teeth }, (_, i) => { const t = (i + 0.5) / teeth, s = i % 2 ? -1 : 1; return `L${x1 + dx * t + nx * s} ${y1 + dy * t + ny * s}`; }), `L${x2} ${y2}`].join(' ');
};
export const termIcons: Record<string, ReactNode> = {
  cord: <Icon><path d={coil(20, 32, 100, 32)} fill="none" stroke={ink} strokeWidth={1.6} /><circle cx={20} cy={32} r={5} fill={ink} /><circle cx={60} cy={32} r={3.5} fill={gold} stroke={ink} strokeWidth={1.2} /><circle cx={100} cy={32} r={5} fill={ink} /></Icon>,
  straight: <Icon><path d="M18 44 L60 22 L102 44" fill="none" stroke={gold} strokeWidth={5} strokeLinecap="round" /><path d={coil(18, 44, 102, 44, 8, 4)} fill="none" stroke={rust} strokeWidth={1.4} strokeDasharray="3 2" /><circle cx={18} cy={44} r={4} fill={ink} /><circle cx={60} cy={22} r={4} fill={ink} /><circle cx={102} cy={44} r={4} fill={ink} /></Icon>,
  cross: <Icon><line x1={30} y1={10} x2={90} y2={54} stroke={gold} strokeWidth={5} strokeLinecap="round" /><line x1={90} y1={10} x2={30} y2={54} stroke={teal} strokeWidth={5} strokeLinecap="round" /><path d={coil(30, 10, 90, 10, 6, 3)} fill="none" stroke={rust} strokeWidth={1.4} /><path d={coil(30, 54, 90, 54, 6, 3)} fill="none" stroke={rust} strokeWidth={1.4} /><circle cx={60} cy={32} r={4.5} fill={ink} /></Icon>,
  repel: <Icon><circle cx={52} cy={32} r={9} fill={gold} stroke={ink} strokeWidth={1.4} /><circle cx={68} cy={32} r={9} fill={teal} stroke={ink} strokeWidth={1.4} /><path d="M38 32 H22 M26 27 L20 32 L26 37" fill="none" stroke={rust} strokeWidth={2} /><path d="M82 32 H98 M94 27 L100 32 L94 37" fill="none" stroke={rust} strokeWidth={2} /></Icon>,
  orient: <Icon><line x1={32} y1={10} x2={88} y2={54} stroke={gold} strokeWidth={4} strokeLinecap="round" /><line x1={88} y1={10} x2={32} y2={54} stroke={teal} strokeWidth={4} strokeLinecap="round" /><path d="M78 20 A24 24 0 1 1 78 44" fill="none" stroke={rust} strokeWidth={1.8} /><path d="M78 44 l-7 -1 l3 6 z" fill={rust} /><circle cx={60} cy={32} r={4} fill={ink} /></Icon>,
  scaffold: <Icon>{[[20, 14], [60, 10], [100, 16], [24, 50], [62, 54], [98, 48]].map(([x, y], i, all) => all.slice(i + 1).map(([u, v], j) => <line key={`${i}-${j}`} x1={x} y1={y} x2={u} y2={v} stroke={rust} strokeWidth={0.9} strokeOpacity={0.55} />))}{[[20, 14], [60, 10], [100, 16], [24, 50], [62, 54], [98, 48]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.5} fill={ink} />)}</Icon>,
};

