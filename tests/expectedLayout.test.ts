import assert from 'node:assert/strict';
import test from 'node:test';
import {
  constrainExpectedGroupDelta,
  createExpectedLayout,
  expectedCellPoints,
  expectedCellsMatchingEventId,
  expectedGeometry,
  nextExpectedCellId,
  parseExpectedLayout,
  snapExpectedCell,
} from '../src/domain/expectedLayout.ts';
import type { ExpectedCell } from '../src/domain/expectedLayout.ts';

const geometry = expectedGeometry(createExpectedLayout().geometry);

const cell = (overrides: Partial<ExpectedCell> = {}): ExpectedCell => ({
  id: 'C001',
  column: 1,
  lean: 'right',
  ySideUnits: 0,
  fill: '#d3a448',
  zIndex: 0,
  ...overrides,
});

test('expected cells span exactly one column in both lean directions', () => {
  for (const lean of ['left', 'right'] as const) {
    const points = expectedCellPoints(cell({ lean, column: 3 }), geometry);
    assert.equal(Math.min(...points.map((point) => point.x)), 200);
    assert.equal(Math.max(...points.map((point) => point.x)), 300);
    const sides = [200, 300].map((x) => points.filter((point) => point.x === x));
    for (const side of sides) {
      assert.equal(side.length, 2);
      assert.ok(Math.abs(Math.abs(side[1].y - side[0].y) - geometry.cellSide) < 0.000001);
    }
  }
});

test('a moving corner prefers a neighbouring side midpoint', () => {
  const target = cell({ id: 'C001', column: 1, lean: 'left', ySideUnits: 0 });
  const moving = cell({ id: 'C002', column: 2, lean: 'right', ySideUnits: 0.49 });
  const snapped = snapExpectedCell(moving, moving.ySideUnits, [target, moving], geometry);
  assert.equal(snapped.kind, 'midpoint');
  assert.equal(snapped.boundary, 1);
  assert.ok(Math.abs(snapped.ySideUnits - 0.5) < 0.000001);
});

test('snapping falls back to the half-side lattice', () => {
  const moving = cell({ id: 'C004', column: 4, ySideUnits: 1.31 });
  const snapped = snapExpectedCell(moving, moving.ySideUnits, [], geometry);
  assert.equal(snapped.kind, 'half-side-grid');
  assert.equal(snapped.ySideUnits, 1.5);
});

test('layout files round-trip and reject duplicate cell IDs', () => {
  const document = createExpectedLayout(7);
  document.cells = [
    cell({ eventId: 0, splitterId: 'C01', splitteeId: 'C02' }),
    cell({ id: 'C002', column: 2 }),
  ];
  assert.deepEqual(parseExpectedLayout(JSON.parse(JSON.stringify(document))), document);
  assert.equal(nextExpectedCellId(document.cells), 'C003');

  const invalid = JSON.parse(JSON.stringify(document));
  invalid.cells[1].id = 'C001';
  assert.throws(() => parseExpectedLayout(invalid), /appears more than once/);
});

test('layout files validate optional split-event metadata', () => {
  const document = createExpectedLayout(3);
  document.cells = [cell({ eventId: 12, splitterId: 'C07', splitteeId: 'C08' })];
  const parsed = parseExpectedLayout(document);
  assert.equal(parsed.cells[0].eventId, 12);
  assert.equal(parsed.cells[0].splitterId, 'C07');
  assert.equal(parsed.cells[0].splitteeId, 'C08');

  const invalid = JSON.parse(JSON.stringify(document));
  invalid.cells[0].eventId = -1;
  assert.throws(() => parseExpectedLayout(invalid), /non-negative whole number/);
});

test('cells can be selected with an event ID comparison', () => {
  const cells = [
    cell({ id: 'C001', eventId: 4 }),
    cell({ id: 'C002', eventId: 12 }),
    cell({ id: 'C003' }),
    cell({ id: 'C004', eventId: 20 }),
  ];
  assert.deepEqual(expectedCellsMatchingEventId(cells, '>', 12).map((item) => item.id), ['C004']);
  assert.deepEqual(expectedCellsMatchingEventId(cells, '>=', 12).map((item) => item.id), ['C002', 'C004']);
  assert.deepEqual(expectedCellsMatchingEventId(cells, '=', 4).map((item) => item.id), ['C001']);
});

test('group movement preserves spacing and constrains the whole selection', () => {
  const cells = [
    cell({ id: 'C001', column: 2, ySideUnits: 1 }),
    cell({ id: 'C002', column: 4, ySideUnits: 2.5 }),
  ];

  assert.deepEqual(constrainExpectedGroupDelta(cells, 3, -2, 5), {
    columnDelta: 1,
    ySideUnitsDelta: -1,
  });
  assert.deepEqual(constrainExpectedGroupDelta(cells, -5, 0.5, 5), {
    columnDelta: -1,
    ySideUnitsDelta: 0.5,
  });
});
