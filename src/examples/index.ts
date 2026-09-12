import { braid16Pattern } from './braid16';
import { chevronPattern } from './chevron';
import { colorBlock8Pattern } from './colorBlock8';
import { doubleChevron24Pattern } from './doubleChevron24';
import { wayuuFajon20Pattern } from './wayuuFajon20';
import { arrowPattern } from './arrow';
import { eyes36Pattern } from './eyes36';
import { eyeletsPattern } from './eyelets';
import { eyes36AltPattern } from './eyes36Alt';

export type SamplePatternImage = {
  /** Path under `public/`, e.g. `/expected-layouts/eyes.webp`. */
  src: string;
  alt: string;
};

export type SamplePattern = {
  id: string;
  name: string;
  summary: string;
  source: string;
  /** Photo of the real braid, when one exists. Enables the photo comparison. */
  image?: SamplePatternImage;
};

export const samplePatterns: SamplePattern[] = [
  {
    id: 'chevron-8',
    name: 'Eight-cord chevron',
    summary: 'Two mirrored rows on eight cords. Closes after 8 repeats, 16 rows.',
    source: chevronPattern,
  },
  {
    id: 'color-block-8',
    name: 'Eight-cord color block',
    summary: 'The chevron rows worked over two four-cord colour blocks. Closes after 8 repeats, 16 rows.',
    source: colorBlock8Pattern,
  },
  {
    id: 'double-chevron-24',
    name: 'Twenty-four cord double chevron',
    summary: 'Four colour blocks of six cords. Two chevrons converge on lanes 19 and 6; closes after 24 repeats, 96 rows.',
    source: doubleChevron24Pattern,
  },
  {
    id: 'braid-16',
    name: 'Braid',
    summary: 'Sixteen cords in an A-C sequence. Twelve rows: a right-leaning stack from lane 12, then a left-leaning stack, closed by a four-row staircase from lanes 4-1.',
    source: braid16Pattern,
  },
  {
    id: 'wayuu-fajon-20',
    name: 'Eyes',
    summary: 'Twenty cords in a Wayuu-inspired A-C sequence, worked as a four-row repeat four times (16 rows total).',
    source: wayuuFajon20Pattern,
    image: {
      src: '/expected-layouts/eyes.webp',
      alt: 'Real Eyes braid: staggered blue and white eyes with dark centres and a dark surrounding field',
    },
  },
  {
    id: 'arrow',
    name: 'Arrow',
    summary: 'Thirty-two cords with two colors.',
    source: arrowPattern,
  },
  {
    id: 'eyes-36',
    name: 'Eyes (36-cord)',
    summary: 'Two eighteen-cord eyes side by side, each a concentric A-B-C-D-E diamond converging on its own centre. Closes after 9 repeats, 37 rows.',
    source: eyes36Pattern,
  },
  {
    id: 'eyelets',
    name: 'Eyelets',
    summary: 'Eyelets',
    source: eyeletsPattern,
  },
  {
    id: 'eyes-36-alt',
    name: 'Eyes (36-cord, alt method)',
    summary: 'The same 36-cord A-B-C-D-E colour layout as Eyes (36-cord), worked with a different row sequence: a 7-row phase repeated 9 times, then a mirrored 7-row phase repeated 8 times (119 rows total).',
    source: eyes36AltPattern,
  }
];

export const defaultSample = samplePatterns[0];
