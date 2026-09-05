import type { Simulation, SplitEvent } from './types';

export type FinishedPoint = { x: number; y: number };

export type FinishedCell = {
  event: SplitEvent;
  column: number;
  allowsOverlap: boolean;
  points: [FinishedPoint, FinishedPoint, FinishedPoint, FinishedPoint];
};

export type FinishedLayout = {
  width: number;
  height: number;
  columnCount: number;
  cellSpan: number;
  cellSide: number;
  packedTipAngle: number;
  cells: FinishedCell[];
};

type LayoutOptions = {
  theta?: number;
  columnWidth?: number;
  padding?: number;
  staggerRatio?: number;
  tipAngle?: number;
};

const collisionTolerance = 0.001;

export function buildFinishedLayout(
  simulation: Simulation,
  {
    theta = 30,
    columnWidth = 64,
    padding = 28,
    staggerRatio = 0,
    tipAngle = 30,
  }: LayoutOptions = {},
): FinishedLayout {
  const laneCount = simulation.snapshots[0]?.lanes.length ?? 0;
  const columnCount = Math.max(0, laneCount - 1);
  const safeTheta = Math.min(75, Math.max(10, theta));
  const radians = safeTheta * Math.PI / 180;
  const cellSpan = columnWidth / Math.cos(radians);
  const widthDrop = columnWidth * Math.tan(radians);
  const safeTip = Math.min(90, Math.max(10, tipAngle));
  const tipRadians = safeTip * Math.PI / 180;
  const cellSide = widthDrop + columnWidth / Math.tan(tipRadians);
  const packedTipAngle = 2 * safeTheta;
  const longitudinalStagger = cellSide * Math.min(0.8, Math.max(0, staggerRatio));
  const cordY = new Map(
    (simulation.snapshots[0]?.lanes ?? []).map((cord) => [cord.id, 0]),
  );
  const lastVisibleByCord = new Map<string, FinishedCell>();
  const lastRoleByCord = new Map<string, 'splitter' | 'splittee'>();
  const placed: FinishedCell[] = [];
  let previousActionStart = 0;

  splitActions(simulation.events).forEach((action) => {
    const splitterId = action[0]?.splitterId;
    if (!splitterId) return;
    lastVisibleByCord.delete(splitterId);

    const initialY = Math.max(cordY.get(splitterId) ?? 0, previousActionStart);
    const candidates = action.map((event, index) => {
      const start: FinishedPoint = {
        x: (event.fromLane - 1) * columnWidth,
        y: initialY + index * widthDrop,
      };
      const end: FinishedPoint = {
        x: (event.toLane - 1) * columnWidth,
        y: start.y + widthDrop,
      };
      const cell = cellFor(
        event,
        start,
        end,
        cellSide,
        lastRoleByCord.get(event.splitteeId) === 'splitter',
      );
      const longAxis = downwardLongAxis(cell);
      return translateCell(
        cell,
        longAxis.x * longitudinalStagger * index,
        longAxis.y * longitudinalStagger * index,
      );
    });

    const connection = connectionTranslation(candidates, lastVisibleByCord, columnWidth);
    const connected = candidates.map((cell) =>
      translateCell(cell, connection.x, connection.y),
    );
    const shift = minimumDownwardShift(connected, placed, columnWidth);
    const shifted = connected.map((cell) => translateCell(cell, 0, shift));
    placed.push(...shifted);
    previousActionStart = initialY + connection.y + shift;

    shifted.forEach((cell) => {
      const end = crossGapEnd(cell);
      cordY.set(cell.event.splitterId, end.y);
      cordY.set(cell.event.splitteeId, end.y);
      lastVisibleByCord.set(cell.event.splitteeId, cell);
      lastRoleByCord.set(cell.event.splitteeId, 'splittee');
    });
    lastRoleByCord.set(splitterId, 'splitter');
  });

  if (!placed.length) {
    return {
      width: Math.max(320, columnCount * columnWidth + padding * 2),
      height: 360,
      columnCount,
      cellSpan,
      cellSide,
      packedTipAngle,
      cells: [],
    };
  }

  const allPoints = placed.flatMap((cell) => cell.points);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const normalized = placed.map((cell) =>
    translateCell(cell, padding - minX, padding - minY),
  );

  return {
    width: Math.max(320, maxX - minX + padding * 2),
    height: Math.max(260, maxY - minY + padding * 2),
    columnCount,
    cellSpan,
    cellSide,
    packedTipAngle,
    cells: normalized,
  };
}

