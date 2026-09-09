import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinishedLayoutV2 } from '../src/domain/finishedLayoutV2.ts';
import type { FinishedLayoutV2 } from '../src/domain/finishedLayoutV2.ts';
import { buildFinishedSurfaces } from '../src/domain/finishedSurface.ts';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import type { Simulation } from '../src/domain/types.ts';
import { braid16Pattern } from '../src/examples/braid16.ts';
import { colorBlock8Pattern } from '../src/examples/colorBlock8.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { doubleChevron24Pattern } from '../src/examples/doubleChevron24.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';

type Cell = FinishedLayoutV2['cells'][number];

const samples: [string, string][] = [
  ['chevron', chevronPattern],
  ['colour block', colorBlock8Pattern],
  ['double chevron', doubleChevron24Pattern],
  ['braid16', braid16Pattern],
  ['wayuu', wayuuFajon20Pattern],
];
const angles: [number, number][] = [[30, 30], [30, 60], [10, 10], [60, 90], [75, 10]];

function simulate(source: string): Simulation {
  const parsed = parsePattern(source);
  assert.ok(parsed.pattern);
  return simulatePattern(parsed.pattern, 4);
}

const edgeAt = (cell: Cell, x: number) =>
  cell.points.filter(point => Math.abs(point.x - x) < 0.001).map(point => point.y);
const topAt = (cell: Cell, x: number) => Math.min(...edgeAt(cell, x));
const bottomAt = (cell: Cell, x: number) => Math.max(...edgeAt(cell, x));

test('v2 keeps same-lean cells in each column from overlapping', () => {
  for (const [name, source] of samples) {
    const simulation = simulate(source);
    for (const [theta, tipAngle] of angles) {
      const layout = buildFinishedLayoutV2(simulation, { theta, tipAngle, columnWidth: 100 });
      const lastByLean = new Map<string, Cell>();
      for (const cell of layout.cells) {
        const leansRight = cell.event.toLane > cell.event.fromLane;
        const key = `${cell.column}:${leansRight}`;
        const above = lastByLean.get(key);
        if (above) {
          const xs = [...new Set(cell.points.map(point => point.x))];
          for (const x of xs) {
            assert.ok(topAt(cell, x) >= bottomAt(above, x) - 0.0001,
              `${name} at ${theta}/${tipAngle}: event ${cell.event.eventIndex} overlaps `
              + `same-lean event ${above.event.eventIndex} in column ${cell.column}`);
          }
        }
        lastByLean.set(key, cell);
      }
      assert.ok(layout.links.some(link => link.rule === 'R3'), `${name} exercises R3`);
      assert.equal(layout.links.filter(link =>
        link.rule === 'R3' && link.status === 'conflicted').length, 0);
    }
  }
});

test('v2 places each column from top to bottom', () => {
  for (const [name, source] of samples) {
    const layout = buildFinishedLayoutV2(simulate(source));
    const lastY = new Map<number, number>();
    for (const cell of layout.cells) {
      const top = Math.min(...cell.points.map(point => point.y));
      assert.ok(top >= (lastY.get(cell.column) ?? -Infinity) - 0.0001,
        `${name}: event ${cell.event.eventIndex} moved upward in column ${cell.column}`);
      lastY.set(cell.column, top);
    }
    assert.equal(layout.links.filter(link =>
      link.rule === 'R0' && link.status === 'conflicted').length, 0);
  }
});

test('R3 keeps valid same-lean gaps and leaves opposite-lean spacing flexible', () => {
  const layout = buildFinishedLayoutV2(simulate(wayuuFajon20Pattern));
  assert.ok(layout.links.some(link => link.rule === 'R3' && link.residual > 0.0001),
    'R3 must not close an existing same-lean gap');

  const lastInColumn = new Map<number, Cell>();
  let overlappingBoundaries = 0;
  let openBoundaries = 0;
  for (const cell of layout.cells) {
    const previous = lastInColumn.get(cell.column);
    if (previous
      && (previous.event.toLane > previous.event.fromLane)
        !== (cell.event.toLane > cell.event.fromLane)) {
      for (const x of [...new Set(cell.points.map(point => point.x))]) {
        const previousEdge = edgeAt(previous, x);
        const currentEdge = edgeAt(cell, x);
        const overlap = Math.min(Math.max(...previousEdge), Math.max(...currentEdge))
          - Math.max(Math.min(...previousEdge), Math.min(...currentEdge));
        if (overlap > 0.0001) overlappingBoundaries += 1;
        if (Math.min(...currentEdge) - Math.max(...previousEdge) > 0.0001) openBoundaries += 1;
      }
    }
    lastInColumn.set(cell.column, cell);
  }
  assert.ok(overlappingBoundaries > 0, 'opposite leans can overlap');
  assert.ok(openBoundaries > 0, 'opposite leans can leave extra space');
});

