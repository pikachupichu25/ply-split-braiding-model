import type { Colourway } from '../domain/colourway';

const hexExpression = /^#[0-9a-f]{6}$/i;
let context: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour the parser accepts as lowercase `#rrggbb`, via the browser's own parser. */
export function toHex(colour: string): string {
  if (hexExpression.test(colour)) return colour.toLowerCase();
  if (context === undefined) context = document.createElement('canvas').getContext('2d');
  if (!context) return colour;
  context.fillStyle = '#000000';
  context.fillStyle = colour;
  const value = context.fillStyle;
  if (hexExpression.test(value)) return value.toLowerCase();
  const channels = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!channels) return colour;
  return `#${channels.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
}

export function isHex(value: string): boolean {
  return hexExpression.test(value);
}

/** The same design with every swatch written as `#rrggbb`. */
export function normaliseColourway(colourway: Colourway): Colourway {
  return {
    ...colourway,
    palette: Object.fromEntries(Object.entries(colourway.palette).map(([symbol, swatch]) => [symbol, toHex(swatch)])),
  };
}

/** Ink colour that stays legible on a swatch. */
export function readableTextOn(colour: string): string {
  const hex = toHex(colour);
  if (!hexExpression.test(hex)) return '#17293d';
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#17293d' : '#f8f0de';
}
