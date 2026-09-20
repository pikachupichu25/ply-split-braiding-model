import type { Cord, Simulation, SplitEvent } from './types';

export type NetworkPoint = { x: number; y: number };
export type CordCurve = {
  id: string;
  cordId: string;
  from: number;
  to: number;
  points: [NetworkPoint, NetworkPoint, NetworkPoint, NetworkPoint];
};
export type NetworkCord = Cord & { nodes: number[]; curves: CordCurve[] };
export type NetworkJunction = {
  event: SplitEvent;
  position: NetworkPoint;
  /** Exact subcurves of the splittee, so the patch joins its continuous cord. */
  patch: [CordCurve['points'], CordCurve['points']];
};
export type CordNetworkLayout = {
  width: number;
  height: number;
  diameter: number;
  cords: NetworkCord[];
  junctions: NetworkJunction[];
  points: NetworkPoint[];
  diagnostics: string[];
  quality: {
    iterations: number;
    residual: number;
    converged: boolean;
    parallelPairs: number;
    crossingConflicts: NetworkPoint[];
    portConflicts: number[];
    smoothing: number;
    relaxationSteps: number;
    bowScale: number;
  };
};

const mix = (a: NetworkPoint, b: NetworkPoint, t: number): NetworkPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a: NetworkPoint, b: NetworkPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function validate(simulation: Simulation, cords: Cord[]): string | undefined {
  if (simulation.diagnostics.some(d => d.severity === 'error')) return 'Resolve the pattern errors before generating the cord network.';
  const ids = new Set(cords.map(c => c.id));
  if (ids.size !== cords.length) return 'Initial cord identities must be unique.';
  let previous = cords;
  const eventIds = new Set<number>();
  for (const e of simulation.events) {
    if (!Number.isSafeInteger(e.eventIndex) || e.eventIndex < 0) return 'Split event indices must be nonnegative integers.';
    if (eventIds.has(e.eventIndex)) return 'Split event indices must be unique.';
    eventIds.add(e.eventIndex);
    if (!ids.has(e.splitterId) || !ids.has(e.splitteeId) || e.splitterId === e.splitteeId ||
      !Number.isInteger(e.fromLane) || !Number.isInteger(e.toLane) || Math.abs(e.fromLane - e.toLane) !== 1 ||
      e.lanesBefore.length !== cords.length || e.lanesAfter.length !== cords.length ||
      e.lanesBefore.some((c, i) => c.id !== previous[i]?.id) ||
      e.lanesBefore[e.fromLane - 1]?.id !== e.splitterId || e.lanesBefore[e.toLane - 1]?.id !== e.splitteeId) return `Invalid or discontinuous split event ${e.eventIndex}.`;
    const expected = e.lanesBefore.map(c => c.id);
    [expected[e.fromLane - 1], expected[e.toLane - 1]] = [expected[e.toLane - 1], expected[e.fromLane - 1]];
    if (e.lanesAfter.some((c, i) => c.id !== expected[i])) return `Invalid exchange at split event ${e.eventIndex}.`;
    previous = e.lanesAfter;
  }
}

/** The splittee owns its crossings, so its cap has to hide the splitter's full
 * width: half a diameter where the two meet square, and more as the crossing
 * turns oblique. The reach stays inside the two incident segments, and exact
 * Bézier subdivision avoids the detached capsules a straight bridge leaves.
 */
export function junctionPatch(splittee: NetworkCord, splitter: NetworkCord, node: number, diameter: number): NetworkJunction['patch'] {
  const k = splittee.nodes.indexOf(node);
  const before = splittee.curves[k - 1].points, after = splittee.curves[k].points;
  const along = leaving(after), across = leaving(splitter.curves[splitter.nodes.indexOf(node)].points);
  // Sine of the crossing angle; the floor caps the reach for near-parallel pairs.
  const reach = diameter * 0.62 / Math.max(0.5, Math.abs(along.x * across.y - along.y * across.x));
  const at = (p: CordCurve['points']) => Math.min(0.49, reach / Math.max(1e-8, curveLength(p)));
  return [splitCurve(before, 1 - at(before))[1], splitCurve(after, at(after))[0]];
}
/** Unit direction a curve leaves its first endpoint in, robust to flat handles. */
function leaving(p: CordCurve['points']): NetworkPoint {
  const q = curvePoint(p, 0.25), length = Math.hypot(q.x - p[0].x, q.y - p[0].y);
  return length < 1e-8 ? { x: 0, y: 0 } : { x: (q.x - p[0].x) / length, y: (q.y - p[0].y) / length };
}

export function splitCurve(p: CordCurve['points'], t: number): [CordCurve['points'], CordCurve['points']] {
  const a = mix(p[0], p[1], t), b = mix(p[1], p[2], t), c = mix(p[2], p[3], t);
  const d = mix(a, b, t), e = mix(b, c, t), f = mix(d, e, t);
  return [[p[0], a, d, f], [f, e, c, p[3]]];
}
export const curvePoint = (p: CordCurve['points'], t: number) => splitCurve(p, t)[0][3];
export function curveLength(p: CordCurve['points']) {
  let length = 0, previous = p[0];
  for (let i = 1; i <= 8; i++) { const next = curvePoint(p, i / 8); length += distance(previous, next); previous = next; }
  return length;
}
const xy = (p: NetworkPoint) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
export const curvePath = (p: CordCurve['points'], move = true) => `${move ? `M${xy(p[0])}` : ''}C${xy(p[1])} ${xy(p[2])} ${xy(p[3])}`;

