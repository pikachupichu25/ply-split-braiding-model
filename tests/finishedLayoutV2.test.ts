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

/**
 * Reads the rules straight off the polygons, independently of the links the
 * layout reports, and returns one residual per relation each rule asks for.
 */
function residuals(layout: FinishedLayoutV2) {
  const found = { R1: [] as number[], R2: [] as number[], return: [] as number[], departure: [] as number[] };
  const lastVisible = new Map<string, Cell>();
  const lastSplit = new Map<string, Cell>();

  for (const [index, cell] of layout.cells.entries()) {
    const event = cell.event;
    const previous = layout.cells[index - 1];
    if (previous
      && previous.event.rowInstance === event.rowInstance
      && previous.event.splitterId === event.splitterId) {
      found.R1.push(Math.hypot(cell.points[0].x - previous.points[2].x,
        cell.points[0].y - previous.points[2].y));
    }

    const continuing = lastVisible.get(event.splitteeId);
    if (continuing
      && continuing.event.fromLane === event.toLane
      && Math.abs(continuing.column - cell.column) === 1) {
      const x = cell.points[2].x;
      found.R2.push(Math.max(Math.abs(topAt(cell, x) - topAt(continuing, x)),
        Math.abs(bottomAt(cell, x) - bottomAt(continuing, x))));
    } else {
      const host = lastSplit.get(event.splitteeId);
      if (host && host.event.toLane === event.toLane
        && Math.abs(host.column - cell.column) === 1) {
        const x = cell.points[2].x;
        found.return.push(topAt(cell, x) - topAt(host, x) - layout.cellSide / 2);
      }
    }

    const leaving = lastVisible.get(event.splitterId);
    if (leaving
      && leaving.event.fromLane === event.fromLane
      && Math.abs(leaving.column - cell.column) === 1) {
      const x = cell.points[0].x;
      found.departure.push(topAt(cell, x) - topAt(leaving, x) - layout.cellSide / 2);
    }

    lastVisible.set(event.splitteeId, cell);
    lastVisible.delete(event.splitterId);
    lastSplit.set(event.splitterId, cell);
    lastSplit.delete(event.splitteeId);
  }
  return found;
}

test('v2 keeps every cord join and every role change exact, in all samples', () => {
  for (const [name, source] of samples) {
    const simulation = simulate(source);
    for (const [theta, tipAngle] of angles) {
      const layout = buildFinishedLayoutV2(simulation, { theta, tipAngle, columnWidth: 100 });
      const measured = residuals(layout);
      assert.ok(measured.R2.length > 0, `${name} should have cord joins to keep`);
      for (const [rule, values] of Object.entries(measured)) {
        if (rule === 'R1') continue;
        const worst = Math.max(0, ...values.map(Math.abs));
        assert.ok(worst < 0.0001,
          `${name} at ${theta}/${tipAngle}: ${rule} misses by ${worst}`);
      }
      // The reported links agree with the geometry: nothing conflicted for
      // the two exact rules, and R1's own conflicts are the action bending.
      assert.equal(layout.links.filter(link =>
        link.rule !== 'R1' && link.status === 'conflicted').length, 0);
      assert.equal(layout.links.filter(link => link.rule === 'R1'
        && link.status === 'conflicted').length,
        measured.R1.filter(residual => residual > 0.0001).length);
    }
  }
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

test('v2 ties the whole surface into one body, with no unplaced run', () => {
  for (const [name, source] of samples) {
    const layout = buildFinishedLayoutV2(simulate(source));
    assert.equal(layout.runs, 1, `${name} should need no baseline fallback`);
  }
  assert.deepEqual(buildFinishedLayoutV2(
    { events: [], snapshots: [], diagnostics: [], totalRows: 0 }).cells, []);
});

test('rule authority is the layout’s choice, not an accident of event order', () => {
  // braid16 is the sample where the two exact anchors and the action scaffold
  // cannot all hold: R4 first keeps every role change, R1 first keeps every
  // corner contact instead. Both orders keep all of R2.
  const simulation = simulate(braid16Pattern);
  const held = (layout: FinishedLayoutV2, rule: 'R1' | 'R2' | 'R4') => {
    const links = layout.links.filter(link => link.rule === rule);
    return [links.filter(link => link.status !== 'conflicted').length, links.length];
  };

  const roleFirst = buildFinishedLayoutV2(simulation);
  assert.deepEqual(held(roleFirst, 'R2'), [47, 47]);
  assert.deepEqual(held(roleFirst, 'R4'), [15, 15]);
  assert.ok(held(roleFirst, 'R1')[0] < held(roleFirst, 'R1')[1], 'the action bends');

  const courseFirst = buildFinishedLayoutV2(simulation, { rulePriority: ['R2', 'R1', 'R4'] });
  assert.deepEqual(held(courseFirst, 'R2'), [47, 47]);
  assert.deepEqual(held(courseFirst, 'R1'), [47, 47]);
  assert.ok(held(courseFirst, 'R4')[0] < held(courseFirst, 'R4')[1], 'role changes yield');
  assert.ok(Math.max(...residuals(courseFirst).R2.map(Math.abs)) < 0.0001);
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
