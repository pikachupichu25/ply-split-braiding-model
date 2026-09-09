export type ExpectedLean = 'left' | 'right';

export type ExpectedCell = {
  id: string;
  column: number;
  lean: ExpectedLean;
  ySideUnits: number;
  fill: string;
  zIndex: number;
  /** Optional identity of the simulator split event represented by this cell. */
  eventId?: number;
  splitterId?: string;
  splitteeId?: string;
};

export type ExpectedLayoutDocument = {
  schemaVersion: 1;
  kind: 'expected-finished-layout';
  name: string;
  columnCount: number;
  geometry: {
    columnWidth: number;
    thetaDeg: number;
    tipAngleDeg: number;
  };
  cells: ExpectedCell[];
};

export type ExpectedGeometry = ExpectedLayoutDocument['geometry'] & {
  crossGapDrop: number;
  cellSide: number;
  halfSide: number;
};

export type ExpectedPoint = { x: number; y: number };
export type EventIdComparator = '>' | '>=' | '<' | '<=' | '=';

export type SnapResult = {
  ySideUnits: number;
  kind: 'midpoint' | 'endpoint' | 'half-side-grid';
  boundary?: number;
  targetYSideUnits?: number;
};

export type ExpectedGroupDelta = {
  columnDelta: number;
  ySideUnitsDelta: number;
};

export const expectedLayoutStorageKey = 'scot-expected-finished-layout-v1';

export const defaultExpectedGeometry: ExpectedLayoutDocument['geometry'] = {
  columnWidth: 100,
  thetaDeg: 30,
  tipAngleDeg: 30,
};

export function createExpectedLayout(columnCount = 7): ExpectedLayoutDocument {
  return {
    schemaVersion: 1,
    kind: 'expected-finished-layout',
    name: 'Untitled expected layout',
    columnCount: clampColumnCount(columnCount),
    geometry: { ...defaultExpectedGeometry },
    cells: [],
  };
}

export function expectedGeometry(
  geometry: ExpectedLayoutDocument['geometry'],
): ExpectedGeometry {
  const theta = geometry.thetaDeg * Math.PI / 180;
  const tipAngle = geometry.tipAngleDeg * Math.PI / 180;
  const crossGapDrop = geometry.columnWidth * Math.tan(theta);
  const cellSide = crossGapDrop + geometry.columnWidth / Math.tan(tipAngle);
  return {
    ...geometry,
    crossGapDrop,
    cellSide,
    halfSide: cellSide / 2,
  };
}

/** Points are returned in clockwise order in document coordinates. */
export function expectedCellPoints(
  cell: ExpectedCell,
  geometry: ExpectedGeometry,
): [ExpectedPoint, ExpectedPoint, ExpectedPoint, ExpectedPoint] {
  const left = (cell.column - 1) * geometry.columnWidth;
  const right = left + geometry.columnWidth;
  const y = cell.ySideUnits * geometry.cellSide;
  const endY = y + geometry.crossGapDrop;
  if (cell.lean === 'right') {
    return [
      { x: left, y },
      { x: left, y: y + geometry.cellSide },
      { x: right, y: endY },
      { x: right, y: endY - geometry.cellSide },
    ];
  }
  return [
    { x: right, y },
    { x: left, y: endY - geometry.cellSide },
    { x: left, y: endY },
    { x: right, y: y + geometry.cellSide },
  ];
}

type Side = {
  boundary: number;
  topOffset: number;
  bottomOffset: number;
};

function cellSides(cell: ExpectedCell, geometry: ExpectedGeometry): Side[] {
  const farTopOffset = geometry.crossGapDrop / geometry.cellSide - 1;
  if (cell.lean === 'right') {
    return [
      { boundary: cell.column - 1, topOffset: 0, bottomOffset: 1 },
      { boundary: cell.column, topOffset: farTopOffset, bottomOffset: farTopOffset + 1 },
    ];
  }
  return [
    { boundary: cell.column - 1, topOffset: farTopOffset, bottomOffset: farTopOffset + 1 },
    { boundary: cell.column, topOffset: 0, bottomOffset: 1 },
  ];
}

