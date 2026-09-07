import { braid16Pattern } from './braid16';
import { chevronPattern } from './chevron';
import { colorBlock8Pattern } from './colorBlock8';
import { doubleChevron24Pattern } from './doubleChevron24';
import { mirroredDiamonds24Pattern } from './mirroredDiamonds24';
import { wayuuFajon20Pattern } from './wayuuFajon20';

export type SamplePattern = {
  id: string;
  name: string;
  summary: string;
  source: string;
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
    id: 'mirrored-diamonds-24',
    name: 'Twenty-four cord mirrored diamonds',
    summary: 'A mirrored A-F colour sequence worked in two four-row sections, each repeated six times (48 rows total).',
    source: mirroredDiamonds24Pattern,
  },
  {
    id: 'braid-16',
    name: 'Braid',
    summary: 'Sixteen cords in an A-C sequence. Twelve rows: a right-leaning stack from lane 12, then a left-leaning stack, closed by a four-row staircase from lanes 4-1.',
    source: braid16Pattern,
  },
  {
    id: 'wayuu-fajon-20',
    name: 'Como hacer tira,gasa,fajon wayuu from Youtube',
    summary: 'Twenty cords in a Wayuu-inspired A-C sequence, worked as a four-row repeat four times (16 rows total).',
    source: wayuuFajon20Pattern,
  },
];

export const defaultSample = samplePatterns[0];
