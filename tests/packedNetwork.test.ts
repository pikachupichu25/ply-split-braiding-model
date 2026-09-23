import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPackedNetwork, pullForTheta, resolvePackedProfile } from '../src/domain/packedNetwork.ts';
import { buildElasticNetwork } from '../src/domain/elasticNetwork.ts';
import { renderCordNetworkSvg } from '../src/domain/cordNetwork.ts';
import type { CordNetworkLayout } from '../src/domain/cordNetwork.ts';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import type { Simulation } from '../src/domain/types.ts';

function simulate(source = chevronPattern, repeats = 8) {
  const parsed = parsePattern(source);
  assert.ok(parsed.pattern);
  assert.deepEqual(parsed.diagnostics, []);
  return simulatePattern(parsed.pattern, repeats);
}

/** Straight-line distance between consecutive junctions of one cord, split by whether the cord reverses there. */
function segmentChords(layout: CordNetworkLayout, sim: Simulation) {
  const events = sim.events, n = sim.snapshots[0].lanes.length, E = events.length;
  const dirAt = (id: string, i: number) => (events[i].splitterId === id ? 1 : -1) * Math.sign(events[i].toLane - events[i].fromLane);
  const gapOf = (i: number) => Math.min(events[i].fromLane, events[i].toLane);
  const regular: number[] = [], reversing: number[] = [];
  for (const cord of layout.cords) {
    const visits = cord.nodes.filter(k => k < E);
    for (let k = 1; k < visits.length; k++) {
      const a = visits[k - 1], b = visits[k];
      const d = Math.hypot(layout.points[a].x - layout.points[b].x, layout.points[a].y - layout.points[b].y);
      (dirAt(cord.id, a) !== dirAt(cord.id, b) ? reversing : regular).push(d);
    }
    void n; void gapOf;
  }
  return { regular, reversing };
}
/** Crossing angle at each junction, between the straight lines to the next junction along either cord. */
function crossingAngles(layout: CordNetworkLayout, sim: Simulation) {
  const E = sim.events.length;
  return sim.events.flatMap((e, i) => {
    const gap = Math.min(e.fromLane, e.toLane);
    const legs = [e.lanesBefore[gap - 1].id, e.lanesBefore[gap].id].map(id => {
      const cord = layout.cords.find(c => c.id === id)!, k = cord.nodes.indexOf(i);
      const next = cord.nodes[k + 1];
      return next !== undefined && next < E ? { x: layout.points[next].x - layout.points[i].x, y: layout.points[next].y - layout.points[i].y } : undefined;
    });
    const [u, v] = legs;
    if (!u || !v) return [];                                    // a leg running into a loose tail says nothing
    return [Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180 / Math.PI];
  });
}
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const chevron = simulate();
const layout = buildPackedNetwork(chevron);