test('v2 never moves a cell after it has been placed', () => {
  const simulation = simulate(wayuuFajon20Pattern);
  const complete = buildFinishedLayoutV2(simulation, { columnWidth: 100 });
  for (const count of [1, 2, 5, 16, 40, 100, 250, 500, simulation.events.length]) {
    const prefix = buildFinishedLayoutV2({
      ...simulation,
      events: simulation.events.slice(0, count),
    }, { columnWidth: 100 });
    assert.deepEqual(prefix.cells, complete.cells.slice(0, count),
      `the first ${count} cells retain their original coordinates`);
  }
});

test('R4 is used only when the current cell has no R1-R3 constraint', () => {
  for (const [name, source] of samples) {
    const layout = buildFinishedLayoutV2(simulate(source));
    const byTarget = new Map<number, FinishedLayoutV2['links']>();
    for (const link of layout.links) {
      const target = byTarget.get(link.to) ?? [];
      target.push(link);
      byTarget.set(link.to, target);
    }

    for (const [target, links] of byTarget) {
      const roleChanges = links.filter(link => link.rule === 'R4');
      if (!roleChanges.length) continue;
      const other = links.some(link => link.rule === 'R1'
        || link.rule === 'R2' || link.rule === 'R3');
      const anchored = roleChanges.filter(link => link.status === 'anchored');
      if (other) {
        assert.equal(anchored.length, 0, `${name} event ${target}: R4 must yield`);
      }
    }
  }
});

test('Eyes event 87 uses R4 instead of completely overlapping event 70', () => {
  const layout = buildFinishedLayoutV2(simulate(wayuuFajon20Pattern), {
    columnWidth: 100,
    padding: 0,
  });
  const earlier = layout.cells[70];
  const current = layout.cells[87];
  assert.equal(earlier.column, 9);
  assert.equal(current.column, 9);
  assert.notDeepEqual(current.points.map(point => point.y), earlier.points.map(point => point.y));
  assert.ok(layout.links.some(link => link.to === 87
    && link.rule === 'R4' && link.kind === 'departure' && link.status === 'anchored'));
});

test('Eyes events 65 and 82 keep C03 continuous through a same-gap reversal', () => {
  const layout = buildFinishedLayoutV2(simulate(wayuuFajon20Pattern), {
    columnWidth: 100,
    padding: 0,
  });
  const earlier = layout.cells[65];
  const current = layout.cells[82];
  assert.equal(earlier.event.splitteeId, 'C03');
  assert.equal(current.event.splitteeId, 'C03');
  assert.equal(earlier.column, current.column);
  assert.notDeepEqual(current.points.map(point => point.y), earlier.points.map(point => point.y));

  const boundaryX = current.points[2].x;
  assert.deepEqual(
    edgeAt(current, boundaryX).sort((a, b) => a - b),
    edgeAt(earlier, boundaryX).sort((a, b) => a - b),
  );
  assert.ok(layout.links.some(link => link.from === 65 && link.to === 82
    && link.rule === 'R2' && link.kind === 'continuation' && link.status === 'anchored'));
});

