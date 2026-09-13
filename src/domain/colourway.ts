import { colorExpression, isCommentLine, paletteExpression, parsePattern, stripLineComment } from './parser.ts';
import type { Diagnostic } from './types';

/** A pattern's colouring, separate from its rows: the `color:` and `palette:` lines. */
export type Colourway = {
  /** Preset name; absent for a user's own design. */
  name?: string;
  /** One slot symbol per cord in starting order — the `color:` line. */
  cords: string[];
  /** Slot symbol → swatch (hex or CSS colour name) — the `palette:` line. May hold unused slots. */
  palette: Record<string, string>;
};

/** Swatches given to symbols in first-seen order when a pattern's palette: leaves them out. */
export const defaultSwatches = ['#d76b52', '#77b6c9', '#d3a448', '#6f8f65', '#a47aa3', '#dd8f45'];

/** Every symbol the notation allows, in allocation order. */
export const slotSymbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** What the parser accepts on the right of a palette assignment. */
const swatchExpression = /^(#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]+)$/i;

export function buildColorMap(symbols: string[], assignments: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  symbols.forEach((symbol) => {
    if (!map.has(symbol)) map.set(symbol, assignments[symbol] ?? defaultSwatches[map.size % defaultSwatches.length]);
  });
  return map;
}

/** The colourway a pattern text describes. Symbols without a palette: entry get a default swatch. */
export function readColourway(source: string): { colourway?: Colourway; diagnostics: Diagnostic[] } {
  const parsed = parsePattern(source);
  if (!parsed.pattern) return { diagnostics: parsed.diagnostics };
  const palette = Object.fromEntries(buildColorMap(parsed.pattern.colors, parsed.pattern.colorAssignments));
  // Slots the source defines but no cord uses are kept, as unused slots.
  Object.entries(parsed.pattern.colorAssignments).forEach(([symbol, swatch]) => {
    if (!(symbol in palette)) palette[symbol] = swatch;
  });
  return { colourway: { cords: [...parsed.pattern.colors], palette }, diagnostics: parsed.diagnostics };
}

/** Rewrite only the `color:` and `palette:` lines; every other line is kept byte for byte. */
export function applyColourway(source: string, colourway: Colourway): string {
  const lines = source.split('\n');
  let colorIndex = -1;
  let paletteIndex = -1;
  lines.forEach((rawLine, index) => {
    if (isCommentLine(rawLine)) return;
    const line = stripLineComment(rawLine);
    if (colorIndex < 0 && colorExpression.test(line)) colorIndex = index;
    else if (paletteIndex < 0 && paletteExpression.test(line)) paletteIndex = index;
  });
  if (colorIndex < 0) throw new Error('The pattern has no color: line to rewrite.');

  const ending = lines[colorIndex].endsWith('\r') ? '\r' : '';
  const colorLine = `color: ${colourway.cords.join('')}${ending}`;
  const paletteLine = `palette: ${paletteEntries(colourway).join(', ')}${ending}`;
  const output = [...lines];
  output[colorIndex] = colorLine;
  if (paletteIndex >= 0) output[paletteIndex] = paletteLine;
  else output.splice(colorIndex + 1, 0, paletteLine);
  return output.join('\n');
}

function paletteEntries(colourway: Colourway): string[] {
  return Object.keys(colourway.palette)
    .sort()
    .map((symbol) => `${symbol}=${colourway.palette[symbol]}`);
}

/** Paint the given cord indices (0-based) with one slot. */
export function paintCords(colourway: Colourway, indices: number[], symbol: string): Colourway {
  assertSlot(colourway, symbol);
  const targets = new Set(indices);
  return { ...colourway, cords: colourway.cords.map((current, index) => (targets.has(index) ? symbol : current)) };
}

export function setSwatch(colourway: Colourway, symbol: string, swatch: string): Colourway {
  assertSlot(colourway, symbol);
  return { ...colourway, palette: { ...colourway.palette, [symbol]: swatch } };
}

/** The next letter no slot uses, or undefined once all 26 are taken. */
export function nextUnusedSymbol(colourway: Colourway): string | undefined {
  return slotSymbols.find((symbol) => !(symbol in colourway.palette));
}

/** A default swatch no slot uses yet, cycling once they are all taken. */
export function nextSuggestedSwatch(colourway: Colourway): string {
  const used = new Set(Object.values(colourway.palette).map((swatch) => swatch.toLowerCase()));
  return defaultSwatches.find((swatch) => !used.has(swatch))
    ?? defaultSwatches[Object.keys(colourway.palette).length % defaultSwatches.length];
}

/** Add a slot on the next unused letter. Undefined when the alphabet is used up. */
export function addSlot(colourway: Colourway, swatch = nextSuggestedSwatch(colourway)): { colourway: Colourway; symbol: string } | undefined {
  const symbol = nextUnusedSymbol(colourway);
  if (!symbol) return undefined;
  return { symbol, colourway: { ...colourway, palette: { ...colourway.palette, [symbol]: swatch } } };
}

/** Remove a slot no cord uses. Undefined when it is in use or is the last slot. */
export function removeSlot(colourway: Colourway, symbol: string): Colourway | undefined {
  if (!(symbol in colourway.palette)) return undefined;
  if (Object.keys(colourway.palette).length <= 1) return undefined;
  if (colourway.cords.includes(symbol)) return undefined;
  const palette = { ...colourway.palette };
  delete palette[symbol];
  return { ...colourway, palette };
}

/** Repaint every cord of one slot with another and drop the first slot. */
export function replaceSlot(colourway: Colourway, from: string, to: string): Colourway {
  assertSlot(colourway, from);
  assertSlot(colourway, to);
  if (from === to) return colourway;
  const palette = { ...colourway.palette };
  delete palette[from];
  return { ...colourway, cords: colourway.cords.map((symbol) => (symbol === from ? to : symbol)), palette };
}

export function mirrorIndex(count: number, index: number): number {
  return count - 1 - index;
}

/** Copy one half onto the other, reflected. An odd middle cord is left alone. */
export function mirror(colourway: Colourway, from: 'left' | 'right'): Colourway {
  const count = colourway.cords.length;
  const half = Math.floor(count / 2);
  const cords = [...colourway.cords];
  for (let index = 0; index < half; index += 1) {
    const source = from === 'left' ? index : mirrorIndex(count, index);
    const target = mirrorIndex(count, source);
    cords[target] = colourway.cords[source];
  }
  return { ...colourway, cords };
}

export function fillAll(colourway: Colourway, symbol: string): Colourway {
  assertSlot(colourway, symbol);
  return { ...colourway, cords: colourway.cords.map(() => symbol) };
}

/** Exchange two slots everywhere they are used; swatches stay with their letters. */
export function swapSlots(colourway: Colourway, a: string, b: string): Colourway {
  assertSlot(colourway, a);
  assertSlot(colourway, b);
  return { ...colourway, cords: colourway.cords.map((symbol) => (symbol === a ? b : symbol === b ? a : symbol)) };
}

/** Cord count per slot, every slot included, in letter order. */
export function slotCounts(colourway: Colourway): Map<string, number> {
  const counts = new Map<string, number>(Object.keys(colourway.palette).sort().map((symbol) => [symbol, 0]));
  colourway.cords.forEach((symbol) => counts.set(symbol, (counts.get(symbol) ?? 0) + 1));
  return counts;
}

/** A stored colourway that still fits the template, or undefined. */
export function validateColourway(value: unknown, cordCount: number): Colourway | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { cords, palette, name } = value as Record<string, unknown>;
  if (!Array.isArray(cords) || cords.length !== cordCount) return undefined;
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) return undefined;
  const entries = Object.entries(palette as Record<string, unknown>);
  if (!entries.length) return undefined;
  const validPalette = entries.every(([symbol, swatch]) =>
    slotSymbols.includes(symbol) && typeof swatch === 'string' && swatchExpression.test(swatch));
  if (!validPalette) return undefined;
  if (!cords.every((symbol) => typeof symbol === 'string' && symbol in (palette as object))) return undefined;
  return {
    ...(typeof name === 'string' ? { name } : {}),
    cords: cords as string[],
    palette: { ...(palette as Record<string, string>) },
  };
}

export function colourwayStorageKey(templateId: string): string {
  return `scot-colourway:${templateId}`;
}

function assertSlot(colourway: Colourway, symbol: string) {
  if (!(symbol in colourway.palette)) throw new Error(`Unknown colour slot ${symbol}.`);
}
