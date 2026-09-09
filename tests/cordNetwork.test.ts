import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCordNetwork, curvePoint, findCurveCrossings, networkSurfacePatches, renderCordNetworkSvg, splitCurve } from '../src/domain/cordNetwork.ts';
import type { CordCurve } from '../src/domain/cordNetwork.ts';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';
import { eyes36Pattern } from '../src/examples/eyes36.ts';
import { arrowPattern } from '../src/examples/arrow.ts';
import { braid16Pattern } from '../src/examples/braid16.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { colorBlock8Pattern } from '../src/examples/colorBlock8.ts';
import { doubleChevron24Pattern } from '../src/examples/doubleChevron24.ts';
import type { Simulation } from '../src/domain/types.ts';

function simulate(source = wayuuFajon20Pattern, repeats = 1) {
  const parsed = parsePattern(source);
  assert.ok(parsed.pattern);
  assert.deepEqual(parsed.diagnostics, []);
  return simulatePattern(parsed.pattern, repeats);
}
const eyes = simulate();
const layout = buildCordNetwork(eyes);

test('Eyes retains every cord visit, same-colour split, and terminal', () => {
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
  for (const index of [76, 77, 172]) assert.equal(layout.junctions[index].event.eventIndex, index);
});

test('repeated pair meetings retain distinct curved segments and all transition regions', () => {
  assert.equal(layout.quality.parallelPairs, 2);
  for (const [from, to] of [[61, 78], [75, 91]]) {
    const curves = layout.cords.flatMap(c => c.curves).filter(c => c.from === from && c.to === to);
    assert.equal(curves.length, 2);
    assert.notDeepEqual(curvePoint(curves[0].points, .5), curvePoint(curves[1].points, .5));
  }
  const patches = networkSurfacePatches(layout);
  // Independent audit: 2*2 + 16*3 + 132*4 + 4*5 incidences in bounded faces.
  assert.equal(patches.length, 600);
  assert.ok(patches.every(p => p.node >= 0 && p.node < 173 && !/NaN|Infinity/.test(p.path)));
});

test('geometry is unchanged by recolouring and bijective cord renaming', () => {
  const plain = simulate(wayuuFajon20Pattern.replace('AABCBBCBAAAABCBBCBAA', 'AAAAAAAAAAAAAAAAAAAA'));
  assert.deepEqual(buildCordNetwork(plain).points, layout.points);
  const renamed = JSON.parse(JSON.stringify(eyes).replace(/C(\d\d)/g, 'strand-$1')) as Simulation;
  assert.deepEqual(buildCordNetwork(renamed).points, layout.points);
});

test('removing visually redundant splits changes the generated network', () => {
  const ast = parsePattern(wayuuFajon20Pattern).pattern!;
  const altered = simulatePattern({ ...ast, rows: ast.rows.filter(r => ![5, 6, 15].includes(r.number)) }, 1);
  const result = buildCordNetwork(altered);
  assert.equal(result.junctions.length, 170);
  const originalPairs = eyes.events.filter(e => ![5, 6, 15].includes(e.sourceRow));
  const changed = altered.events.filter((e, i) => e.splitterId !== originalPairs[i].splitterId || e.splitteeId !== originalPairs[i].splitteeId);
  assert.equal(changed.length, 35);
  assert.notDeepEqual(result.points, layout.points);
});

test('all sample networks preserve projected crossing and port topology', () => {
  for (const source of [wayuuFajon20Pattern, eyes36Pattern, arrowPattern, braid16Pattern, chevronPattern, colorBlock8Pattern, doubleChevron24Pattern]) {
    const result = buildCordNetwork(simulate(source, 3));
    assert.deepEqual(result.diagnostics, [], source.split('\n')[0]);
    assert.equal(result.quality.converged, true);
    assert.deepEqual(result.quality.crossingConflicts, []);
    assert.deepEqual(result.quality.portConflicts, []);
    assert.ok(result.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});

test('a long Eyes preview preserves cord identities across the full cycle', () => {
  const result = buildCordNetwork(simulate(wayuuFajon20Pattern, 10));
  assert.equal(result.junctions.length, 1730);
  assert.deepEqual(result.diagnostics, []);
  for (const c of result.cords) assert.equal(result.points[c.nodes[0]].x, result.points[c.nodes.at(-1)!].x);
});

test('empty and untouched cords remain represented; broken event histories fail visibly', () => {
  const noEvents = { events: [], snapshots: [eyes.snapshots[0]], diagnostics: [], totalRows: 0 };
  const result = buildCordNetwork(noEvents);
  assert.equal(result.cords.length, 20);
  assert.ok(result.cords.every(c => c.curves.length === 1));
  const empty = buildCordNetwork({ events: [], snapshots: [], diagnostics: [], totalRows: 0 });
  assert.ok(Number.isFinite(empty.width) && Number.isFinite(empty.height));
  const broken = structuredClone(eyes);
  broken.events[2].splitteeId = 'missing';
  const failed = buildCordNetwork(broken);
  assert.equal(failed.junctions.length, 0);
  assert.match(failed.diagnostics[0], /Invalid or discontinuous/);
});

test('local split patches are exact subdivisions of the continuous cord curves', () => {
  const p = layout.cords[0].curves[4].points;
  const [a, b] = splitCurve(p, .37);
  for (const t of [0, .25, .5, .75, 1]) {
    const first = curvePoint(a, t), originalFirst = curvePoint(p, .37 * t);
    const second = curvePoint(b, t), originalSecond = curvePoint(p, .37 + .63 * t);
    assert.ok(Math.hypot(first.x - originalFirst.x, first.y - originalFirst.y) < 1e-10);
    assert.ok(Math.hypot(second.x - originalSecond.x, second.y - originalSecond.y) < 1e-10);
  }
  layout.junctions.forEach(j => {
    assert.deepEqual(j.patch[0][3], j.position);
    assert.deepEqual(j.patch[1][0], j.position);
  });
});

test('crossing diagnostics catch intersections exactly on sampling boundaries', () => {
  const line = (id: string, from: number, to: number, a: {x:number;y:number}, b: {x:number;y:number}): CordCurve => ({ id, cordId: id, from, to,
    points: [a, { x: a.x + (b.x-a.x)/3, y: a.y + (b.y-a.y)/3 }, { x: a.x + (b.x-a.x)*2/3, y: a.y + (b.y-a.y)*2/3 }, b] });
  const a = line('a', 0, 1, {x:0,y:0}, {x:2,y:2});
  const b = line('b', 2, 3, {x:0,y:2}, {x:2,y:0});
  assert.equal(findCurveCrossings([a,b]).length, 1);
  const c = line('c', 1, 4, {x:2,y:2}, {x:3,y:1});
  assert.equal(findCurveCrossings([a,c]).length, 0);
});

test('SVG export mirrors one object, retains all events, and escapes external text', () => {
  const front = renderCordNetworkSvg(layout, { colors: { A: '#655069', B: 'white', C: 'cyan' }, surface: true });
  const back = renderCordNetworkSvg(layout, { colors: { A: '#655069', B: 'white', C: 'cyan' }, face: 'back', surface: true, showEventIds: true });
  assert.equal((front.match(/<title>Split /g) ?? []).length, 173);
  assert.equal((back.match(/<title>Split /g) ?? []).length, 173);
  assert.match(back, /scale\(-1 1\)/);
  const injection = renderCordNetworkSvg(layout, { colors: { A: '\"><script>alert(1)</script>' } });
  assert.ok(!injection.includes('<script>'));
  assert.ok(!front.includes('expected-layouts'));
  assert.ok(!/NaN|Infinity/.test(front));
});