test('the packed chevron keeps the shared layout contract', () => {
  assert.equal(layout.cords.length, 8);
  assert.equal(layout.junctions.length, chevron.events.length);
  assert.equal(layout.points.length, chevron.events.length + 2 * 8);
  for (const cord of layout.cords) {
    const expected = chevron.events.flatMap((e, i) => e.splitterId === cord.id || e.splitteeId === cord.id ? [i] : []);
    assert.deepEqual(cord.nodes.slice(1, -1), expected);
    assert.equal(cord.curves.length, cord.nodes.length - 1);
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

test('the chevron settles into a packed lattice with no folds or crossings', () => {
  assert.equal(layout.quality.converged, true);
  assert.deepEqual(layout.quality.crossingConflicts, []);
  assert.deepEqual(layout.quality.portConflicts, []);
  assert.deepEqual(layout.diagnostics, []);
});

test('the pitch is a result: segments come out at one diameter over the sine of the realised angle', () => {
  // Nothing in this model has a rest length, so this relation is a prediction rather than a setting.
  const { regular } = segmentChords(layout, chevron);
  const angle = median(crossingAngles(layout, chevron));
  const predicted = 1 / Math.sin(angle * Math.PI / 180);
  assert.ok(Math.abs(mean(regular) - predicted) < 0.03, `mean segment ${mean(regular).toFixed(3)} against d / sin ${angle.toFixed(1)}° = ${predicted.toFixed(3)}`);
  const spread = Math.sqrt(mean(regular.map(r => (r - mean(regular)) ** 2)));
  assert.ok(spread < 0.05, `segment spread ${spread.toFixed(3)}`);
});

test('the working pull is the only dial: a harder pull narrows the strip and closes the crossing', () => {
  const slack = buildPackedNetwork(chevron, { pull: 0.386 });
  const taut = buildPackedNetwork(chevron, { pull: 0.77 });
  const angleOf = (l: CordNetworkLayout) => median(crossingAngles(l, chevron));
  assert.ok(angleOf(taut) < angleOf(slack) - 10, `taut ${angleOf(taut).toFixed(1)}° vs slack ${angleOf(slack).toFixed(1)}°`);
  assert.ok(taut.height > slack.height, `taut ${taut.height.toFixed(1)} vs slack ${slack.height.toFixed(1)}`);
  assert.ok(taut.width < slack.width, `taut ${taut.width.toFixed(1)} vs slack ${slack.width.toFixed(1)}`);
  // The sheet formula that maps the slider onto that dial.
  assert.ok(Math.abs(pullForTheta(Math.atan(1 / 1.35)) - 0.562) < 0.002);
  assert.ok(Math.abs(pullForTheta(Math.PI / 4)) < 1e-12, 'a square lattice needs no pull');
  assert.ok(resolvePackedProfile({ elongation: 1 }).pull < 1e-12);
});

test('packed clears the topology conflicts its elastic seed arrives with, on one block of Eyes', () => {
  const eyes = simulate(wayuuFajon20Pattern, 1);
  const seed = buildElasticNetwork(eyes);
  const packed = buildPackedNetwork(eyes, { steps: 4000 });
  assert.ok(seed.quality.crossingConflicts.length + seed.quality.portConflicts.length > 0,
    'the seed is expected to arrive with conflicts; if it no longer does, this test has stopped proving anything');
  assert.deepEqual(packed.quality.crossingConflicts, []);
  assert.deepEqual(packed.quality.portConflicts, []);
  assert.equal(packed.junctions.length, eyes.events.length);
  assert.equal(packed.quality.parallelPairs, 2);
});

test('geometry ignores colour and cord names, and repeats exactly', () => {
  const plain = simulate(chevronPattern.replace('color: CBAAAABC', 'color: AAAAAAAA'), 8);
  assert.deepEqual(buildPackedNetwork(plain).points, layout.points);
  const renamed = JSON.parse(JSON.stringify(chevron).replace(/C(\d\d)/g, 'strand-$1')) as Simulation;
  assert.deepEqual(buildPackedNetwork(renamed).points, layout.points);
  assert.deepEqual(buildPackedNetwork(chevron).points, layout.points);
});

test('progress rises to a usable intermediate layout and the time budget is honoured', () => {
  const seen: number[] = [];
  let intermediate: CordNetworkLayout | undefined;
  const eyes = simulate(wayuuFajon20Pattern, 1);
  const started = Date.now();
  const final = buildPackedNetwork(eyes, { budgetMs: 2000, steps: 60000 }, (progress, build) => {
    seen.push(progress);
    if (!intermediate) intermediate = build();
  });
  const elapsed = Date.now() - started;
  assert.ok(seen.length > 1);
  assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]), `progress ${seen.join(' ')}`);
  assert.ok(seen.every(v => v >= 0 && v <= 1));
  assert.ok(intermediate);
  assert.equal(intermediate!.junctions.length, final.junctions.length);
  assert.ok(renderCordNetworkSvg(intermediate!, { colors: { A: 'red', B: 'blue', C: 'green' }, surface: true }).includes('<svg'));
  assert.ok(elapsed < 20000, `budgeted solve took ${elapsed} ms`);
  assert.match(final.diagnostics.join(' '), /time budget/);
});

test('empty, untouched, and broken histories behave like the other models', () => {
  const eyes = simulate(wayuuFajon20Pattern, 1);
  const noEvents = { events: [], snapshots: [eyes.snapshots[0]], diagnostics: [], totalRows: 0 };
  const result = buildPackedNetwork(noEvents);
  assert.equal(result.cords.length, 20);
  assert.ok(result.cords.every(c => c.curves.length === 1));
  assert.match(result.diagnostics[0], /No splits yet/);
  const empty = buildPackedNetwork({ events: [], snapshots: [], diagnostics: [], totalRows: 0 });
  assert.ok(Number.isFinite(empty.width) && Number.isFinite(empty.height));
  const broken = structuredClone(eyes);
  broken.events[2].splitteeId = 'missing';
  const failed = buildPackedNetwork(broken);
  assert.equal(failed.junctions.length, 0);
  assert.match(failed.diagnostics[0], /Invalid or discontinuous/);
});
