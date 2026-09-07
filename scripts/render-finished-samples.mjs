// Renders v1 and v2 finished layouts side by side as standalone SVG files.
// Run: node --experimental-strip-types scripts/render-finished-samples.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { parsePattern } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';
import { buildFinishedLayout } from '../src/domain/finishedLayout.ts';
import { buildFinishedLayoutV2 } from '../src/domain/finishedLayoutV2.ts';
import { braid16Pattern } from '../src/examples/braid16.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { colorBlock8Pattern } from '../src/examples/colorBlock8.ts';
import { doubleChevron24Pattern } from '../src/examples/doubleChevron24.ts';
import { wayuuFajon20Pattern } from '../src/examples/wayuuFajon20.ts';

const outDir = process.argv[2] ?? '.';
const target = Number(process.argv[3] ?? 0);
const palette = ['#d76b52', '#77b6c9', '#d3a448', '#6f8f65', '#a47aa3', '#dd8f45'];
const samples = {
  'chevron-8': chevronPattern,
  'color-block-8': colorBlock8Pattern,
  'double-chevron-24': doubleChevron24Pattern,
  'braid-16': braid16Pattern,
  'wayuu-fajon-20': wayuuFajon20Pattern,
};

for (const [id, source] of Object.entries(samples)) {
  const parsed = parsePattern(source);
  const simulation = simulatePattern(parsed.pattern, 4);
  const colors = new Map();
  for (const symbol of parsed.pattern.colors) {
    if (!colors.has(symbol)) colors.set(symbol, parsed.pattern.colorAssignments[symbol] ?? palette[colors.size % palette.length]);
  }
  const start = new Map(simulation.snapshots[0].lanes.map(cord => [cord.id, cord.colorSymbol]));
  const fill = cordId => colors.get(start.get(cordId)) ?? '#d3a448';
  const options = { theta: 30, tipAngle: 30 };
  const layouts = {
    v1: buildFinishedLayout(simulation, options),
    v2: buildFinishedLayoutV2(simulation, options),
  };
  const gap = 60;
  const width = layouts.v1.width + gap + layouts.v2.width;
  const height = Math.max(layouts.v1.height, layouts.v2.height) + 40;
  const draw = (layout, dx) => layout.cells.map(cell =>
    `<polygon points="${cell.points.map(p => `${(p.x + dx).toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="${fill(cell.event.splitteeId)}" stroke="rgba(23,41,61,.6)" stroke-width=".8"/>`).join('\n');
  const fit = target ? target / width : 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="${(width * fit).toFixed(0)}" height="${(height * fit).toFixed(0)}">
<rect width="100%" height="100%" fill="#f3e7cd"/>
<text x="12" y="24" font-family="monospace" font-size="16" fill="#5c4d3e">${id} · v1 (R1+R2+R3+R4)</text>
<text x="${(layouts.v1.width + gap + 12).toFixed(0)}" y="24" font-family="monospace" font-size="16" fill="#5c4d3e">${id} · v2 (R1+R2+R4)</text>
<g transform="translate(0 40)">
${draw(layouts.v1, 0)}
${draw(layouts.v2, layouts.v1.width + gap)}
</g>
</svg>`;
  writeFileSync(`${outDir}/finished-${id}.svg`, svg);
  console.log(id, 'v1', Math.round(layouts.v1.height), 'v2', Math.round(layouts.v2.height));
}
