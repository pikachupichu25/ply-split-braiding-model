import type { Colourway } from './colourway.ts';

/** How many chevrons share the band, and how many cords they share. */
export type LinkedChevronsParams = { cords: number; ways: number };

export const linkedChevronsDefaults: LinkedChevronsParams = { cords: 32, ways: 2 };

/** The narrowest chevron that still has two lanes on each arm. */
export const minimumCordsPerChevron = 4;

/** Why the parameters cannot be built, or undefined when they can. */
export function checkLinkedChevrons({ cords, ways }: LinkedChevronsParams): string | undefined {
  if (!Number.isInteger(ways) || ways < 1) return 'Choose at least one chevron.';
  if (!Number.isInteger(cords) || cords < minimumCordsPerChevron * ways) {
    return `${ways === 1 ? 'A chevron needs' : `${ways} chevrons need`} at least ${minimumCordsPerChevron * ways} cords.`;
  }
  // Every chevron needs an even width so its two arms hold the same number of lanes.
  if (cords % (2 * ways) !== 0) return `${cords} cords do not divide evenly into ${ways} ${ways === 1 ? 'chevron' : 'chevrons'} with equal arms — use a multiple of ${2 * ways}.`;
  return undefined;
}

/**
 * The double-chevron structure on any width: `ways` chevrons side by side, each worked as
 * one leftward and one rightward split into its centre. Each chevron's inward splits start
 * from the neighbouring chevron's edge cord, so a cord walks the whole band before the
 * pattern closes — one repeat per cord, like the bundled twenty-four cord double chevron.
 */
export function linkedChevronsPattern(params: LinkedChevronsParams): string {
  const problem = checkLinkedChevrons(params);
  if (problem) throw new Error(problem);
  const { cords, ways } = params;
  const width = cords / ways;
  const centre = width / 2 + 1;
  const rows: string[] = [];
  for (let chevron = ways; chevron >= 1; chevron -= 1) {
    const base = (chevron - 1) * width;
    const target = base + centre;
    rows.push(splitRow(rows.length + 1, base + width, target));
    rows.push(splitRow(rows.length + 1, chevron === 1 ? 1 : base, target));
  }
  const preset = linkedChevronsPreset(params);
  return [
    `# ${cords}-cord ${ways}-way chevron`,
    `color: ${preset.cords.join('')}`,
    `palette: ${Object.entries(preset.palette).map(([symbol, swatch]) => `${symbol}=${swatch}`).join(', ')}`,
    '',
    ...rows,
    '',
    `[repeat 1-${rows.length}]`,
  ].join('\n');
}

/** The eight-cord chevron's bordered stripe on every chevron: outermost cord C, the next B, the rest A. */
export function linkedChevronsPreset({ cords, ways }: LinkedChevronsParams): Colourway {
  const width = cords / ways;
  const arm = Array.from({ length: width / 2 }, (_, index) => (index === 0 ? 'C' : index === 1 ? 'B' : 'A'));
  const chevron = [...arm, ...[...arm].reverse()];
  return {
    name: 'Chevron',
    cords: Array.from({ length: ways }, () => chevron).flat(),
    palette: { A: '#d3a448', B: '#77b6c9', C: '#d76b52' },
  };
}

function splitRow(number: number, from: number, to: number): string {
  const step = to > from ? 1 : -1;
  const lanes: number[] = [];
  for (let lane = from + step; lane !== to + step; lane += step) lanes.push(lane);
  return `${number} ${from}>${lanes.join(',')}`;
}
