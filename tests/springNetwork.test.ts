import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSpringNetwork, resolveSpringProfile } from '../src/domain/springNetwork.ts';
import { curvePoint, networkSurfacePatches, renderCordNetworkSvg } from '../src/domain/cordNetwork.ts';
import type { CordNetworkLayout } from '../src/domain/cordNetwork.ts';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { colorBlock8Pattern } from '../src/examples/colorBlock8.ts';
import type { Simulation } from '../src/domain/types.ts';

function simulate(source = wayuuFajon20Pattern, repeats = 1) {
  const parsed = parsePattern(source);
  assert.ok(parsed.pattern);
  assert.deepEqual(parsed.diagnostics, []);
  return simulatePattern(parsed.pattern, repeats);
}
const eyes = simulate();
const layout = buildSpringNetwork(eyes);

/** Realised crossing angle at a junction: directions to the midpoints of the two outgoing curves, in degrees. */
function crossingAngles(result: CordNetworkLayout, events: Simulation['events']) {
  return events.map((e, i) => {
    const gap = Math.min(e.fromLane, e.toLane);
    const tangents = [e.lanesBefore[gap - 1].id, e.lanesBefore[gap].id].map(id => {
      const cord = result.cords.find(c => c.id === id)!, curve = cord.curves[cord.nodes.indexOf(i)].points;
      const mid = curvePoint(curve, 0.5);
      return { x: mid.x - curve[0].x, y: mid.y - curve[0].y };
    });
    const [u, v] = tangents;
    return Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180 / Math.PI;
  });
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('Eyes keeps every cord visit and terminal in the shared layout contract', () => {
  assert.equal(layout.cords.length, 20);
  assert.equal(layout.junctions.length, 173);
  assert.equal(layout.points.length, 213);
  assert.equal(layout.cords.reduce((n, c) => n + c.curves.length, 0), 366);
  for (const cord of layout.cords) {
    const expected = eyes.events.flatMap((e, i) => e.splitterId === cord.id || e.splitteeId === cord.id ? [i] : []);
    assert.deepEqual(cord.nodes.slice(1, -1), expected);
    cord.curves.forEach((curve, k) => {
      assert.equal(curve.from, cord.nodes[k]);
      assert.equal(curve.to, cord.nodes[k + 1]);
      assert.deepEqual(curve.points[0], layout.points[curve.from]);
      assert.deepEqual(curve.points[3], layout.points[curve.to]);
    });
  }
  layout.junctions.forEach((j, i) => {
    assert.equal(j.event.eventIndex, i);
    assert.deepEqual(j.patch[0][3], j.position);
    assert.deepEqual(j.patch[1][0], j.position);
  });
  assert.ok(layout.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0 && p.x < layout.width && p.y < layout.height));
});

test('Eyes settles without folds or crossings, keeps its digons open, and fills the surface', () => {
  assert.deepEqual(layout.diagnostics, []);
  assert.equal(layout.quality.converged, true);
  assert.ok(layout.quality.residual < resolveSpringProfile().tolerance);
  assert.deepEqual(layout.quality.crossingConflicts, []);
  assert.deepEqual(layout.quality.portConflicts, []);
  assert.equal(layout.quality.parallelPairs, 2);
  for (const [from, to] of [[61, 78], [75, 91]]) {
    const curves = layout.cords.flatMap(c => c.curves).filter(c => c.from === from && c.to === to);
    assert.equal(curves.length, 2);
    assert.ok(Math.hypot(curves[0].points[1].x - curves[1].points[1].x, curves[0].points[1].y - curves[1].points[1].y) > 0.3);
  }
  assert.equal(networkSurfacePatches(layout).length, 600);
  const angles = crossingAngles(layout, eyes.events);
  assert.ok(Math.abs(median(angles) - 2 * resolveSpringProfile().theta * 180 / Math.PI) < 6, `median crossing angle ${median(angles)}`);
});

