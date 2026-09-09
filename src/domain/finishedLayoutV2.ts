import type { FinishedCell, FinishedLayout, FinishedPoint } from './finishedLayout';
import type { Simulation, SplitEvent } from './types';

export type FinishedRuleId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

export type FinishedLink = {
  rule: FinishedRuleId;
  kind: 'order' | 'course' | 'continuation' | 'column' | 'return' | 'departure';
  cordId: string;
  /** Event indices, not array positions: the layout keeps one cell per event. */
  from: number;
  to: number;
  /** Required minimum (R0/R3) or exact (all other rules) y(to) - y(from). */
  delta: number;
  /** anchored: the rule placed the later cell. implied: already true.
   * conflicted: an exact rule yielded to a higher-priority constraint. */
  status: 'anchored' | 'implied' | 'conflicted';
  /** y(to) - y(from) - delta. Positive residuals satisfy R0/R3 minima. */
  residual: number;
};

export type FinishedLayoutV2 = FinishedLayout & {
  links: FinishedLink[];
  /** Number of equality-connected groups in the final placement audit. */
  runs: number;
};

type LayoutOptions = {
  theta?: number;
  columnWidth?: number;
  padding?: number;
  tipAngle?: number;
};

const tolerance = 0.000001;

/**
 * Finished layout v2 is a chronological, top-to-bottom placement pass.
 * Once a cell is placed its coordinates never change. For each new cell:
 *
 *   R0 keeps the new cell at or below the prior cell in its column.
 *   R1 proposes the preceding action corner.
 *   R2 takes precedence when the splittee continues a visible cord.
 *   R3 pushes only the new cell down far enough that it cannot overlap the
 *      previous cell of the same lean in the same column. A gap is valid.
 *   R4 is used when R1, R2, and R3 place no constraint on that cell, then R0
 *      still clamps it if the proposed role-change position would move upward.
 *
 * Opposite leans deliberately have no column constraint, so their inherited
 * placement may overlap or leave extra space.
 */