test('v2 asserts one cell per event and stays finite at the angle limits', () => {
  for (const [name, source] of samples) {
    const simulation = simulate(source);
    for (const [theta, tipAngle] of [...angles, [1, 1] as [number, number]]) {
      const layout = buildFinishedLayoutV2(simulation, { theta, tipAngle });
      assert.equal(layout.cells.length, simulation.events.length, name);
      assert.ok(layout.cells.every(cell =>
        cell.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
      assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
      assert.equal(buildFinishedSurfaces(layout.cells).length, simulation.events.length);
      assert.ok(layout.cells.every(cell => cell.points.every(point =>
        point.x >= -0.0001 && point.y >= -0.0001)), 'the canvas holds every cell');
    }
  }
});

test('v2 is deterministic, leaves the simulation alone, and mirrors exactly', () => {
  const simulation = simulate(wayuuFajon20Pattern);
  const before = JSON.stringify(simulation);
  const layout = buildFinishedLayoutV2(simulation);
  assert.deepEqual(buildFinishedLayoutV2(simulation), layout);
  assert.equal(JSON.stringify(simulation), before);

  const reflected = {
    ...simulation,
    events: simulation.events.map(event => ({
      ...event, fromLane: 21 - event.fromLane, toLane: 21 - event.toLane,
    })),
  };
  const back = buildFinishedLayoutV2(reflected);
  for (const [index, cell] of layout.cells.entries()) {
    for (const point of cell.points) {
      assert.ok(back.cells[index].points.some(other =>
        Math.abs(other.x - (layout.width - point.x)) < 0.000001
        && Math.abs(other.y - point.y) < 0.000001),
      `mirrored cell ${index} moved`);
    }
  }
});

test('v2 reports no groups for an empty simulation', () => {
  assert.deepEqual(buildFinishedLayoutV2(
    { events: [], snapshots: [], diagnostics: [], totalRows: 0 }).cells, []);
  assert.equal(buildFinishedLayoutV2(
    { events: [], snapshots: [], diagnostics: [], totalRows: 0 }).runs, 0);
});

test('v2 adds the section 7.5 transition triangles without moving a placed cell', () => {
  // The treatment is layout-independent: v2 supplies its own cells and the
  // reference counts still hold, because eligibility is geometric.
  for (const [name, source, repeats, triangles] of [
    ['chevron', chevronPattern, 8, 15],
    ['double chevron', doubleChevron24Pattern, 24, 141],
  ] as const) {
    const simulation = simulatePattern(parsePattern(source).pattern!, repeats);
    const layout = buildFinishedLayoutV2(simulation);
    const before = JSON.stringify(layout);
    const surfaces = buildFinishedSurfaces(layout.cells);
    assert.equal(surfaces.length, simulation.events.length, name);
    assert.equal(
      surfaces.reduce((sum, s) => sum + Number(Boolean(s.emergence)) + Number(Boolean(s.departure)), 0),
      triangles, `${name} transition count`);
    for (const surface of surfaces) {
      assert.equal(surface.path,
        `M ${surface.cell.points.map(p => `${p.x},${p.y}`).join(' L ')} Z`,
        `${name} keeps the placed cell path`);
      assert.doesNotMatch(surface.path, /Q|C/);
    }
    assert.equal(JSON.stringify(layout), before, `${name} v2 footprints remain unchanged`);
  }
});

test('every v2 triangle sits on a shared seam and ends on both diagonals', () => {
  for (const [name, source] of samples) {
    const simulation = simulate(source);
    for (const [theta, tipAngle] of angles) {
      const layout = buildFinishedLayoutV2(simulation, { theta, tipAngle });
      const surfaces = buildFinishedSurfaces(layout.cells);
      for (const surface of surfaces) {
        for (const kind of ['emergence', 'departure'] as const) {
          const transition = surface[kind];
          if (!transition) continue;
          const where = `${name} at ${theta}/${tipAngle}, event ${surface.cell.event.eventIndex}`;
          const [current, host, tip] = transition.points;
          const hostCell = layout.cells[transition.hostEventIndex];
          assert.ok(transition.hostEventIndex < surface.cell.event.eventIndex, where);
          assert.equal(Math.abs(hostCell.column - surface.cell.column), 1, where);
          assert.ok(Math.abs(current.x - host.x) < 0.000001, `${where}: base off the seam`);
          // Both endpoints are original corners, and the tip lies in one of
          // the two adjacent columns rather than anywhere on the canvas.
          assert.ok(surface.cell.points.some(p => p.x === current.x && p.y === current.y), where);
          assert.ok(hostCell.points.some(p => p.x === host.x && p.y === host.y), where);
          const columnWidth = 64;
          assert.ok(Math.abs(tip.x - current.x) <= columnWidth + 0.0001,
            `${where}: tip leaves the neighbouring columns`);
          assert.doesNotMatch(JSON.stringify(transition), /NaN|Infinity|null/, where);
        }
      }
    }
  }
});

test('v2 triangles mirror with the surface instead of following a column number', () => {
  const simulation = simulate(wayuuFajon20Pattern);
  const layout = buildFinishedLayoutV2(simulation);
  const reflected = {
    ...simulation,
    events: simulation.events.map(event => ({
      ...event, fromLane: 21 - event.fromLane, toLane: 21 - event.toLane,
    })),
  };
  const back = buildFinishedLayoutV2(reflected);
  const original = buildFinishedSurfaces(layout.cells);
  const mirrored = buildFinishedSurfaces(back.cells);
  let seen = 0;
  for (const [index, surface] of original.entries()) {
    for (const kind of ['emergence', 'departure'] as const) {
      const expected = surface[kind];
      const actual = mirrored[index][kind];
      assert.equal(Boolean(actual), Boolean(expected), `event ${index} ${kind}`);
      if (!expected || !actual) continue;
      assert.equal(actual.hostEventIndex, expected.hostEventIndex);
      assert.equal(actual.fillCordId, expected.fillCordId);
      for (const [corner, point] of expected.points.entries()) {
        assert.ok(Math.abs(actual.points[corner].x - (layout.width - point.x)) < 0.000001
          && Math.abs(actual.points[corner].y - point.y) < 0.000001,
        `event ${index} ${kind} corner ${corner} moved`);
      }
      seen += 1;
    }
  }
  assert.ok(seen > 0, 'the Wayuu sample should exercise both role changes');
});