test('the chevron is a uniform lattice at the profile crossing angle', () => {
  const chevron = simulate(chevronPattern, 8), result = buildSpringNetwork(chevron, { elongation: 1.35 });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.quality.converged, true);
  const angles = crossingAngles(result, chevron.events), target = 2 * Math.atan(1 / 1.35) * 180 / Math.PI;
  assert.ok(angles.every(a => Math.abs(a - target) < 4), `angles ${angles.map(a => a.toFixed(1)).join(' ')}`);
  const wide = buildSpringNetwork(chevron, { elongation: 0.8 });
  assert.ok(Math.abs(median(crossingAngles(wide, chevron.events)) - 2 * Math.atan(1 / 0.8) * 180 / Math.PI) < 4);
  assert.ok(wide.width > result.width && wide.height < result.height);
});

test('geometry is unchanged by recolouring and bijective cord renaming, and deterministic', () => {
  const plain = simulate(wayuuFajon20Pattern.replace('AABCBBCBAAAABCBBCBAA', 'AAAAAAAAAAAAAAAAAAAA'));
  assert.deepEqual(buildSpringNetwork(plain).points, layout.points);
  const renamed = JSON.parse(JSON.stringify(eyes).replace(/C(\d\d)/g, 'strand-$1')) as Simulation;
  assert.deepEqual(buildSpringNetwork(renamed).points, layout.points);
  assert.deepEqual(buildSpringNetwork(eyes).points, layout.points);
});

test('removing visually redundant splits changes the generated network', () => {
  const ast = parsePattern(wayuuFajon20Pattern).pattern!;
  const altered = simulatePattern({ ...ast, rows: ast.rows.filter(r => ![5, 6, 15].includes(r.number)) }, 1);
  const result = buildSpringNetwork(altered);
  assert.equal(result.junctions.length, 170);
  assert.notDeepEqual(result.points.slice(0, 100), layout.points.slice(0, 100));
});

test('progress reports increase and can build intermediate layouts with the full contract', () => {
  const seen: number[] = [];
  let intermediate: CordNetworkLayout | undefined;
  const final = buildSpringNetwork(simulate(colorBlock8Pattern, 4), { polishSteps: 400 }, (progress, build) => {
    seen.push(progress);
    if (!intermediate) intermediate = build();
  });
  assert.ok(seen.length > 2);
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]));
  assert.ok(seen.every(v => v >= 0 && v <= 1));
  assert.ok(intermediate);
  assert.equal(intermediate!.junctions.length, final.junctions.length);
  assert.equal(intermediate!.cords.length, final.cords.length);
  assert.ok(renderCordNetworkSvg(intermediate!, { colors: { A: 'red', B: 'blue', C: 'green' }, surface: true }).includes('<svg'));
});

test('empty, untouched, and broken histories behave like the harmonic model', () => {
  const noEvents = { events: [], snapshots: [eyes.snapshots[0]], diagnostics: [], totalRows: 0 };
  const result = buildSpringNetwork(noEvents);
  assert.equal(result.cords.length, 20);
  assert.ok(result.cords.every(c => c.curves.length === 1));
  assert.match(result.diagnostics[0], /No splits yet/);
  const empty = buildSpringNetwork({ events: [], snapshots: [], diagnostics: [], totalRows: 0 });
  assert.ok(Number.isFinite(empty.width) && Number.isFinite(empty.height));
  const broken = structuredClone(eyes);
  broken.events[2].splitteeId = 'missing';
  const failed = buildSpringNetwork(broken);
  assert.equal(failed.junctions.length, 0);
  assert.match(failed.diagnostics[0], /Invalid or discontinuous/);
});

test('a multi-block Eyes preview stays finite and traceable within the solver budget', () => {
  const started = Date.now();
  const result = buildSpringNetwork(simulate(wayuuFajon20Pattern, 3));
  const elapsed = Date.now() - started;
  assert.equal(result.junctions.length, 519);
  assert.ok(result.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(result.quality.parallelPairs, 10);
  assert.ok(result.quality.crossingConflicts.length <= 8, `crossings ${result.quality.crossingConflicts.length}`);
  assert.ok(elapsed < 30000, `took ${elapsed} ms`);
});
