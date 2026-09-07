import type { FinishedCell, FinishedLayout, FinishedPoint } from './finishedLayout';
import type { Simulation, SplitEvent } from './types';

/** Placement rules kept in v2: the action scaffold, the cord join, the role change. */
export type FinishedRuleId = 'R1' | 'R2' | 'R4';

export type FinishedLink = {
  rule: FinishedRuleId;
  kind: 'course' | 'continuation' | 'return' | 'departure';
  cordId: string;
  /** Event indices, not array positions: the layout keeps one cell per event. */
  from: number;
  to: number;
  /** Required y(to) − y(from) between the two cells' reference corners. */
  delta: number;
  /** anchored: this link placed the cell. implied: already true. conflicted: dropped. */
  status: 'anchored' | 'implied' | 'conflicted';
  /** Signed amount by which an implied or conflicted link misses its delta. */
  residual: number;
};

export type FinishedLayoutV2 = FinishedLayout & {
  links: FinishedLink[];
  /** Groups of cells no rule ties together; each is placed on the course baseline. */
  runs: number;
};

type LayoutOptions = {
  theta?: number;
  columnWidth?: number;
  padding?: number;
  tipAngle?: number;
  /** The rules to apply, in order of authority. The default follows the spec:
   * R2 exact, R4 exact where free, R1 provisional. Reordering trades one
   * rule's exactness for another's — putting R1 ahead of R4 keeps actions
   * rigid and drops the role changes that disagree with them. A rule left out
   * of the list is not applied at all. */
  rulePriority?: FinishedRuleId[];
};

const defaultPriority: FinishedRuleId[] = ['R2', 'R4', 'R1'];

const tolerance = 0.000001;

/**
 * Finished layout v2. Every cell's vertical position is one number — the y of
 * its `start` corner — and each rule is a constant offset between two of them:
 *
 *   R1 course      y(next)  = y(previous) + crossGapDrop
 *   R2 cord join   y(cell)  = y(previous visible cell) + cellSide − crossGapDrop
 *   R4 role change y(cell)  = y(neighbour) + cellSide / 2
 *
 * The rules are applied in that order of authority — R2, then R4, then R1 —
 * onto a union-find of cells that already share a fixed offset. A link between
 * two separate groups places one of them exactly; a link inside one group is
 * only checked, never enforced, so no rule can reopen a join an earlier rule
 * made exact. Column packing (R3) is deliberately absent: cells in a column sit
 * where their own runs leave them.
 */
export function buildFinishedLayoutV2(
  simulation: Simulation,
  {
    theta = 30,
    columnWidth = 64,
    padding = 28,
    tipAngle = 30,
    rulePriority = defaultPriority,
  }: LayoutOptions = {},
): FinishedLayoutV2 {
  const laneCount = simulation.snapshots[0]?.lanes.length ?? 0;
  const columnCount = Math.max(0, laneCount - 1);
  const safeTheta = Math.min(75, Math.max(10, theta));
  const safeTip = Math.min(90, Math.max(10, tipAngle));
  const cellSpan = columnWidth / Math.cos(safeTheta * Math.PI / 180);
  const crossGapDrop = columnWidth * Math.tan(safeTheta * Math.PI / 180);
  const cellSide = crossGapDrop + columnWidth / Math.tan(safeTip * Math.PI / 180);
  const packedTipAngle = 2 * safeTheta;
  const events = simulation.events;

  if (!events.length) {
    return {
      width: Math.max(320, columnCount * columnWidth + padding * 2),
      height: 360,
      columnCount,
      cellSpan,
      cellSide,
      packedTipAngle,
      cells: [],
      links: [],
      runs: 0,
    };
  }

  const links = collectLinks(events, { crossGapDrop, cellSide }, rulePriority);
  const solved = solveOffsets(events, links);
  const baseline = courseBaseline(events, crossGapDrop);
  const y = placeRuns(events, solved, baseline);

  const returning = returningSplittees(events);
  const cells = events.map((event, index) => cellFor(
    event,
    { x: (event.fromLane - 1) * columnWidth, y: y[index] },
    { x: (event.toLane - 1) * columnWidth, y: y[index] + crossGapDrop },
    cellSide,
    returning[index],
  ));

  const allPoints = cells.flatMap((cell) => cell.points);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));

  return {
    width: Math.max(320, maxX - minX + padding * 2),
    height: Math.max(260, maxY - minY + padding * 2),
    columnCount,
    cellSpan,
    cellSide,
    packedTipAngle,
    cells: cells.map((cell) => translateCell(cell, padding - minX, padding - minY)),
    links,
    runs: solved.runs,
  };
}

