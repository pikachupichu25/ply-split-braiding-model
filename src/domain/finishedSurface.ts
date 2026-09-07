import type { FinishedCell, FinishedPoint } from './finishedLayout';

type FinishedTransition = {
  kind: 'splitter-to-splittee' | 'splittee-to-splitter';
  cordId: string;
  hostEventIndex: number;
  hostCordId: string;
  fillCordId: string;
  points: [FinishedPoint, FinishedPoint, FinishedPoint];
  triangle: string;
  solidEdges: string;
  seam: string;
};

export type FinishedSurface = {
  cell: FinishedCell;
  path: string;
  emergence?: FinishedTransition;
  departure?: FinishedTransition;
};

const point = ({ x, y }: FinishedPoint) => `${x},${y}`;
const polygon = (points: FinishedPoint[]) => `M ${points.map(point).join(' L ')} Z`;
const line = (start: FinishedPoint, end: FinishedPoint) => `M ${point(start)} L ${point(end)}`;
const leansRight = (cell: FinishedCell) => cell.event.toLane > cell.event.fromLane;
const surfaceTolerance = 0.000001;

type FinishedSurfaceOptions = {
  /** Off renders each cell as its own untouched parallelogram: no transition
   * triangles, no overlap trim. On (the default) adds both. */
  enabled?: boolean;
};

/** Add the local intersection triangle without changing any original cell. */
export function buildFinishedSurfaces(
  cells: FinishedCell[],
  { enabled = true }: FinishedSurfaceOptions = {},
): FinishedSurface[] {
  if (!enabled) return cells.map((cell) => ({ cell, path: polygon(cell.points) }));

  const lastParticipation = new Map<string, FinishedCell>();
  const lastInColumn = new Map<number, FinishedCell>();

  return cells.map((cell) => {
    const above = lastInColumn.get(cell.column);
    // A leaning change is the one case column stacking allows to overlap
    // (finishedLayout.ts's packConnectedRibbons leaves it unconstrained). The
    // later cell keeps its placement but is drawn only below the earlier
    // cell's own bottom edge, so nothing renders over already-finished cord.
    const renderPoints = above && leansRight(above) !== leansRight(cell)
      ? clipBelowEdge(cell.points, bottomEdge(above))
      : cell.points;
    const surface: FinishedSurface = { cell, path: polygon(renderPoints) };
    const previousSplitter = lastParticipation.get(cell.event.splitterId);
    const previousSplittee = lastParticipation.get(cell.event.splitteeId);

    if (previousSplittee?.event.splitterId === cell.event.splitteeId) {
      surface.emergence = transitionTriangle(cell, previousSplittee, 'splitter-to-splittee');
    }
    if (previousSplitter?.event.splitteeId === cell.event.splitterId) {
      surface.departure = transitionTriangle(cell, previousSplitter, 'splittee-to-splitter');
    }

    lastParticipation.set(cell.event.splitterId, cell);
    lastParticipation.set(cell.event.splitteeId, cell);
    lastInColumn.set(cell.column, cell);
    return surface;
  });
}

/** The edge along the underside of the ribbon, in point order (left to right). */
function bottomEdge(cell: FinishedCell): [FinishedPoint, FinishedPoint] {
  return leansRight(cell)
    ? [cell.points[1], cell.points[2]]
    : [cell.points[2], cell.points[3]];
}

/**
 * Sutherland-Hodgman clip of a convex polygon against the half-plane on or
 * below a line through the two edge points (extended as y = f(x) by its own
 * slope). Only the drawn silhouette changes; the cell's own points, used for
 * packing and every other computation, are never touched.
 */