function splitActions(events: SplitEvent[]): SplitEvent[][] {
  const actions: SplitEvent[][] = [];
  events.forEach((event) => {
    const current = actions.at(-1);
    if (
      current
      && current[0]?.rowInstance === event.rowInstance
      && current[0]?.splitterId === event.splitterId
    ) {
      current.push(event);
    } else {
      actions.push([event]);
    }
  });
  return actions;
}

function cellFor(
  event: SplitEvent,
  start: FinishedPoint,
  end: FinishedPoint,
  side: number,
  allowsOverlap: boolean,
): FinishedCell {
  const startBottom: FinishedPoint = { x: start.x, y: start.y + side };
  const endTop: FinishedPoint = { x: end.x, y: end.y - side };
  return {
    event,
    column: Math.min(event.fromLane, event.toLane),
    allowsOverlap,
    points: end.x > start.x
      ? [start, startBottom, end, endTop]
      : [start, endTop, end, startBottom],
  };
}

function crossGapEnd(cell: FinishedCell): FinishedPoint {
  return cell.points[2];
}

function translateCell(
  cell: FinishedCell,
  deltaX: number,
  deltaY: number,
): FinishedCell {
  return {
    ...cell,
    points: cell.points.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    })) as FinishedCell['points'],
  };
}

function downwardLongAxis(cell: FinishedCell): FinishedPoint {
  const first = cell.points[1];
  const second = cell.points[3];
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  const length = Math.hypot(deltaX, deltaY);
  const axis = { x: deltaX / length, y: deltaY / length };
  return axis.y >= 0 ? axis : { x: -axis.x, y: -axis.y };
}

function connectionTranslation(
  candidates: FinishedCell[],
  lastVisibleByCord: Map<string, FinishedCell>,
  columnWidth: number,
): FinishedPoint {
  const translations = candidates.flatMap((candidate) => {
    const previous = lastVisibleByCord.get(candidate.event.splitteeId);
    if (!previous) return [];
    if (Math.abs(previous.column - candidate.column) !== 1) return [];
    const boundary = Math.min(previous.column, candidate.column) * columnWidth;
    return [{ x: 0, y: boundaryTop(previous, boundary) - boundaryTop(candidate, boundary) }];
  });
  if (!translations.length) return { x: 0, y: 0 };
  return {
    x: translations.reduce((total, translation) => total + translation.x, 0) / translations.length,
    y: translations.reduce((total, translation) => total + translation.y, 0) / translations.length,
  };
}

function boundaryTop(cell: FinishedCell, x: number): number {
  return Math.min(
    ...cell.points
      .filter((point) => Math.abs(point.x - x) < 0.5)
      .map((point) => point.y),
  );
}

function minimumDownwardShift(
  candidates: FinishedCell[],
  placed: FinishedCell[],
  columnWidth: number,
): number {
  if (!placed.length || !intersectsPlaced(candidates, placed)) return 0;

  const step = Math.max(0.5, columnWidth / 100);
  const placedBottom = Math.max(...placed.flatMap((cell) => cell.points.map((point) => point.y)));
  const candidateTop = Math.min(...candidates.flatMap((cell) => cell.points.map((point) => point.y)));
  const maximumShift = placedBottom - candidateTop + columnWidth * 2;

  for (let shift = step; shift <= maximumShift; shift += step) {
    const shifted = candidates.map((cell) => translateCell(cell, 0, shift));
    if (!intersectsPlaced(shifted, placed)) {
      let lower = shift - step;
      let upper = shift;
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const middle = (lower + upper) / 2;
        const middleCandidates = candidates.map((cell) =>
          translateCell(cell, 0, middle),
        );
        if (intersectsPlaced(middleCandidates, placed)) lower = middle;
        else upper = middle;
      }
      return upper;
    }
  }

  return maximumShift;
}

function intersectsPlaced(candidates: FinishedCell[], placed: FinishedCell[]): boolean {
  return candidates.some((candidate) =>
    !candidate.allowsOverlap
    && placed.some((existing) => polygonsOverlap(candidate.points, existing.points)),
  );
}

function polygonsOverlap(first: FinishedPoint[], second: FinishedPoint[]): boolean {
  return [...axesFor(first), ...axesFor(second)].every((axis) => {
    const firstProjection = project(first, axis);
    const secondProjection = project(second, axis);
    return Math.min(firstProjection.max, secondProjection.max)
      - Math.max(firstProjection.min, secondProjection.min) > collisionTolerance;
  });
}

function axesFor(points: FinishedPoint[]): FinishedPoint[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edgeX = next.x - point.x;
    const edgeY = next.y - point.y;
    const length = Math.hypot(edgeX, edgeY);
    return { x: -edgeY / length, y: edgeX / length };
  });
}

function project(points: FinishedPoint[], axis: FinishedPoint): { min: number; max: number } {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}
