import { readColourway } from '../domain/colourway.ts';
import type { Colourway } from '../domain/colourway.ts';
import { chevronPattern } from './chevron.ts';
import { colorBlock8Pattern } from './colorBlock8.ts';

/** A bundled sample with its rows locked, offered to the Colourway Designer with starting colourways. */
export type ColourwayTemplate = {
  id: string;
  name: string;
  /** One plain-language sentence for the picker. */
  description: string;
  /** Bundled sample whose rows are used. */
  sampleId: string;
  /** Starting colourways; the first is the default. */
  presets: Colourway[];
};

function preset(name: string, source: string): Colourway {
  const { colourway } = readColourway(source);
  if (!colourway) throw new Error(`Preset "${name}" does not parse.`);
  return { ...colourway, name };
}

export const colourwayTemplates: ColourwayTemplate[] = [
  {
    id: 'chevron-8',
    name: 'Eight-cord chevron',
    description: 'Two mirrored courses on eight cords — the classic zig-zag. Closes after 16 rows.',
    sampleId: 'chevron-8',
    // The bundled colour-block sample is the mirror of these rows (its courses meet one lane over),
    // so it lives here as a second colourway on the chevron structure rather than as its own template.
    presets: [preset('Chevron', chevronPattern), preset('Colour block', colorBlock8Pattern)],
  },
];

export const defaultColourwayTemplate = colourwayTemplates[0];
