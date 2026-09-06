import type { Diagnostic, ParseResult, PatternAst, Repeat, RowInstruction } from './types';

const rowExpression = /^(\d+)\s+(\d+)\s*>\s*(\d+(?:\s*,\s*\d+)*)\s*$/;
const repeatExpression = /^\[\s*repeat\s+(\d+)\s*-\s*(\d+)(?:\s+x\s+(\d+))?\s*\]$/i;
const colorExpression = /^color\s*:\s*([A-Za-z]+)\s*$/i;
const paletteExpression = /^palette\s*:\s*(.*?)\s*$/i;
const paletteEntryExpression = /^([A-Za-z])\s*=\s*(#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]+)$/i;

export function parsePattern(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const rows: RowInstruction[] = [];
  let colors: string[] | undefined;
  let colorAssignments: Record<string, string> | undefined;
  const repeats: Repeat[] = [];

  source.split(/\r?\n/).forEach((rawLine, index) => {
    if (rawLine.trimStart().startsWith('#')) return;
    const line = rawLine
      .replace(/\s+#(?!(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})(?:\s|,|$)).*$/i, '')
      .trim();
    const lineNumber = index + 1;
    if (!line) return;

    const colorMatch = line.match(colorExpression);
    if (colorMatch) {
      if (colors) {
        diagnostics.push(error(lineNumber, 1, 'Only one color: line is allowed.'));
      } else {
        colors = colorMatch[1].toUpperCase().split('');
      }
      return;
    }

    const paletteMatch = line.match(paletteExpression);
    if (paletteMatch) {
      if (colorAssignments) {
        diagnostics.push(error(lineNumber, 1, 'Only one palette: line is allowed.'));
        return;
      }

      colorAssignments = {};
      const entries = paletteMatch[1].split(',').map((entry) => entry.trim()).filter(Boolean);
      if (!entries.length) {
        diagnostics.push(error(lineNumber, 1, 'Add at least one assignment, such as A=#d76b52.'));
        return;
      }
      entries.forEach((entry) => {
        const match = entry.match(paletteEntryExpression);
        if (!match) {
          diagnostics.push(error(lineNumber, 1, `Invalid palette assignment "${entry}". Use A=#d76b52 or A=brown.`));
          return;
        }
        const symbol = match[1].toUpperCase();
        if (colorAssignments![symbol]) {
          diagnostics.push(error(lineNumber, 1, `Palette colour for ${symbol} is specified more than once.`));
          return;
        }
        colorAssignments![symbol] = match[2].toLowerCase();
      });
      return;
    }

    const rowMatch = line.match(rowExpression);
    if (rowMatch) {
      rows.push({
        number: Number(rowMatch[1]),
        splitterLane: Number(rowMatch[2]),
        splitteeLanes: rowMatch[3].split(',').map((value) => Number(value.trim())),
        sourceLine: lineNumber,
      });
      return;
    }

    const repeatMatch = line.match(repeatExpression);
    if (repeatMatch) {
      repeats.push({
        fromRow: Number(repeatMatch[1]),
        throughRow: Number(repeatMatch[2]),
        ...(repeatMatch[3] ? { count: Number(repeatMatch[3]) } : {}),
      });
      return;
    }

    diagnostics.push(error(lineNumber, 1, 'Expected color:, optional palette:, a row such as 1 1>2,3,4, or [repeat 1-2].'));
  });

  if (!colors) {
    diagnostics.push(error(1, 1, 'Start the pattern with a color: sequence.'));
  } else if (colors.length < 3) {
    diagnostics.push(error(1, 1, 'A flat SCOT preview needs at least three cords.'));
  }

  if (rows.length === 0) {
    diagnostics.push(error(1, 1, 'Add at least one SCOT row instruction.'));
  }

  const numbers = new Set<number>();
  rows.forEach((row) => {
    if (numbers.has(row.number)) diagnostics.push(error(row.sourceLine, 1, `Row ${row.number} is duplicated.`));
    numbers.add(row.number);
  });

  const rowIndexes = new Map(rows.map((row, index) => [row.number, index]));
  const repeatRanges = repeats.map((repeat) => ({
    repeat,
    start: rowIndexes.get(repeat.fromRow),
    end: rowIndexes.get(repeat.throughRow),
  }));
  repeatRanges.forEach(({ repeat, start, end }) => {
    if (start === undefined || end === undefined) {
      diagnostics.push(error(1, 1, `Repeat ${repeat.fromRow}-${repeat.throughRow} must refer to existing rows.`));
    } else if (end < start) {
      diagnostics.push(error(1, 1, `Repeat ${repeat.fromRow}-${repeat.throughRow} must run forwards through the written rows.`));
    }
    if (repeat.count !== undefined && repeat.count < 1) {
      diagnostics.push(error(1, 1, `Repeat ${repeat.fromRow}-${repeat.throughRow} needs a positive count.`));
    }
  });

  const validRanges = repeatRanges
    .filter((range): range is typeof range & { start: number; end: number } => (
      range.start !== undefined && range.end !== undefined && range.start <= range.end
    ))
    .sort((a, b) => a.start - b.start);
  validRanges.slice(1).forEach((range, index) => {
    if (range.start <= validRanges[index].end) {
      diagnostics.push(error(1, 1, 'Repeat ranges cannot overlap.'));
    }
  });

  if (!colors || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { diagnostics };
  }

  const pattern: PatternAst = { colors, colorAssignments: colorAssignments ?? {}, rows, repeats };
  return { pattern, diagnostics };
}

function error(line: number, column: number, message: string): Diagnostic {
  return { line, column, message, severity: 'error' };
}
