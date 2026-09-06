import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinishedLayout } from '../src/domain/finishedLayout.ts';
import { buildFinishedSurfaces } from '../src/domain/finishedSurface.ts';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { doubleChevron24Pattern } from '../src/examples/doubleChevron24.ts';
import { mirroredDiamonds24Pattern } from '../src/examples/mirroredDiamonds24.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';

function simulate(source: string) {
  const parsed = parsePattern(source);
  assert.ok(parsed.pattern);
  return simulatePattern(parsed.pattern, 4);
}

function assertVisibleContinuity(cells: ReturnType<typeof buildFinishedLayout>['cells']) {
  const lastParticipation = new Map<string, typeof cells[number]>();
  for (const cell of cells) {
    const previous = lastParticipation.get(cell.event.splitteeId);
    if (previous?.event.splitteeId === cell.event.splitteeId) {
      const adjacent = Math.abs(previous.column - cell.column) === 1;
      if (adjacent) {
        const boundary = cell.points.find(p => previous.points.some(q => Math.abs(p.x - q.x) < 0.001))!.x;
        const previousEdge = previous.points.filter(p => Math.abs(p.x - boundary) < 0.001).map(p => p.y);
        const currentEdge = cell.points.filter(p => Math.abs(p.x - boundary) < 0.001).map(p => p.y);
        assert.equal(previousEdge.length, 2);
        assert.equal(currentEdge.length, 2);
        assert.ok(Math.abs(Math.min(...previousEdge) - Math.min(...currentEdge)) < 0.000001
          && Math.abs(Math.max(...previousEdge) - Math.max(...currentEdge)) < 0.000001,
        `${cell.event.splitteeId} edges are misaligned between events ${previous.event.eventIndex} and ${cell.event.eventIndex}`);
      }
    }
    lastParticipation.set(cell.event.splitteeId, cell);
    lastParticipation.set(cell.event.splitterId, cell);
  }
}

function assertColumnPacking(cells: ReturnType<typeof buildFinishedLayout>['cells']) {
  for (const [index, cell] of cells.entries()) {
    for (const above of cells.slice(0, index)) {
      if (above.column !== cell.column) continue;
      for (const x of new Set(cell.points.map(p => p.x))) {
        const upperBottom = Math.max(...above.points.filter(p => Math.abs(p.x - x) < 0.001).map(p => p.y));
        const lowerTop = Math.min(...cell.points.filter(p => Math.abs(p.x - x) < 0.001).map(p => p.y));
        assert.ok(Number.isFinite(upperBottom) && Number.isFinite(lowerTop));
        assert.ok(lowerTop >= upperBottom - 0.000001,
          `column ${cell.column}: events ${above.event.eventIndex} and ${cell.event.eventIndex} overlap`);
      }
    }
  }
}

test('Wayuu columns 5–9 stack after both turns without breaking adjacent splittee joins', () => {
  const simulation = simulate(wayuuFajon20Pattern);
  const layout = buildFinishedLayout(simulation);
  const affected = layout.cells.filter(cell => cell.column >= 5 && cell.column <= 9);
  assert.ok(affected.some(cell => cell.event.sourceRow >= 7));
  assert.ok(affected.some(cell => cell.event.sourceRow >= 12), 'include the sample’s second turn');
  assertColumnPacking(affected);
  assertColumnPacking(layout.cells);
  assertVisibleContinuity(layout.cells);
  assert.equal(layout.cells.length, simulation.events.length);
});

test('Wayuu splittees align their full edges across short steps and the returning section', () => {
  for (const source of [wayuuFajon20Pattern,
    wayuuFajon20Pattern.replace('AABCBBCBAAAABCBBCBAA', 'A'.repeat(20))]) {
    const simulation = simulate(source);
    const before = JSON.stringify(simulation);
    const layout = buildFinishedLayout(simulation);
    assertVisibleContinuity(layout.cells);
    // The same-gap return stacks; the adjacent-gap continuation aligns.
    assertColumnPacking([layout.cells[65], layout.cells[82]]);
    assertVisibleContinuity([layout.cells[77], layout.cells[85]]);
    assert.equal(layout.cells[65].event.splitteeId, 'C03');
    assert.equal(layout.cells[82].event.splitteeId, 'C03');
    assert.equal(layout.cells[77].event.splitteeId, 'C20');
    assert.equal(layout.cells[85].event.splitteeId, 'C20');
    assert.equal(JSON.stringify(simulation), before);
    assert.deepEqual(buildFinishedLayout(simulation), layout);
    assert.equal(layout.cells.length, simulation.events.length);
  }
});

