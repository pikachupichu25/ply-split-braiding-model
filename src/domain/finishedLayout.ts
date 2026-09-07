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

const layoutTolerance = 0.000001;

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
  const lastSplitByCord = new Map<string, FinishedCell>();
  const lastRoleByCord = new Map<string, 'splitter' | 'splittee'>();
  const placed: FinishedCell[] = [];
  let previousActionStart = 0;

  splitActions(simulation.events).forEach((action) => {
    const splitterId = action[0]?.splitterId;
    if (!splitterId) return;
    // The splitter's visible run ends here, but its last cell still places
    // the cell in which it leaves the surface.
    const departure = lastVisibleByCord.get(splitterId);
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

    const aligned = alignContinuingSplittees(
      candidates, lastVisibleByCord, lastSplitByCord, departure, cellSide,
    );
    // Establish exact ribbon connections first. Final packing handles column
    // spacing for both lean directions while preserving these joins.
    const shifted = aligned ?? candidates;
    placed.push(...shifted);
    previousActionStart = shifted[0].points[0].y;

    shifted.forEach((cell) => {
      const end = crossGapEnd(cell);
      cordY.set(cell.event.splitterId, end.y);
      cordY.set(cell.event.splitteeId, end.y);
      lastVisibleByCord.set(cell.event.splitteeId, cell);
      lastSplitByCord.set(cell.event.splitterId, cell);
      lastSplitByCord.delete(cell.event.splitteeId);
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
  type Constraint = { from: number; to: number; distance: number };
  const constraints: Constraint[] = [];
  const lastParticipation = new Map<string, number>();
  const lastSplitByCord = new Map<string, number>();
  const lastSplitteeByCord = new Map<string, number>();
  const transitions: { from: number; to: number }[] = [];
  const lastInColumn = new Map<number, number>();
  const lastByDirection = new Map<string, number>();
  const leansRight = (cell: FinishedCell) => cell.event.toLane > cell.event.fromLane;

  // Cells joined by an exact contact move as one body. Tracking those bodies
  // keeps a later exact rule from contradicting the ones already applied.
  const body = cells.map((_, index) => index);
  const bodyOf = (index: number): number =>
    body[index] === index ? index : (body[index] = bodyOf(body[index]));
  const connect = (from: number, to: number, distance: number) => {
    constraints.push({ from, to, distance }, { from: to, to: from, distance: -distance });
    body[bodyOf(from)] = bodyOf(to);
  };
  const separation = (above: FinishedCell, below: FinishedCell) => {
    const left = Math.min(...below.points.map(p => p.x));
    const right = Math.max(...below.points.map(p => p.x));
    return [left, right].map(x =>
      verticalRange(above, x).bottom - verticalRange(below, x).top);
  };

  for (const [index, cell] of cells.entries()) {
    const previousIndex = lastParticipation.get(cell.event.splitteeId);
    const previous = previousIndex === undefined ? undefined : cells[previousIndex];
    if (previous?.event.splitteeId === cell.event.splitteeId
      && Math.abs(previous.column - cell.column) === 1) {
      // Adjacent splittee cells were aligned before packing. Their full-edge
      // join stays fixed, including across changes in the working direction.
      connect(previousIndex!, index, 0);
    }

    const aboveIndex = lastInColumn.get(cell.column);
    if (aboveIndex !== undefined) {
      const above = cells[aboveIndex];
      const distances = separation(above, cell);
      if (leansRight(above) === leansRight(cell)) {
        // Equal slopes: matching one endpoint matches the complete edge.
        connect(aboveIndex, index, distances[0]);
      }
      // Opposite directions have no fixed packing distance. Their cord runs
      // determine placement: partial overlap and open space are both valid.
      // Event order is preserved in drawing order, not by forcing these
      // different courses into a compact vertical stack.
    }

    // An intervening opposite lean must not allow two same-leaning cells to
    // overlap. The nearest earlier cell of each direction bounds all of them.
    const directionKey = `${cell.column}:${leansRight(cell)}`;
    const sameDirection = lastByDirection.get(directionKey);
    if (sameDirection !== undefined && sameDirection !== aboveIndex) {
      constraints.push({ from: sameDirection, to: index,
        distance: Math.max(...separation(cells[sameDirection], cell)) });
    }
    lastByDirection.set(directionKey, index);
    lastInColumn.set(cell.column, index);
    const hostIndex = lastSplitByCord.get(cell.event.splitteeId);
    if (hostIndex !== undefined
      && cells[hostIndex].event.toLane === cell.event.toLane
      && Math.abs(cells[hostIndex].column - cell.column) === 1) {
      transitions.push({ from: hostIndex, to: index });
    }

    const leavingIndex = lastSplitteeByCord.get(cell.event.splitterId);
    if (leavingIndex !== undefined
      && cells[leavingIndex].event.fromLane === cell.event.fromLane
      && Math.abs(cells[leavingIndex].column - cell.column) === 1) {
      transitions.push({ from: leavingIndex, to: index });
    }

    lastParticipation.set(cell.event.splitteeId, index);
    lastParticipation.set(cell.event.splitterId, index);
    lastSplitByCord.set(cell.event.splitterId, index);
    lastSplitByCord.delete(cell.event.splitteeId);
    lastSplitteeByCord.set(cell.event.splitteeId, index);
    lastSplitteeByCord.delete(cell.event.splitterId);
  }

  // A cord changing roles was aligned to the centre of its neighbour's side.
  // Hold that placement wherever the cord joins and column contacts have not
  // already fixed the two cells relative to each other, and admit each one
  // only while the whole system still resolves: a role change never reopens
  // a cord join, a column contact, or an interior overlap to make room for
  // itself. Where it cannot be held, the cell keeps its aligned placement.
  let shifts = solveShifts(constraints, cells.length).shifts;
  if (!shifts) {
    throw new Error('Finished layout has incompatible same-direction spacing constraints.');
  }
  for (const { from, to } of transitions) {
    if (bodyOf(from) === bodyOf(to)) continue;
    const held: Constraint[] = [
      { from, to, distance: 0 }, { from: to, to: from, distance: 0 },
    ];
    const solved = solveShifts([...constraints, ...held], cells.length);
    if (!solved.shifts) continue;
    constraints.push(...held);
    body[bodyOf(from)] = bodyOf(to);
    shifts = solved.shifts;
  }

  return cells.map((cell, index) => translateCell(cell, 0, shifts![index]));
}

function solveShifts(
  constraints: { from: number; to: number; distance: number }[],
  count: number,
): { shifts?: number[]; blocked: Set<number> } {
  const shifts = new Array<number>(count).fill(0);
  for (let pass = 0; pass < count; pass += 1) {
    const changed = new Set<number>();
    for (const { from, to, distance } of constraints) {
      const required = shifts[from] + distance;
      if (required <= shifts[to] + layoutTolerance) continue;
      shifts[to] = required;
      changed.add(to);
    }
    if (!changed.size) return { shifts, blocked: changed };
    if (pass === count - 1) return { blocked: changed };
  }
  return { blocked: new Set<number>() };
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
  lastSplitByCord: Map<string, FinishedCell>,
  departure: FinishedCell | undefined,
  cellSide: number,
): FinishedCell[] | undefined {
  const anchors = candidates.flatMap((cell, index) => {
    const incomingTop = cell.points[cell.event.toLane > cell.event.fromLane ? 3 : 1];
    const previous = lastVisibleByCord.get(cell.event.splitteeId);
    if (previous && previous.event.fromLane === cell.event.toLane) {
      // The splittee leaves the old cell at the splitter's starting lane and
      // enters the new cell at the splitter's destination lane.
      const outgoingTop = previous.points[0];
      return [{ index, x: outgoingTop.x - incomingTop.x, y: outgoingTop.y - incomingTop.y }];
    }
    // A cord with no visible end may still be changing roles across a shared
    // boundary, which anchors the cell just as exactly. Both directions put
    // the later cell's top corner at the centre of the side the earlier cell
    // keeps there: the returning cord enters at its host's centre, and the
    // departing cord leaves at the centre of its own last visible cell.
    const host = lastSplitByCord.get(cell.event.splitteeId);
    if (host?.event.toLane === cell.event.toLane) {
      const centre = transitionCentre(host, cell, incomingTop.x, cellSide);
      if (centre !== undefined) return [{ index, x: 0, y: centre - incomingTop.y }];
    }
    const outgoingTop = cell.points[0];
    if (departure?.event.fromLane === cell.event.fromLane) {
      const centre = transitionCentre(departure, cell, outgoingTop.x, cellSide);
      if (centre !== undefined) return [{ index, x: 0, y: centre - outgoingTop.y }];
    }
    return [];
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

function transitionCentre(
  neighbour: FinishedCell,
  cell: FinishedCell,
  boundaryX: number,
  cellSide: number,
): number | undefined {
  // The cord has not moved between the two events, so both cells keep a full
  // side on the boundary at its lane.
  if (Math.abs(neighbour.column - cell.column) !== 1) return undefined;
  const edge = neighbour.points.filter(point => Math.abs(point.x - boundaryX) < layoutTolerance);
  if (edge.length !== 2) return undefined;
  // Meeting at the centre of that side keeps the role change beside its own
  // neighbour, however many unrelated events ran in between.
  return Math.min(...edge.map(point => point.y)) + cellSide / 2;
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
