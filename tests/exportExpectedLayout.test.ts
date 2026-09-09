import assert from 'node:assert/strict';
import test from 'node:test';
import { finishedV2ToExpectedLayout } from '../src/domain/exportExpectedLayout.ts';
import { buildFinishedLayoutV2 } from '../src/domain/finishedLayoutV2.ts';
import { parseExpectedLayout } from '../src/domain/expectedLayout.ts';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { chevronPattern } from '../src/examples/chevron.ts';

function generated(face: 'front' | 'back') {
  const parsed = parsePattern(chevronPattern);
  assert.ok(parsed.pattern);
  const simulation = simulatePattern(parsed.pattern, 1);
  const layout = buildFinishedLayoutV2(simulation, {
    theta: 30,
    tipAngle: 30,
    columnWidth: 64,
  });
  return {
    layout,
    document: finishedV2ToExpectedLayout(layout, {
      name: 'Chevron',
      thetaDeg: 30,
      tipAngleDeg: 30,
      columnWidth: 64,
      face,
      colorForCord: (cordId) => cordId === 'C01' ? '#d76b52' : '#d3a448',
    }),
  };
}

test('Finished v2 exports one valid expected-layout cell per split event', () => {
  const { layout, document } = generated('front');
  assert.deepEqual(parseExpectedLayout(document), document);
  assert.equal(document.cells.length, layout.cells.length);
  assert.equal(document.geometry.columnWidth, 64);
  assert.equal(Math.min(...document.cells.map((cell) => cell.ySideUnits)), 0);

  for (const [index, cell] of document.cells.entries()) {
    const event = layout.cells[index].event;
    assert.equal(cell.eventId, event.eventIndex);
    assert.equal(cell.splitterId, event.splitterId);
    assert.equal(cell.splitteeId, event.splitteeId);
    assert.equal(cell.column, layout.cells[index].column);
  }
});

test('back-face export reverses columns and leans without changing event identity', () => {
  const front = generated('front');
  const back = generated('back');
  for (const [index, frontCell] of front.document.cells.entries()) {
    const backCell = back.document.cells[index];
    assert.equal(backCell.column, front.layout.columnCount + 1 - frontCell.column);
    assert.notEqual(backCell.lean, frontCell.lean);
    assert.equal(backCell.eventId, frontCell.eventId);
    assert.equal(backCell.ySideUnits, frontCell.ySideUnits);
  }
});
