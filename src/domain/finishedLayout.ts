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
    const stepDirection = actionStepDirection(action, lastVisibleByCord, widthDrop);
    const candidates = action.map((event, index) => {
      const start: FinishedPoint = {
        x: (event.fromLane - 1) * columnWidth,
        y: initialY + stepDirection * index * widthDrop,
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

    const aligned = alignContinuingSplittees(candidates, lastVisibleByCord);
    // Establish exact ribbon connections first. The final packing pass moves
    // whole ribbons together to resolve collisions without breaking a join.
    const shift = aligned ? 0 : minimumDownwardShift(candidates, placed, columnWidth, lastVisibleByCord);
    const shifted = aligned ?? candidates.map((cell) => translateCell(cell, 0, shift));
    placed.push(...shifted);
    previousActionStart = shifted[0].points[0].y;

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

  const packed = packConnectedRibbons(placed);
  const allPoints = packed.flatMap((cell) => cell.points);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const normalized = packed.map((cell) =>
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

function packConnectedRibbons(cells: FinishedCell[]): FinishedCell[] {
  type Ribbon = { shift: number; incoming: number; next: { ribbon: number; distance: number }[] };
  const ribbons: Ribbon[] = [];
  const ribbonForCell = new Map<FinishedCell, number>();
  const lastParticipation = new Map<string, FinishedCell>();
  const lastInColumn = new Map<number, FinishedCell>();

  for (const cell of cells) {
    const previous = lastParticipation.get(cell.event.splitteeId);
    // Only adjacent-gap continuations share a full edge. A return through the
    // same gap starts a new run: matching that same-side edge would overlay
    // the two footprints, so the returning cell must stack below it instead.
    const continues = previous?.event.splitteeId === cell.event.splitteeId
      && Math.abs(previous.column - cell.column) === 1;
    const ribbon = continues ? ribbonForCell.get(previous)! : ribbons.length;
    if (!continues) ribbons.push({ shift: 0, incoming: 0, next: [] });
    ribbonForCell.set(cell, ribbon);

    const above = lastInColumn.get(cell.column);
    if (above) {
      const predecessor = ribbonForCell.get(above)!;
      // Both diagonal edges are linear. Separating their vertical intervals
      // at both column boundaries prevents interior overlap throughout it.
      const left = Math.min(...cell.points.map(p => p.x));
      const right = Math.max(...cell.points.map(p => p.x));
      const distance = Math.max(
        verticalRange(above, left).bottom - verticalRange(cell, left).top,
        verticalRange(above, right).bottom - verticalRange(cell, right).top,
      );
      ribbons[predecessor].next.push({ ribbon, distance });
      ribbons[ribbon].incoming += 1;
    }
    lastInColumn.set(cell.column, cell);
    lastParticipation.set(cell.event.splitteeId, cell);
    lastParticipation.set(cell.event.splitterId, cell);
  }

  // Column order supplies a dependency graph between runs. Its longest paths
  // give the smallest downward translations satisfying every column at once.
  const ready = ribbons.flatMap((ribbon, index) => ribbon.incoming === 0 ? [index] : []);
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const current = ribbons[ready[cursor]];
    for (const edge of current.next) {
      const next = ribbons[edge.ribbon];
      next.shift = Math.max(next.shift, current.shift + edge.distance);
      next.incoming -= 1;
      if (next.incoming === 0) ready.push(edge.ribbon);
    }
  }
  return cells.map(cell => translateCell(cell, 0, ribbons[ribbonForCell.get(cell)!].shift));
}

function verticalRange(cell: FinishedCell, x: number): { top: number; bottom: number } {
  const left = Math.min(...cell.points.map(p => p.x));
  const right = Math.max(...cell.points.map(p => p.x));
  const leftEdge = cell.points.filter(p => p.x === left).map(p => p.y);
  const rightEdge = cell.points.filter(p => p.x === right).map(p => p.y);
  const ratio = (x - left) / (right - left);
  return {
    top: Math.min(...leftEdge) + ratio * (Math.min(...rightEdge) - Math.min(...leftEdge)),
    bottom: Math.max(...leftEdge) + ratio * (Math.max(...rightEdge) - Math.max(...leftEdge)),
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

function alignContinuingSplittees(
  candidates: FinishedCell[],
  lastVisibleByCord: Map<string, FinishedCell>,
): FinishedCell[] | undefined {
  const anchors = candidates.flatMap((cell, index) => {
    const previous = lastVisibleByCord.get(cell.event.splitteeId);
    if (!previous || previous.event.fromLane !== cell.event.toLane) return [];
    // The splittee leaves the old cell at the splitter's starting lane and
    // enters the new cell at the splitter's destination lane.
    const outgoingTop = previous.points[0];
    const incomingTop = cell.points[cell.event.toLane > cell.event.fromLane ? 3 : 1];
    return [{ index, x: outgoingTop.x - incomingTop.x, y: outgoingTop.y - incomingTop.y }];
  });
  if (!anchors.length) return undefined;

  // Each anchor keeps its own exact offset. Interpolate only the new or
  // returning cells between anchors, extending the nearest offset at an end.
  return candidates.map((cell, index) => {
    const next = anchors.findIndex(anchor => anchor.index >= index);
    const right = anchors[next === -1 ? anchors.length - 1 : next];
    const left = anchors[Math.max(0, (next === -1 ? anchors.length : next) - 1)];
    const ratio = right.index === left.index ? 0 : (index - left.index) / (right.index - left.index);
    return translateCell(cell,
      left.x + ratio * (right.x - left.x),
      left.y + ratio * (right.y - left.y));
  });
}

function actionStepDirection(
  action: SplitEvent[],
  lastVisibleByCord: Map<string, FinishedCell>,
  widthDrop: number,
): number {
  // A new section can work back up the existing cord ends. Choose the course
  // direction that best fits those ends, rather than always descending along
  // the action. With insufficient evidence (or a tie), keep the usual order.
  const error = (direction: number) => {
    const offsets = action.flatMap((event, index) => {
      const previous = lastVisibleByCord.get(event.splitteeId);
      if (!previous || previous.event.fromLane !== event.toLane) return [];
      // The incoming-corner offset is identical for every cell, so it does
      // not affect the variance used to choose the provisional row direction.
      return [previous.points[0].y - direction * index * widthDrop];
    });
    if (offsets.length < 2) return Infinity;
    const mean = offsets.reduce((sum, y) => sum + y, 0) / offsets.length;
    return offsets.reduce((sum, y) => sum + (y - mean) ** 2, 0);
  };
  return error(-1) + 0.001 < error(1) ? -1 : 1;
}

function minimumDownwardShift(
  candidates: FinishedCell[],
  placed: FinishedCell[],
  columnWidth: number,
  lastVisibleByCord: Map<string, FinishedCell>,
): number {
  if (!placed.length || !intersectsPlaced(candidates, placed, lastVisibleByCord)) return 0;

  const step = Math.max(0.5, columnWidth / 100);
  const placedBottom = Math.max(...placed.flatMap((cell) => cell.points.map((point) => point.y)));
  const candidateTop = Math.min(...candidates.flatMap((cell) => cell.points.map((point) => point.y)));
  const maximumShift = placedBottom - candidateTop + columnWidth * 2;

  for (let shift = step; shift <= maximumShift; shift += step) {
    const shifted = candidates.map((cell) => translateCell(cell, 0, shift));
    if (!intersectsPlaced(shifted, placed, lastVisibleByCord)) {
      let lower = shift - step;
      let upper = shift;
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const middle = (lower + upper) / 2;
        const middleCandidates = candidates.map((cell) =>
          translateCell(cell, 0, middle),
        );
        if (intersectsPlaced(middleCandidates, placed, lastVisibleByCord)) lower = middle;
        else upper = middle;
      }
      return upper;
    }
  }

  return maximumShift;
}

function intersectsPlaced(
  candidates: FinishedCell[],
  placed: FinishedCell[],
  lastVisibleByCord: Map<string, FinishedCell>,
): boolean {
  return candidates.some((candidate) =>
    !candidate.allowsOverlap
    && placed.some((existing) => {
      // Two footprints at a turn describe the same continuous cord. Only its
      // immediately preceding visible cell may overlap at this return edge.
      const turnsBack = existing === lastVisibleByCord.get(candidate.event.splitteeId)
        && existing.column === candidate.column
        && existing.event.fromLane === candidate.event.toLane;
      return !turnsBack && polygonsOverlap(candidate.points, existing.points);
    }),
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
