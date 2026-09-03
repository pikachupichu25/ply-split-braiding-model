import type { Diagnostic, ParseResult, PatternAst, Repeat, RowInstruction } from './types';

const rowExpression = /^(\d+)\s+(\d+)\s*>\s*(\d+(?:\s*,\s*\d+)*)\s*$/;
const repeatExpression = /^\[\s*repeat\s+(\d+)\s*-\s*(\d+)(?:\s+x\s+(\d+))?\s*\]$/i;
const colorExpression = /^color\s*:\s*([A-Za-z]+)\s*$/i;

export function parsePattern(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const rows: RowInstruction[] = [];
  let colors: string[] | undefined;
  let repeat: Repeat | undefined;

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/#.*/, '').trim();
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
      if (repeat) {
        diagnostics.push(error(lineNumber, 1, 'Only one repeat instruction is allowed.'));
      } else {
        repeat = {
          fromRow: Number(repeatMatch[1]),
          throughRow: Number(repeatMatch[2]),
          ...(repeatMatch[3] ? { count: Number(repeatMatch[3]) } : {}),
        };
      }
      return;
    }

    diagnostics.push(error(lineNumber, 1, 'Expected color:, a row such as 1 1>2,3,4, or [repeat 1-2].'));
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

  if (repeat && (!numbers.has(repeat.fromRow) || !numbers.has(repeat.throughRow))) {
    diagnostics.push(error(1, 1, 'The repeat range must refer to existing rows.'));
  }

  if (!colors || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { diagnostics };
  }

  const pattern: PatternAst = { colors, rows, ...(repeat ? { repeat } : {}) };
  return { pattern, diagnostics };
}

function error(line: number, column: number, message: string): Diagnostic {
  return { line, column, message, severity: 'error' };
}