/** Sampled diagnostic, not a proof of finite-width physical clearance. */
export function findCurveCrossings(curves: CordCurve[]): NetworkPoint[] {
  const pieces: { a: NetworkPoint; b: NetworkPoint; curve: number; step: number }[] = [];
  const bins = new Map<string, number[]>(), reported = new Set<string>(), checked = new Set<string>();
  const conflicts: NetworkPoint[] = [];
  curves.forEach((curve, c) => {
    let a = curve.points[0];
    for (let k = 1; k <= 12; k++) {
      const b = curvePoint(curve.points, k / 12), i = pieces.length;
      pieces.push({ a, b, curve: c, step: k });
      for (let x = Math.floor(Math.min(a.x, b.x)); x <= Math.floor(Math.max(a.x, b.x)); x++) {
        for (let y = Math.floor(Math.min(a.y, b.y)); y <= Math.floor(Math.max(a.y, b.y)); y++) {
          const key = `${x}:${y}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key)!.push(i);
        }
      }
      a = b;
    }
  });
  for (const items of bins.values()) for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const i = items[a], j = items[b], p = pieces[i], q = pieces[j];
    if (p.curve === q.curve && Math.abs(p.step - q.step) <= 1) continue;
    const pair = `${Math.min(p.curve, q.curve)}:${Math.max(p.curve, q.curve)}`, key = `${i}:${j}`;
    if (reported.has(pair) || checked.has(key)) continue;
    checked.add(key);
    const ux = p.b.x - p.a.x, uy = p.b.y - p.a.y, vx = q.b.x - q.a.x, vy = q.b.y - q.a.y;
    const denominator = ux * vy - uy * vx;
    if (Math.abs(denominator) < 1e-10) continue;
    const dx = q.a.x - p.a.x, dy = q.a.y - p.a.y;
    const t = (dx * vy - dy * vx) / denominator, s = (dx * uy - dy * ux) / denominator;
    if (t >= -1e-7 && t <= 1 + 1e-7 && s >= -1e-7 && s <= 1 + 1e-7) {
      const point = mix(p.a, p.b, t), ca = curves[p.curve], cb = curves[q.curve];
      const legalJunction = [ca.from, ca.to].some(node => (node === cb.from || node === cb.to) && distance(point, ca.points[node === ca.from ? 0 : 3]) < 1e-6);
      if (legalJunction && p.curve !== q.curve) continue;
      reported.add(pair); conflicts.push(point);
    }
  }
  return conflicts;
}

export function portConflicts(events: SplitEvent[], cords: NetworkCord[]) {
  const ports = new Map<string, NetworkPoint>();
  for (const c of cords) for (const curve of c.curves) {
    ports.set(`${curve.from}:${c.id}:out`, { x: curve.points[1].x - curve.points[0].x, y: curve.points[1].y - curve.points[0].y });
    ports.set(`${curve.to}:${c.id}:in`, { x: curve.points[2].x - curve.points[3].x, y: curve.points[2].y - curve.points[3].y });
  }
  return events.flatMap((e, i) => {
    const a = e.lanesBefore[Math.min(e.fromLane, e.toLane) - 1].id;
    const b = e.lanesBefore[Math.max(e.fromLane, e.toLane) - 1].id;
    const directions = [`${a}:in`, `${b}:in`, `${a}:out`, `${b}:out`].map(key => ports.get(`${i}:${key}`)!);
    const angles = directions.map(p => Math.atan2(p.y, p.x));
    const turns = angles.map((a, k) => (angles[(k + 1) % 4] - a + 2 * Math.PI) % (2 * Math.PI));
    return directions.some(p => Math.hypot(p.x, p.y) < 1e-7) || turns.some(t => t < 1e-5) || Math.abs(turns.reduce((s, t) => s + t, 0) - 2 * Math.PI) > 1e-5 ? [e.eventIndex] : [];
  });
}

export type NetworkRenderOptions = {
  colors: Record<string, string>;
  face?: 'front' | 'back';
  showEventIds?: boolean;
  centerlines?: boolean;
  surface?: boolean;
};
const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Shared by the live preview and the reproducible photo-comparison exporter. */
export function renderCordNetworkSvg(layout: CordNetworkLayout, options: NetworkRenderOptions): string {
  const { width, height, diameter: d } = layout;
  const color = new Map(layout.cords.map(c => [c.id, escapeXml(options.colors[c.colorSymbol] ?? '#a89b84')]));
  const stroke = (path: string, fill: string, cap = 'round') => `<path d="${path}" stroke="${fill}" stroke-width="${d}" stroke-linecap="${cap}"/>`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Experimental continuous cord network, ${layout.junctions.length} split events" style="display:block;width:100%;height:auto"><g transform="${options.face === 'back' ? `translate(${width} 0) scale(-1 1)` : ''}" fill="none" stroke-linejoin="round">`;
  for (const c of layout.cords) {
    const path = c.curves.map((s, i) => curvePath(s.points, i === 0)).join('');
    svg += `<g data-cord-id="${escapeXml(c.id)}"><title>${escapeXml(c.id)} · ${escapeXml(c.colorSymbol)}</title>${stroke(path, color.get(c.id)!)}</g>`;
  }
  if (options.surface) for (const patch of networkSurfacePatches(layout)) {
    const j = layout.junctions[patch.node];
    svg += `<path d="${patch.path}" fill="${color.get(j.event.splitteeId)}" stroke="${color.get(j.event.splitteeId)}" stroke-width=".015" data-event-index="${j.event.eventIndex}"/>`;
  }
  for (const j of layout.junctions) {
    const e = j.event, path = j.patch.map((p, i) => curvePath(p, i === 0)).join('');
    const title = `Split ${e.eventIndex} · row ${e.rowInstance} (source ${e.sourceRow}) · ${e.splitterId} through ${e.splitteeId}`;
    svg += `<g data-event-index="${e.eventIndex}"><title>${escapeXml(title)}</title>${options.surface ? `<path d="${path}" stroke="${color.get(e.splitteeId)}" stroke-width="${d}" stroke-linecap="butt"/>` : stroke(path, color.get(e.splitteeId)!, 'butt')}`;
    svg += '</g>';
  }
  if (options.centerlines) {
    for (const c of layout.cords) svg += `<path d="${c.curves.map((s, i) => curvePath(s.points, i === 0)).join('')}" stroke="#161c21" stroke-width=".035" stroke-opacity=".7" pointer-events="none"/>`;
    for (const j of layout.junctions) svg += `<circle cx="${j.position.x}" cy="${j.position.y}" r=".09" fill="#161c21" pointer-events="none"/>`;
  }
  if (options.showEventIds) for (const j of layout.junctions) {
    svg += `<text transform="translate(${j.position.x} ${j.position.y})${options.face === 'back' ? ' scale(-1 1)' : ''}" fill="#211b22" stroke="#fff9ec" stroke-width=".055" paint-order="stroke" font-family="monospace" font-size=".28" text-anchor="middle" dominant-baseline="central" pointer-events="none">${j.event.eventIndex}</text>`;
  }
  for (const p of layout.quality.crossingConflicts) svg += `<circle cx="${p.x}" cy="${p.y}" r=".3" stroke="#e02d25" stroke-width=".08" pointer-events="none"/>`;
  return `${svg}</g></svg>`;
}

/** Median dual of the embedded contact graph: a dense surface approximation.
 * Its cells follow actual cord curves and transition faces, not a lane grid.
 * All graph regions are partitioned among their incident splittee surfaces.
 */
export function networkSurfacePatches(layout: CordNetworkLayout): { node: number; path: string }[] {
  type Dart = { from: number; to: number; twin: number; points: CordCurve['points'] };
  const darts: Dart[] = [], around = new Map<number, number[]>();
  const add = (d: Dart) => {
    if (!around.has(d.from)) around.set(d.from, []);
    around.get(d.from)!.push(darts.length); darts.push(d);
  };
  for (const cord of layout.cords) for (const c of cord.curves) {
    const i = darts.length;
    add({ from: c.from, to: c.to, twin: i + 1, points: c.points });
    add({ from: c.to, to: c.from, twin: i, points: [...c.points].reverse() as CordCurve['points'] });
  }
  for (const ids of around.values()) ids.sort((a, b) => {
    const angle = (i: number) => Math.atan2(darts[i].points[1].y - darts[i].points[0].y, darts[i].points[1].x - darts[i].points[0].x);
    return angle(a) - angle(b);
  });
  const seen = new Set<number>(), patches: { node: number; path: string }[] = [];
  for (let first = 0; first < darts.length; first++) {
    if (seen.has(first)) continue;
    const face: Dart[] = []; let current = first;
    do {
      if (seen.has(current)) break;
      seen.add(current);
      const d = darts[current]; face.push(d);
      const ids = around.get(d.to)!;
      current = ids[(ids.indexOf(d.twin) + 1) % ids.length];
    } while (current !== first);
    if (current !== first || face.some(d => d.from >= layout.junctions.length)) continue;
    const samples = face.flatMap(d => Array.from({ length: 8 }, (_, k) => curvePoint(d.points, k / 8)));
    const center = { x: samples.reduce((s, p) => s + p.x, 0) / samples.length, y: samples.reduce((s, p) => s + p.y, 0) / samples.length };
    face.forEach((d, i) => {
      const outgoing = splitCurve(d.points, 0.5)[0];
      const incoming = splitCurve(face[(i + face.length - 1) % face.length].points, 0.5)[1];
      patches.push({ node: d.from, path: `${curvePath(outgoing)}L${xy(center)}L${xy(incoming[0])}${curvePath(incoming, false)}Z` });
    });
  }
  return patches;
}
