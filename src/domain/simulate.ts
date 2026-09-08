import type { Cord, Diagnostic, Face, PatternAst, RowInstruction, Simulation, Snapshot, SplitEvent } from './types';

export function simulatePattern(pattern: PatternAst, previewRepeats: number): Simulation {
  const diagnostics: Diagnostic[] = [];
  const cords: Cord[] = pattern.colors.map((colorSymbol, index) => ({
    id: `C${String(index + 1).padStart(2, '0')}`,
    colorSymbol,
  }));
  let lanes = [...cords];
  let face: Face = 'front';
  const events: SplitEvent[] = [];
  const snapshots: Snapshot[] = [{ face, lanes: [...lanes] }];
  const rows = expandRows(pattern, previewRepeats);

  rows.forEach((row, rowInstance) => {
    const laneCount = lanes.length;
    const allLanes = [row.splitterLane, ...row.splitteeLanes];
    if (allLanes.some((lane) => lane < 1 || lane > laneCount)) {
      diagnostics.push(error(row.sourceLine, `Row ${row.number} refers to a lane outside 1-${laneCount}.`));
      return;
    }
    if (new Set(allLanes).size !== allLanes.length) {
      diagnostics.push(error(row.sourceLine, `Row ${row.number} cannot split a lane more than once.`));
      return;
    }

    let splitterPosition = row.splitterLane - 1;
    const initialDirection = Math.sign(row.splitteeLanes[0] - row.splitterLane);
    if (initialDirection === 0) {
      diagnostics.push(error(row.sourceLine, `Row ${row.number} cannot split its own lane.`));
      return;
    }

    for (const [splitIndex, lane] of row.splitteeLanes.entries()) {
      const targetPosition = lane - 1;
      if (Math.abs(targetPosition - splitterPosition) !== 1) {
        diagnostics.push(error(row.sourceLine, `Row ${row.number} is not physically adjacent at ${row.splitterLane}>${row.splitteeLanes.join(',')}.`));
        return;
      }
      if (Math.sign(targetPosition - splitterPosition) !== initialDirection) {
        diagnostics.push(error(row.sourceLine, `Row ${row.number} reverses direction inside one splitting action.`));
        return;
      }

      const lanesBefore = [...lanes];
      const splitter = lanes[splitterPosition];
      const splittee = lanes[targetPosition];
      [lanes[splitterPosition], lanes[targetPosition]] = [lanes[targetPosition], lanes[splitterPosition]];
      events.push({
        eventIndex: events.length,
        rowInstance: rowInstance + 1,
        sourceRow: row.number,
        splitIndex: splitIndex + 1,
        splitCount: row.splitteeLanes.length,
        face,
        splitterId: splitter.id,
        splitteeId: splittee.id,
        fromLane: splitterPosition + 1,
        toLane: targetPosition + 1,
        lanesBefore,
        lanesAfter: [...lanes],
      });
      splitterPosition = targetPosition;
      snapshots.push({ face, lanes: [...lanes] });
    }
    face = face === 'front' ? 'back' : 'front';
  });

  return { events, snapshots, diagnostics, totalRows: rows.length };
}

function expandRows(pattern: PatternAst, previewRepeats: number): RowInstruction[] {
  const written = expandRepeatSections(pattern, previewRepeats);
  if (pattern.repeats.some((repeat) => repeat.count === undefined)) return written;

  // Nothing inside the pattern is open-ended, so the preview length works the
  // whole written pattern that many times over.
  const expanded: RowInstruction[] = [];
  for (let iteration = 0; iteration < previewRepeats; iteration += 1) expanded.push(...written);
  return expanded;
}

function expandRepeatSections(pattern: PatternAst, previewRepeats: number): RowInstruction[] {
  if (!pattern.repeats.length) return pattern.rows;

  const ranges = pattern.repeats.map((repeat) => ({
    repeat,
    start: pattern.rows.findIndex((row) => row.number === repeat.fromRow),
    end: pattern.rows.findIndex((row) => row.number === repeat.throughRow),
  })).filter((range) => range.start >= 0 && range.end >= range.start)
    .sort((a, b) => a.start - b.start);

  const expanded: RowInstruction[] = [];
  let cursor = 0;
  ranges.forEach(({ repeat, start, end }) => {
    expanded.push(...pattern.rows.slice(cursor, start));
    const unit = pattern.rows.slice(start, end + 1);
    const count = repeat.count ?? previewRepeats;
    for (let iteration = 0; iteration < count; iteration += 1) expanded.push(...unit);
    cursor = end + 1;
  });
  expanded.push(...pattern.rows.slice(cursor));
  return expanded;
}

function error(line: number, message: string): Diagnostic {
  return { line, column: 1, message, severity: 'error' };
}
