import type { FinishedLayoutV2 } from './finishedLayoutV2';
import type { ExpectedLayoutDocument } from './expectedLayout';
import type { Face } from './types';

type ExportOptions = {
  name: string;
  thetaDeg: number;
  tipAngleDeg: number;
  columnWidth: number;
  face: Face;
  colorForCord: (cordId: string) => string;
};

/** Convert a generated Finished v2 placement into the manual editor schema. */
export function finishedV2ToExpectedLayout(
  layout: FinishedLayoutV2,
  options: ExportOptions,
): ExpectedLayoutDocument {
  const minReferenceY = layout.cells.length
    ? Math.min(...layout.cells.map((cell) => cell.points[0].y))
    : 0;

  return {
    schemaVersion: 1,
    kind: 'expected-finished-layout',
    name: `${options.name} — Finished v2`,
    columnCount: layout.columnCount,
    geometry: {
      columnWidth: options.columnWidth,
      thetaDeg: options.thetaDeg,
      tipAngleDeg: options.tipAngleDeg,
    },
    cells: layout.cells.map((cell, index) => {
      const frontLean = cell.event.toLane > cell.event.fromLane ? 'right' : 'left';
      const mirrored = options.face === 'back';
      return {
        id: `C${String(index + 1).padStart(3, '0')}`,
        column: mirrored ? layout.columnCount + 1 - cell.column : cell.column,
        lean: mirrored ? oppositeLean(frontLean) : frontLean,
        ySideUnits: roundLayoutPosition((cell.points[0].y - minReferenceY) / layout.cellSide),
        fill: options.colorForCord(cell.event.splitteeId),
        zIndex: index,
        eventId: cell.event.eventIndex,
        splitterId: cell.event.splitterId,
        splitteeId: cell.event.splitteeId,
      };
    }),
  };
}

function oppositeLean(lean: 'left' | 'right') {
  return lean === 'left' ? 'right' : 'left';
}

function roundLayoutPosition(value: number) {
  return Number(value.toFixed(10));
}