test('mirrored diamonds connect C18/C01 to C07/C01 across the change in braiding steps', () => {
  for (const source of [mirroredDiamonds24Pattern,
    mirroredDiamonds24Pattern.replace('ABCDEFFEDCBAABCDEFFEDCBA', 'A'.repeat(24))]) {
    const simulation = simulate(source);
    const layout = buildFinishedLayout(simulation);
    assertVisibleContinuity(layout.cells);
    const before = layout.cells.find(c => c.event.splitterId === 'C18' && c.event.splitteeId === 'C01')!;
    const after = layout.cells.find(c => c.event.splitterId === 'C07' && c.event.splitteeId === 'C01')!;
    assert.ok(before && after);
    assert.equal(after.column, before.column + 1);
    const previousBottom = Math.max(before.points[0].y, before.points[3].y);
    const nextTop = Math.min(...after.points.filter(p => p.x === before.points[0].x).map(p => p.y));
    assert.ok(previousBottom - nextTop > 1, 'the cord joins across a visible edge, not just a point');
    assert.equal(layout.cells.length, simulation.events.length);

    const reflected = simulate(source);
    reflected.events = reflected.events.map(event => ({
      ...event, fromLane: 25 - event.fromLane, toLane: 25 - event.toLane,
    }));
    const back = buildFinishedLayout(reflected);
    assertVisibleContinuity(back.cells);
    for (const [index, cell] of layout.cells.entries()) {
      const points = back.cells[index].points;
      for (const p of cell.points) {
        assert.ok(points.some(q => Math.abs(q.x - (layout.width - p.x)) < 0.001
          && Math.abs(q.y - p.y) < 0.001), 'layout must mirror without cord- or column-specific rules');
      }
    }
  }
});

test('both directions meet their own last host, even with identical colours', () => {
  const simulation = simulate(chevronPattern.replace('CBAAAABC', 'AAAAAAAA'));
  const layout = buildFinishedLayout(simulation);
  const before = JSON.stringify(layout);
  const surfaces = buildFinishedSurfaces(layout.cells);
  assert.equal(surfaces.length, simulation.events.length);
  assert.equal(surfaces[6].emergence?.hostEventIndex, 2);
  assert.equal(surfaces[6].emergence?.hostCordId, 'C04');
  assert.equal(surfaces[9].emergence?.hostEventIndex, 6);
  assert.equal(surfaces[9].emergence?.hostCordId, 'C01');
  assert.equal(surfaces[12].emergence, undefined, 'continuing splittee must not sprout a second tip');
  assert.equal(JSON.stringify(layout), before, 'surface detail must not change the layout');
  assert.deepEqual(buildFinishedSurfaces(layout.cells), surfaces);

  for (const surface of surfaces) {
    if (!surface.emergence) continue;
    const host = layout.cells[surface.emergence.hostEventIndex];
    assert.equal(host.event.splitterId, surface.cell.event.splitteeId);
    const hostRight = host.event.toLane > host.event.fromLane;
    const [currentCorner, hostCorner, tip] = surface.emergence.points;
    const hostBottom = host.points[2];
    const hostOuterBottom = host.points[hostRight ? 1 : 3];
    const hostSlope = (hostBottom.y - hostOuterBottom.y) / (hostBottom.x - hostOuterBottom.x);
    const right = surface.cell.event.toLane > surface.cell.event.fromLane;
    const incomingTop = surface.cell.points[right ? 3 : 1];
    const outerTop = surface.cell.points[0];
    const ribbonSlope = (outerTop.y - incomingTop.y) / (outerTop.x - incomingTop.x);
    assert.equal(currentCorner.x, hostCorner.x, 'triangle base is on the shared seam');
    assert.ok(Math.abs(tip.y - hostCorner.y - hostSlope * (tip.x - hostCorner.x)) < 0.00001);
    assert.ok(Math.abs(tip.y - currentCorner.y - ribbonSlope * (tip.x - currentCorner.x)) < 0.00001);
    assert.equal(surface.path, `M ${surface.cell.points.map(p => `${p.x},${p.y}`).join(' L ')} Z`,
      'transition triangles never move or cut the original cell');
    assert.doesNotMatch(surface.path, /Q|C/);
  }
});