/**
 * One pass over the events collects every link each rule asks for; the result
 * is returned in the caller's order of authority, not in event order.
 */
function collectLinks(
  events: SplitEvent[],
  { crossGapDrop, cellSide }: { crossGapDrop: number; cellSide: number },
  priority: FinishedRuleId[],
): FinishedLink[] {
  const byRule: Record<FinishedRuleId, FinishedLink[]> = { R1: [], R2: [], R4: [] };
  const join = byRule.R2;
  const role = byRule.R4;
  const course = byRule.R1;
  const lastVisible = new Map<string, SplitEvent>();
  const lastSplit = new Map<string, SplitEvent>();
  const link = (
    rule: FinishedRuleId,
    kind: FinishedLink['kind'],
    cordId: string,
    from: SplitEvent,
    to: SplitEvent,
    delta: number,
  ): FinishedLink => ({
    rule, kind, cordId, from: from.eventIndex, to: to.eventIndex, delta,
    status: 'conflicted', residual: 0,
  });

  for (const [index, event] of events.entries()) {
    const previous = events[index - 1];
    if (previous && sameAction(previous, event)) {
      // R1: the splitter leaves one cell exactly where it enters the next, so
      // the whole action hangs off one straight line, one drop per column.
      course.push(link('R1', 'course', event.splitterId, previous, event, crossGapDrop));
    }

    const continuing = lastVisible.get(event.splitteeId);
    if (continuing
      && continuing.fromLane === event.toLane
      && adjacent(continuing, event)) {
      // R2: the cord's outgoing top corner is the next cell's incoming top
      // corner, which shares the whole edge because both sides are cellSide.
      join.push(link('R2', 'continuation', event.splitteeId,
        continuing, event, cellSide - crossGapDrop));
    } else {
      const host = lastSplit.get(event.splitteeId);
      if (host && host.toLane === event.toLane && adjacent(host, event)) {
        // R4, the return: the cord stops splitting and comes back beside its
        // own last cell, half a side down its neighbour's edge.
        role.push(link('R4', 'return', event.splitteeId, host, event, cellSide / 2));
      }
    }

    const leaving = lastVisible.get(event.splitterId);
    if (leaving && leaving.fromLane === event.fromLane && adjacent(leaving, event)) {
      // R4, the departure: the mirror of the return, anchored on the edge the
      // cord's last visible cell keeps at the lane it splits from.
      role.push(link('R4', 'departure', event.splitterId, leaving, event, cellSide / 2));
    }

    lastVisible.set(event.splitteeId, event);
    lastVisible.delete(event.splitterId);
    lastSplit.set(event.splitterId, event);
    lastSplit.delete(event.splitteeId);
  }

  // Authority order, not event order: the first rule to reach a pair of cells
  // places them, and a later rule can only agree or be recorded as conflicted.
  return priority.flatMap((rule) => byRule[rule]);
}

/**
 * Union-find over cells, carrying each cell's offset from its group's root.
 * A link across two groups fixes them relative to each other and is recorded
 * as anchored; a link inside one group is measured against what the group
 * already says and recorded as implied or conflicted, but never enforced.
 */