/**
 * Snap either vertical-side corner of a moving cell to the top, midpoint, or
 * bottom of another cell side on the same column boundary. Falls back to the
 * global half-side lattice when no nearby cell target exists.
 */
export function snapExpectedCell(
  moving: ExpectedCell,
  rawYSideUnits: number,
  cells: ExpectedCell[],
  geometry: ExpectedGeometry,
  thresholdSideUnits = 0.08,
): SnapResult {
  type Candidate = SnapResult & { distance: number; targetId: string };
  const candidates: Candidate[] = [];
  const movingSides = cellSides(moving, geometry);

  for (const target of cells) {
    if (target.id === moving.id || Math.abs(target.column - moving.column) > 1) continue;
    for (const movingSide of movingSides) {
      const targetSide = cellSides(target, geometry)
        .find((side) => side.boundary === movingSide.boundary);
      if (!targetSide) continue;

      const sources = [movingSide.topOffset, movingSide.bottomOffset];
      const targets = [
        { offset: targetSide.topOffset, kind: 'endpoint' as const },
        { offset: (targetSide.topOffset + targetSide.bottomOffset) / 2, kind: 'midpoint' as const },
        { offset: targetSide.bottomOffset, kind: 'endpoint' as const },
      ];

      for (const sourceOffset of sources) {
        for (const targetPoint of targets) {
          const targetY = target.ySideUnits + targetPoint.offset;
          const candidateY = targetY - sourceOffset;
          const distance = Math.abs(candidateY - rawYSideUnits);
          if (distance <= thresholdSideUnits) {
            candidates.push({
              ySideUnits: candidateY,
              kind: targetPoint.kind,
              boundary: movingSide.boundary,
              targetYSideUnits: targetY,
              distance,
              targetId: target.id,
            });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => a.distance - b.distance
    || (a.kind === b.kind ? 0 : a.kind === 'midpoint' ? -1 : 1)
    || a.targetId.localeCompare(b.targetId));
  const best = candidates[0];
  if (best) {
    return {
      ySideUnits: best.ySideUnits,
      kind: best.kind,
      boundary: best.boundary,
      targetYSideUnits: best.targetYSideUnits,
    };
  }

  return {
    ySideUnits: Math.round(rawYSideUnits * 2) / 2,
    kind: 'half-side-grid',
  };
}

export function parseExpectedLayout(value: unknown): ExpectedLayoutDocument {
  if (!isRecord(value)) throw new Error('The file does not contain a layout object.');
  if (value.schemaVersion !== 1) throw new Error('Only expected-layout schema version 1 is supported.');
  if (value.kind !== 'expected-finished-layout') throw new Error('This is not an expected finished layout file.');
  if (typeof value.name !== 'string') throw new Error('The layout name must be text.');
  if (!Number.isInteger(value.columnCount) || Number(value.columnCount) < 1 || Number(value.columnCount) > 64) {
    throw new Error('Column count must be a whole number from 1 to 64.');
  }
  if (!isRecord(value.geometry)) throw new Error('Geometry settings are missing.');
  const geometry = {
    columnWidth: finiteNumber(value.geometry.columnWidth, 'columnWidth'),
    thetaDeg: finiteNumber(value.geometry.thetaDeg, 'thetaDeg'),
    tipAngleDeg: finiteNumber(value.geometry.tipAngleDeg, 'tipAngleDeg'),
  };
  if (geometry.columnWidth <= 0 || geometry.thetaDeg < 10 || geometry.thetaDeg > 75
    || geometry.tipAngleDeg < 10 || geometry.tipAngleDeg > 90) {
    throw new Error('The geometry values are outside the supported range.');
  }
  if (!Array.isArray(value.cells)) throw new Error('The layout cells must be an array.');

  const seen = new Set<string>();
  const cells = value.cells.map((item, index): ExpectedCell => {
    if (!isRecord(item)) throw new Error(`Cell ${index + 1} is invalid.`);
    if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`Cell ${index + 1} has no ID.`);
    if (seen.has(item.id)) throw new Error(`Cell ID ${item.id} appears more than once.`);
    seen.add(item.id);
    const column = finiteNumber(item.column, `${item.id}.column`);
    if (!Number.isInteger(column) || column < 1 || column > Number(value.columnCount)) {
      throw new Error(`${item.id} has an invalid column.`);
    }
    if (item.lean !== 'left' && item.lean !== 'right') throw new Error(`${item.id} has an invalid lean.`);
    if (typeof item.fill !== 'string' || !isCssColor(item.fill)) throw new Error(`${item.id} has an invalid fill colour.`);
    const eventId = optionalEventId(item.eventId, item.id);
    const splitterId = optionalCordId(item.splitterId, `${item.id}.splitterId`);
    const splitteeId = optionalCordId(item.splitteeId, `${item.id}.splitteeId`);
    return {
      id: item.id,
      column,
      lean: item.lean,
      ySideUnits: finiteNumber(item.ySideUnits, `${item.id}.ySideUnits`),
      fill: item.fill,
      zIndex: finiteNumber(item.zIndex, `${item.id}.zIndex`),
      ...(eventId === undefined ? {} : { eventId }),
      ...(splitterId === undefined ? {} : { splitterId }),
      ...(splitteeId === undefined ? {} : { splitteeId }),
    };
  });

  return {
    schemaVersion: 1,
    kind: 'expected-finished-layout',
    name: value.name,
    columnCount: Number(value.columnCount),
    geometry,
    cells,
  };
}

export function nextExpectedCellId(cells: ExpectedCell[]): string {
  const largest = cells.reduce((max, cell) => {
    const match = /^C(\d+)$/.exec(cell.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `C${String(largest + 1).padStart(3, '0')}`;
}

export function expectedCellsMatchingEventId(
  cells: ExpectedCell[],
  comparator: EventIdComparator,
  value: number,
) {
  return cells.filter((cell) => {
    if (cell.eventId === undefined) return false;
    if (comparator === '>') return cell.eventId > value;
    if (comparator === '>=') return cell.eventId >= value;
    if (comparator === '<') return cell.eventId < value;
    if (comparator === '<=') return cell.eventId <= value;
    return cell.eventId === value;
  });
}

/** Keep a group move in bounds while preserving every relative cell offset. */
export function constrainExpectedGroupDelta(
  cells: ExpectedCell[],
  requestedColumnDelta: number,
  requestedYSideUnitsDelta: number,
  columnCount: number,
): ExpectedGroupDelta {
  if (!cells.length) return { columnDelta: 0, ySideUnitsDelta: 0 };

  const minColumn = Math.min(...cells.map((cell) => cell.column));
  const maxColumn = Math.max(...cells.map((cell) => cell.column));
  const minYSideUnits = Math.min(...cells.map((cell) => cell.ySideUnits));
  const roundedColumnDelta = Math.round(requestedColumnDelta);

  return {
    columnDelta: Math.max(1 - minColumn, Math.min(columnCount - maxColumn, roundedColumnDelta)),
    ySideUnitsDelta: Math.max(-minYSideUnits, requestedYSideUnitsDelta),
  };
}

function clampColumnCount(value: number): number {
  return Math.min(64, Math.max(1, Math.round(value)));
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function optionalEventId(value: unknown, cellId: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${cellId}.eventId must be a non-negative whole number.`);
  }
  return value;
}

function optionalCordId(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCssColor(value: string): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return /^#[0-9a-f]{6}$/i.test(value);
  }
  return CSS.supports('color', value);
}