test('the green triangle ends at the blue diagonal without reshaping the blue cell', () => {
  const cells = buildFinishedLayout(simulate(doubleChevron24Pattern)).cells;
  const surface = buildFinishedSurfaces(cells)[27];
  assert.equal(surface.cell.event.splitteeId, 'C12');
  assert.equal(surface.emergence?.hostCordId, 'C24');
  assert.ok(surface.emergence);
  const tip = surface.emergence.points[2];
  assert.equal(surface.emergence.fillCordId, 'C24');
  assert.ok(Math.abs(tip.x - surface.cell.points[2].x - 64 / 3) < 0.00001);
  assert.ok(Math.abs(tip.y - 360.55375505322445) < 0.00001);
  assert.equal(surface.path, `M ${cells[27].points.map(p => `${p.x},${p.y}`).join(' L ')} Z`);
});

test('the red–gold reference adds the gold extension and the small red triangle', () => {
  const cells = buildFinishedLayout(simulate(doubleChevron24Pattern)).cells;
  const surfaces = buildFinishedSurfaces(cells);
  const gold = surfaces[22].emergence!;
  const red = surfaces[40].emergence!;
  assert.ok(gold);
  assert.ok(red);
  assert.equal(gold.fillCordId, 'C13', 'gold extends into the red column');
  assert.equal(red.fillCordId, 'C01', 'red extends into the gold column');
  assert.deepEqual(gold.points[0], cells[22].points[2]);
  assert.deepEqual(gold.points[1], cells[17].points[1]);
  assert.ok(Math.abs(gold.points[2].x - 380) < 0.00001);
  assert.ok(Math.abs(gold.points[2].y - 305.12812921102034) < 0.00001);
  assert.ok(Math.abs(red.points[2].x - (348 - 64 / 6)) < 0.00001);
  assert.ok(Math.abs(red.points[2].y - 379.02896366729243) < 0.00001);
  for (const surface of surfaces) {
    assert.equal(surface.path, `M ${surface.cell.points.map(p => `${p.x},${p.y}`).join(' L ')} Z`);
  }
});

test('the eight-cord chevron refines all 15 full-cycle transitions and retains ordinary cells', () => {
  const pattern = parsePattern(chevronPattern).pattern!;
  const simulation = simulatePattern(pattern, 8);
  const layout = buildFinishedLayout(simulation);
  const surfaces = buildFinishedSurfaces(layout.cells);
  assert.equal(surfaces.length, 56);
  assert.equal(surfaces.filter(surface => surface.emergence).length, 15);
  for (const surface of surfaces) {
    if (!surface.emergence) {
      assert.equal(surface.path, `M ${surface.cell.points.map(p => `${p.x},${p.y}`).join(' L ')} Z`);
    }
  }
});