export function buildFinishedLayoutV2(
  simulation: Simulation,
  {
    theta = 30,
    columnWidth = 64,
    padding = 28,
    tipAngle = 30,
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

  const eventPositions = new Map(events.map((event, index) => [event.eventIndex, index]));
  const baseline = courseBaseline(events, eventPositions, crossGapDrop);
  const { y, links } = placeChronologically(
    events, eventPositions, baseline, { crossGapDrop, cellSide },
  );
  const returning = returningSplittees(events);
  const topOffset = padding + cellSide - crossGapDrop;
  const cells = events.map((event, index) => cellFor(
    event,
    { x: (event.fromLane - 1) * columnWidth + padding, y: y[index] + topOffset },
    { x: (event.toLane - 1) * columnWidth + padding, y: y[index] + crossGapDrop + topOffset },
    cellSide,
    returning[index],
  ));
  const maxY = Math.max(...cells.flatMap(cell => cell.points.map(point => point.y)));

  return {
    width: Math.max(320, columnCount * columnWidth + padding * 2),
    height: Math.max(260, maxY + padding),
    columnCount,
    cellSpan,
    cellSide,
    packedTipAngle,
    cells,
    links,
    runs: equalityRuns(events.length, links, eventPositions),
  };
}

function placeChronologically(
  events: SplitEvent[],
  eventPositions: Map<number, number>,
  baseline: number[],
  { crossGapDrop, cellSide }: { crossGapDrop: number; cellSide: number },
): { y: number[]; links: FinishedLink[] } {
  const y: number[] = [];
  const links: FinishedLink[] = [];
  const lastVisible = new Map<string, number>();
  const lastSplit = new Map<string, number>();
  const lastInColumn = new Map<number, number>();
  const lastSameLean = new Map<string, number>();

  const makeLink = (
    rule: FinishedRuleId,
    kind: FinishedLink['kind'],
    cordId: string,
    from: number,
    to: number,
    delta: number,
  ): FinishedLink => ({
    rule,
    kind,
    cordId,
    from: events[from].eventIndex,
    to: events[to].eventIndex,
    delta,
    status: 'conflicted',
    residual: 0,
  });

  for (const [index, event] of events.entries()) {
    const constraints: FinishedLink[] = [];
    const previous = events[index - 1];
    let order: FinishedLink | undefined;
    let course: FinishedLink | undefined;
    let continuation: FinishedLink | undefined;

    const columnIndex = columnOf(event);
    const previousInColumn = lastInColumn.get(columnIndex);
    if (previousInColumn !== undefined) {
      order = makeLink('R0', 'order', `column:${columnIndex}`, previousInColumn, index, 0);
      constraints.push(order);
    }

    if (previous && sameAction(previous, event)) {
      course = makeLink('R1', 'course', event.splitterId, index - 1, index, crossGapDrop);
      constraints.push(course);
    }

    const continuingIndex = lastVisible.get(event.splitteeId);
    const continuing = continuingIndex === undefined ? undefined : events[continuingIndex];
    const continuingAtBoundary = continuing?.fromLane === event.toLane;
    const continuationColumnDistance = continuing
      ? Math.abs(columnOf(continuing) - columnOf(event))
      : Infinity;
    if (continuingAtBoundary && continuationColumnDistance === 1) {
      continuation = makeLink(
        'R2', 'continuation', event.splitteeId, continuingIndex!, index,
        cellSide - crossGapDrop,
      );
      constraints.push(continuation);
    } else {
      const hostIndex = lastSplit.get(event.splitteeId);
      const host = hostIndex === undefined ? undefined : events[hostIndex];
      if (host && host.toLane === event.toLane && adjacent(host, event)) {
        constraints.push(makeLink(
          'R4', 'return', event.splitteeId, hostIndex!, index, cellSide / 2,
        ));
      }
    }

    const leavingIndex = lastVisible.get(event.splitterId);
    const leaving = leavingIndex === undefined ? undefined : events[leavingIndex];
    if (leaving && leaving.fromLane === event.fromLane && adjacent(leaving, event)) {
      constraints.push(makeLink(
        'R4', 'departure', event.splitterId, leavingIndex!, index, cellSide / 2,
      ));
    }

    // A same-gap opposite-lean reversal can continue along its shared edge,
    // but it is only a fallback. An explicit role change on this event keeps
    // R4 authority (Eyes e70/e87); without one, continuity places the turn
    // (Eyes e65/e82).
    if (continuingAtBoundary
      && continuationColumnDistance === 0
      && !constraints.some(link => link.rule === 'R4')) {
      continuation = makeLink(
        'R2', 'continuation', event.splitteeId, continuingIndex!, index,
        cellSide - crossGapDrop,
      );
      constraints.push(continuation);
    }

    const leanKey = `${columnIndex}:${leansRight(event)}`;
    const sameLeanIndex = lastSameLean.get(leanKey);
    let column: FinishedLink | undefined;
    if (sameLeanIndex !== undefined) {
      column = makeLink('R3', 'column', leanKey, sameLeanIndex, index, cellSide);
      constraints.push(column);
    }

    const roleChanges = constraints.filter(link => link.rule === 'R4');
    const hasOtherConstraint = Boolean(course || continuation || column);
    let placedBy: FinishedLink | undefined;
    let nextY = baseline[index];

    // R2 is the strongest exact proposal; R1 supplies the ordinary course
    // scaffold only when the cord itself has no continuation anchor.
    if (continuation) {
      nextY = y[continuingIndex!] + continuation.delta;
      placedBy = continuation;
    } else if (course) {
      nextY = y[index - 1] + course.delta;
      placedBy = course;
    } else if (!hasOtherConstraint && roleChanges.length) {
      // Event order plus immutability makes R4 a true fallback. If both a
      // return and departure exist, the first detected relation wins.
      const role = roleChanges[0];
      nextY = y[eventPosition(eventPositions, role.from)] + role.delta;
      placedBy = role;
    }

    if (order) {
      const minimumY = y[previousInColumn!];
      if (nextY < minimumY - tolerance) {
        nextY = minimumY;
        placedBy = order;
      }
    }

    if (column) {
      const minimumY = y[sameLeanIndex!] + column.delta;
      if (nextY < minimumY - tolerance) {
        nextY = minimumY;
        placedBy = column;
      }
    }

    y.push(nextY);
    lastInColumn.set(columnIndex, index);
    lastSameLean.set(leanKey, index);
    links.push(...constraints);

    for (const link of constraints) {
      const actual = nextY - y[eventPosition(eventPositions, link.from)];
      link.residual = actual - link.delta;
      const held = link.rule === 'R0' || link.rule === 'R3'
        ? link.residual >= -tolerance
        : Math.abs(link.residual) < tolerance;
      link.status = held ? (link === placedBy ? 'anchored' : 'implied') : 'conflicted';
    }

    lastVisible.set(event.splitteeId, index);
    lastVisible.delete(event.splitterId);
    lastSplit.set(event.splitterId, index);
    lastSplit.delete(event.splitteeId);
  }

  return { y, links };
}

function eventPosition(positions: Map<number, number>, eventIndex: number): number {
  const index = positions.get(eventIndex);
  if (index === undefined) throw new Error(`Finished layout cannot find event ${eventIndex}.`);
  return index;
}

function equalityRuns(
  count: number,
  links: FinishedLink[],
  eventPositions: Map<number, number>,
): number {
  const parent = Array.from({ length: count }, (_, index) => index);
  const find = (index: number): number => parent[index] === index
    ? index
    : (parent[index] = find(parent[index]));
  for (const link of links) {
    if (link.rule === 'R0' || link.rule === 'R3' || link.status === 'conflicted') continue;
    const from = find(eventPosition(eventPositions, link.from));
    const to = find(eventPosition(eventPositions, link.to));
    if (from !== to) parent[to] = from;
  }
  return new Set(parent.map((_, index) => find(index))).size;
}

/** Baselines are provisional and never translate an already placed cell. */
function courseBaseline(
  events: SplitEvent[],
  eventPositions: Map<number, number>,
  crossGapDrop: number,
): number[] {
  const baseline = new Array<number>(events.length).fill(0);
  const cordY = new Map<string, number>();
  let previousActionStart = 0;

  for (const action of splitActions(events)) {
    const splitterId = action[0].splitterId;
    const start = Math.max(cordY.get(splitterId) ?? 0, previousActionStart);
    action.forEach((event, step) => {
      baseline[eventPosition(eventPositions, event.eventIndex)] = start + step * crossGapDrop;
    });
    previousActionStart = start;
    for (const event of action) {
      const index = eventPosition(eventPositions, event.eventIndex);
      const end = baseline[index] + crossGapDrop;
      cordY.set(event.splitterId, end);
      cordY.set(event.splitteeId, end);
    }
  }
  return baseline;
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

function leansRight(event: SplitEvent): boolean {
  return event.toLane > event.fromLane;
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
