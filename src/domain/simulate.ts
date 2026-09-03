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
  if (!pattern.repeat) return pattern.rows;
  const start = pattern.rows.findIndex((row) => row.number === pattern.repeat?.fromRow);
  const end = pattern.rows.findIndex((row) => row.number === pattern.repeat?.throughRow);
  if (start < 0 || end < start) return pattern.rows;
  const before = pattern.rows.slice(0, start);
  const unit = pattern.rows.slice(start, end + 1);
  const after = pattern.rows.slice(end + 1);
  const count = pattern.repeat.count ?? previewRepeats;
  return [...before, ...Array.from({ length: count }, () => unit).flat(), ...after];
}

function error(line: number, message: string): Diagnostic {
  return { line, column: 1, message, severity: 'error' };
}