function clipBelowEdge(points: FinishedPoint[], edge: [FinishedPoint, FinishedPoint]): FinishedPoint[] {
  const [edgeStart, edgeEnd] = edge;
  const slope = (edgeEnd.y - edgeStart.y) / (edgeEnd.x - edgeStart.x);
  const edgeY = (x: number) => edgeStart.y + slope * (x - edgeStart.x);
  const isBelow = (p: FinishedPoint) => p.y >= edgeY(p.x) - surfaceTolerance;
  const intersect = (a: FinishedPoint, b: FinishedPoint): FinishedPoint => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denom = dy - slope * dx;
    if (Math.abs(denom) < surfaceTolerance) return a;
    const t = (edgeY(a.x) - a.y) / denom;
    return { x: a.x + t * dx, y: a.y + t * dy };
  };

  const output: FinishedPoint[] = [];
  const sameAsLast = (p: FinishedPoint) => {
    const last = output.at(-1);
    return last !== undefined && Math.abs(last.x - p.x) < surfaceTolerance
      && Math.abs(last.y - p.y) < surfaceTolerance;
  };
  points.forEach((current, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const currentBelow = isBelow(current);
    if (isBelow(previous) !== currentBelow) {
      const crossing = intersect(previous, current);
      if (!sameAsLast(crossing)) output.push(crossing);
    }
    if (currentBelow && !sameAsLast(current)) output.push(current);
  });
  return output.length >= 3 ? output : points;
}

function transitionTriangle(
  cell: FinishedCell,
  host: FinishedCell,
  kind: FinishedTransition['kind'],
): FinishedTransition | undefined {
  if (Math.abs(host.column - cell.column) !== 1) return undefined;
  const right = cell.event.toLane > cell.event.fromLane;
  const incoming = kind === 'splitter-to-splittee';
  const top = cell.points[incoming ? (right ? 3 : 1) : 0];
  const bottom = cell.points[incoming ? 2 : (right ? 1 : 3)];
  const outerTop = cell.points[incoming ? 0 : (right ? 3 : 1)];
  const hostEdge = host.points.filter(p => Math.abs(p.x - top.x) < 0.01);
  if (hostEdge.length !== 2) return undefined;
  const hostTop = hostEdge.reduce((a, b) => a.y < b.y ? a : b);
  const hostBottom = hostEdge.reduce((a, b) => a.y > b.y ? a : b);
  const hostOuterTop = host.points.filter(p => Math.abs(p.x - top.x) >= 0.01)
    .reduce((a, b) => a.y < b.y ? a : b);
  const span = Math.abs(outerTop.x - top.x);
  const hostSpan = Math.abs(hostOuterTop.x - hostTop.x);
  const direction = Math.sign(outerTop.x - top.x);
  const hostSlope = (hostTop.y - hostOuterTop.y) / (hostTop.x - hostOuterTop.x);
  const ribbonSlope = (outerTop.y - top.y) / (outerTop.x - top.x);
  const convergence = ribbonSlope - hostSlope;
  if (Math.abs(convergence) <= 0.000001) return undefined;

  // Continue the lower edge of the upper ribbon to the upper edge of the
  // lower ribbon. Only the interval between those edges forms the triangle;
  // using a whole vertical cell side or moving corners changes the silhouette.
  const currentAbove = top.y < hostTop.y;
  const currentCorner = currentAbove ? bottom : top;
  const hostCorner = currentAbove ? hostTop : hostBottom;
  const dx = (hostCorner.y - currentCorner.y) / convergence;
  const tip = { x: top.x + dx, y: currentCorner.y + ribbonSlope * dx };
  const distance = direction * dx;
  if (!Number.isFinite(tip.x) || !Number.isFinite(tip.y)
    || distance < -hostSpan - 0.01 || distance > span + 0.01) return undefined;

  // The material extends from the opposite side of the seam into the column
  // containing the intersection. Cord identity, not colour, determines fill.
  const fillCordId = distance >= 0 ? host.event.splitteeId : cell.event.splitteeId;
  return {
    kind,
    cordId: incoming ? cell.event.splitteeId : cell.event.splitterId,
    hostEventIndex: host.event.eventIndex,
    hostCordId: host.event.splitteeId,
    fillCordId,
    points: [currentCorner, hostCorner, tip],
    triangle: polygon([currentCorner, hostCorner, tip]),
    solidEdges: `M ${point(currentCorner)} L ${point(tip)} L ${point(hostCorner)}`,
    seam: line(currentCorner, hostCorner),
  };
}