function solveOffsets(
  events: SplitEvent[],
  links: FinishedLink[],
): { offset: number[]; root: number[]; runs: number } {
  const parent = events.map((_, index) => index);
  const offset = events.map(() => 0);
  const find = (index: number): number => {
    if (parent[index] === index) return index;
    const root = find(parent[index]);
    offset[index] += offset[parent[index]];
    parent[index] = root;
    return root;
  };

  for (const item of links) {
    const from = find(item.from);
    const to = find(item.to);
    if (from === to) {
      const implied = offset[item.to] - offset[item.from];
      item.residual = implied - item.delta;
      item.status = Math.abs(item.residual) < tolerance ? 'implied' : 'conflicted';
      continue;
    }
    parent[to] = from;
    offset[to] = offset[item.from] + item.delta - offset[item.to];
    item.status = 'anchored';
    item.residual = 0;
  }

  const root = events.map((_, index) => find(index));
  return { offset, root, runs: new Set(root).size };
}

/**
 * Where no rule reaches — the first cell of the braid, and any run the rules
 * leave detached — the cell falls back to the course baseline: an action
 * starts below the ends its own splitter and the previous action left behind.
 */
function courseBaseline(events: SplitEvent[], crossGapDrop: number): number[] {
  const baseline = new Array<number>(events.length).fill(0);
  const cordY = new Map<string, number>();
  let previousActionStart = 0;

  for (const action of splitActions(events)) {
    const splitterId = action[0].splitterId;
    const start = Math.max(cordY.get(splitterId) ?? 0, previousActionStart);
    action.forEach((event, step) => { baseline[event.eventIndex] = start + step * crossGapDrop; });
    previousActionStart = start;
    for (const event of action) {
      const end = baseline[event.eventIndex] + crossGapDrop;
      cordY.set(event.splitterId, end);
      cordY.set(event.splitteeId, end);
    }
  }
  return baseline;
}

/** Translate each run as one body: its earliest cell lands on the baseline. */
function placeRuns(
  events: SplitEvent[],
  { offset, root }: { offset: number[]; root: number[] },
  baseline: number[],
): number[] {
  const runOffset = new Map<number, number>();
  events.forEach((_, index) => {
    if (runOffset.has(root[index])) return;
    runOffset.set(root[index], baseline[index] - offset[index]);
  });
  return events.map((_, index) => runOffset.get(root[index])! + offset[index]);
}

/** A cord returning to the surface may overlap the cell it emerges from. */
function returningSplittees(events: SplitEvent[]): boolean[] {
  const role = new Map<string, 'splitter' | 'splittee'>();
  return events.map((event) => {
    const returning = role.get(event.splitteeId) === 'splitter';
    role.set(event.splitteeId, 'splittee');
    role.set(event.splitterId, 'splitter');
    return returning;
  });
}

function sameAction(previous: SplitEvent, event: SplitEvent): boolean {
  return previous.rowInstance === event.rowInstance
    && previous.splitterId === event.splitterId;
}

function adjacent(a: SplitEvent, b: SplitEvent): boolean {
  return Math.abs(columnOf(a) - columnOf(b)) === 1;
}

function columnOf(event: SplitEvent): number {
  return Math.min(event.fromLane, event.toLane);
}

function splitActions(events: SplitEvent[]): SplitEvent[][] {
  const actions: SplitEvent[][] = [];
  for (const event of events) {
    const current = actions.at(-1);
    if (current && sameAction(current[0], event)) current.push(event);
    else actions.push([event]);
  }
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
    column: columnOf(event),
    allowsOverlap,
    points: end.x > start.x
      ? [start, startBottom, end, endTop]
      : [start, endTop, end, startBottom],
  };
}

function translateCell(cell: FinishedCell, deltaX: number, deltaY: number): FinishedCell {
  return {
    ...cell,
    points: cell.points.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    })) as FinishedCell['points'],
  };
}