test('the double chevron renders both role changes across all six transition columns', () => {
  for (const source of [doubleChevron24Pattern, doubleChevron24Pattern.replace('AAAAAABBBBBBCCCCCCDDDDDD', 'A'.repeat(24))]) {
    const simulation = simulatePattern(parsePattern(source).pattern!, 24);
    const layout = buildFinishedLayout(simulation);
    const before = JSON.stringify(layout);
    const surfaces = buildFinishedSurfaces(layout.cells);
    const expectedCounts = new Map([[5, 24], [6, 23], [11, 24], [12, 23], [18, 24], [19, 23]]);
    const actualCounts = new Map<number, number>();
    const lastParticipation = new Map<string, typeof layout.cells[number]>();
    for (const surface of surfaces) {
      const { cell, emergence, departure } = surface;
      const previousSplittee = lastParticipation.get(cell.event.splitteeId);
      const previousSplitter = lastParticipation.get(cell.event.splitterId);
      if (previousSplittee?.event.splitterId === cell.event.splitteeId) {
        assert.ok(emergence, `missing return at event ${cell.event.eventIndex}, column ${cell.column}`);
        assert.equal(emergence.hostEventIndex, previousSplittee.event.eventIndex);
      }
      if (previousSplitter?.event.splitteeId === cell.event.splitterId
        && Math.abs(previousSplitter.column - cell.column) === 1) {
        assert.ok(departure, `missing departure at event ${cell.event.eventIndex}, column ${cell.column}`);
        assert.equal(departure.hostEventIndex, previousSplitter.event.eventIndex);
        assert.equal(departure.hostCordId, cell.event.splitterId);
        assert.equal(departure.cordId, cell.event.splitterId);
      }
      for (const transition of [emergence, departure]) {
        if (!transition) continue;
        actualCounts.set(cell.column, (actualCounts.get(cell.column) ?? 0) + 1);
      }
      lastParticipation.set(cell.event.splitteeId, cell);
      lastParticipation.set(cell.event.splitterId, cell);
    }
    assert.deepEqual(actualCounts, expectedCounts);
    assert.equal(surfaces.length, 552, 'surface refinements add no split events');
    assert.equal(JSON.stringify(layout), before, 'Finished v1 footprints remain unchanged');
    assert.equal(surfaces[12].departure?.hostEventIndex, 5);
    assert.equal(surfaces[28].departure?.hostEventIndex, 12);
  }
});

test('offset joins and departures mirror geometrically without column-specific rules', () => {
  const cells = buildFinishedLayout(simulate(doubleChevron24Pattern)).cells;
  const reflected = cells.map(cell => ({
    ...cell,
    column: 24 - cell.column,
    event: { ...cell.event, fromLane: 25 - cell.event.fromLane, toLane: 25 - cell.event.toLane },
    points: [cell.points[0], cell.points[3], cell.points[2], cell.points[1]]
      .map(p => ({ x: -p.x, y: p.y })) as typeof cell.points,
  }));
  const original = buildFinishedSurfaces(cells);
  const mirrored = buildFinishedSurfaces(reflected);
  for (const index of [12, 22, 27, 28, 40]) {
    for (const kind of ['emergence', 'departure'] as const) {
      const expected = original[index][kind];
      const actual = mirrored[index][kind];
      assert.equal(Boolean(actual), Boolean(expected));
      if (!expected || !actual) continue;
      assert.equal(actual.hostEventIndex, expected.hostEventIndex);
      for (const [i, p] of expected.points.entries()) {
        assert.ok(Math.abs(actual.points[i].x + p.x) < 0.00001);
        assert.ok(Math.abs(actual.points[i].y - p.y) < 0.00001);
      }
    }
  }
});

test('all samples and control limits retain finite geometry and one surface per event', () => {
  for (const source of [chevronPattern, doubleChevron24Pattern, mirroredDiamonds24Pattern, wayuuFajon20Pattern]) {
    const simulation = simulate(source);
    for (const theta of [10, 30, 60]) {
      for (const tipAngle of [10, 30, 90]) {
        const layout = buildFinishedLayout(simulation, { theta, tipAngle });
        const surfaces = buildFinishedSurfaces(layout.cells);
        assertVisibleContinuity(layout.cells);
        assertColumnPacking(layout.cells);
        assert.equal(surfaces.length, simulation.events.length);
        for (const surface of surfaces) {
          assert.doesNotMatch(JSON.stringify(surface), /NaN|Infinity|null/);
          if (surface.emergence) assert.ok(surface.emergence.hostEventIndex < surface.cell.event.eventIndex);
          if (surface.departure) assert.ok(surface.departure.hostEventIndex < surface.cell.event.eventIndex);
        }
      }
    }
  }
  assert.deepEqual(buildFinishedSurfaces([]), []);
});

test('detached experimental layouts do not invent long visible splitter bridges', () => {
  const layout = buildFinishedLayout(simulate(chevronPattern));
  const cell = layout.cells[6];
  cell.points = cell.points.map(({ x, y }) => ({ x, y: y + 1000 })) as typeof cell.points;
  const surface = buildFinishedSurfaces(layout.cells)[6];
  assert.equal(surface.emergence, undefined);
  assert.doesNotMatch(surface.path, /Q|C/);
});
