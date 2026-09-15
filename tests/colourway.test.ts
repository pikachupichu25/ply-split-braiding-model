import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addSlot,
  applyColourway,
  colourwayStorageKey,
  defaultSwatches,
  fillAll,
  mirror,
  nextUnusedSymbol,
  paintCords,
  readColourway,
  removeSlot,
  replaceSlot,
  setSwatch,
  slotCounts,
  swapSlots,
  validateColourway,
} from '../src/domain/colourway.ts';
import type { Colourway } from '../src/domain/colourway.ts';
import { checkValues, colourwayTemplates, defaultValues, validateValues } from '../src/examples/colourwayTemplates.ts';
import { checkLinkedChevrons, linkedChevronsPattern, linkedChevronsPreset } from '../src/domain/linkedChevrons.ts';
import { doubleChevron24Pattern } from '../src/examples/doubleChevron24.ts';
import { samplePatterns } from '../src/examples/index.ts';
import { arrowPattern } from '../src/examples/arrow.ts';
import { chevronPattern } from '../src/examples/chevron.ts';
import { colorBlock8Pattern } from '../src/examples/colorBlock8.ts';
import { eyeletsPattern } from '../src/examples/eyelets.ts';
import { colorExpression, isCommentLine, paletteExpression, parsePattern, stripLineComment } from '../src/domain/parser.ts';
import { simulatePattern } from '../src/domain/simulate.ts';

const chevron: Colourway = {
  cords: 'CBAAAABC'.split(''),
  palette: { A: '#d3a448', B: '#77b6c9', C: '#d76b52' },
};

function read(source: string): Colourway {
  const { colourway, diagnostics } = readColourway(source);
  assert.equal(diagnostics.length, 0);
  assert.ok(colourway);
  return colourway;
}

test('reads the colourway of the chevron and colour block samples', () => {
  assert.deepEqual(read(chevronPattern), chevron);
  assert.deepEqual(read(colorBlock8Pattern), {
    cords: 'AAAABBBB'.split(''),
    palette: { A: '#d76b52', B: '#77b6c9' },
  });
});

test('keeps CSS colour names and fills missing palette entries with defaults', () => {
  assert.deepEqual(read(eyeletsPattern).palette, { A: 'brown', B: 'orange', C: 'white', D: 'pink' });
  const arrow = read(arrowPattern);
  assert.deepEqual(arrow.palette, { A: defaultSwatches[0], B: defaultSwatches[1] });
});

test('keeps palette slots that no cord uses', () => {
  const colourway = read('color: AAB\npalette: A=#111111, B=#222222, C=#333333\n\n1 1>2');
  assert.deepEqual(colourway.palette, { A: '#111111', B: '#222222', C: '#333333' });
});

test('applyColourway rewrites only the color: and palette: lines', () => {
  const painted = { ...chevron, cords: 'AABBBBAA'.split(''), palette: { A: '#112233', B: '#445566' } };
  const output = applyColourway(chevronPattern, painted);
  assert.equal(output, `# Eight-cord SCOT chevron
color: AABBBBAA
palette: A=#112233, B=#445566

1 1>2,3,4
2 8>7,6,5,4

[repeat 1-2]`);
});

test('applyColourway inserts a palette: line after color: when the source has none', () => {
  const output = applyColourway(arrowPattern, read(arrowPattern));
  const lines = output.split('\n');
  const colorIndex = lines.findIndex((line) => colorExpression.test(line));
  assert.ok(colorIndex > 0);
  assert.equal(lines[colorIndex + 1], `palette: A=${defaultSwatches[0]}, B=${defaultSwatches[1]}`);
  assert.equal(lines.length, arrowPattern.split('\n').length + 1);
});

test('applyColourway keeps Windows line endings on the lines it writes', () => {
  const source = 'color: ABC\r\n\r\n1 1>2\r\n';
  const output = applyColourway(source, { cords: ['A', 'A', 'B'], palette: { A: '#000000', B: '#ffffff' } });
  assert.equal(output, 'color: AAB\r\npalette: A=#000000, B=#ffffff\r\n\r\n1 1>2\r\n');
});

test('applyColourway refuses a source without a color: line', () => {
  assert.throws(() => applyColourway('# nothing here\n1 1>2', chevron), /no color: line/);
});

for (const sample of samplePatterns) {
  test(`round-trips the ${sample.name} sample without touching its rows`, () => {
    const original = read(sample.source);
    // Paint a different but valid colourway so the rewrite actually changes something.
    const symbols = Object.keys(original.palette).sort();
    const repainted: Colourway = {
      cords: original.cords.map((_, index) => symbols[index % symbols.length]),
      palette: Object.fromEntries(symbols.map((symbol, index) => [symbol, `#${String(index + 1).padStart(6, '0')}`])),
    };
    const output = applyColourway(sample.source, repainted);
    assert.deepEqual(read(output), repainted);
    assert.equal(applyColourway(output, repainted), output);

    const structural = (source: string) => source.split('\n')
      .filter((line) => isCommentLine(line) || !(colorExpression.test(stripLineComment(line)) || paletteExpression.test(stripLineComment(line))));
    assert.deepEqual(structural(output), structural(sample.source));

    const before = parsePattern(sample.source);
    const after = parsePattern(output);
    assert.ok(before.pattern && after.pattern);
    assert.equal(after.diagnostics.length, 0);
    const strip = (source: typeof before) => simulatePattern(source.pattern!, 2).events
      .map(({ lanesBefore, lanesAfter, ...event }) => event);
    assert.deepEqual(strip(after), strip(before));
  });
}

test('paintCords, fillAll and setSwatch return new colourways', () => {
  const painted = paintCords(chevron, [0, 7], 'A');
  assert.equal(painted.cords.join(''), 'ABAAAABA');
  assert.equal(chevron.cords.join(''), 'CBAAAABC');
  assert.equal(fillAll(chevron, 'B').cords.join(''), 'BBBBBBBB');
  assert.equal(setSwatch(chevron, 'B', '#123456').palette.B, '#123456');
  assert.throws(() => paintCords(chevron, [0], 'Z'), /Unknown colour slot Z/);
});

test('mirror copies one half onto the other and leaves an odd middle alone', () => {
  const half = { ...chevron, cords: 'CBAAxxxx'.split('').map((symbol) => (symbol === 'x' ? 'A' : symbol)) };
  assert.equal(mirror(half, 'left').cords.join(''), 'CBAAAABC');
  assert.equal(mirror(chevron, 'right').cords.join(''), 'CBAAAABC');
  const odd: Colourway = { cords: 'ABCDE'.split(''), palette: { A: '#1', B: '#2', C: '#3', D: '#4', E: '#5' } };
  assert.equal(mirror(odd, 'left').cords.join(''), 'ABCBA');
  assert.equal(mirror(odd, 'right').cords.join(''), 'EDCDE');
});

test('swapSlots exchanges two slots everywhere and keeps swatches with their letters', () => {
  const swapped = swapSlots(chevron, 'A', 'B');
  assert.equal(swapped.cords.join(''), 'CABBBBAC');
  assert.deepEqual(swapped.palette, chevron.palette);
});

test('addSlot allocates the next unused letter and a fresh default swatch', () => {
  const added = addSlot(chevron);
  assert.ok(added);
  assert.equal(added.symbol, 'D');
  assert.equal(added.colourway.palette.D, '#6f8f65');
  const gap: Colourway = { cords: ['A', 'C', 'C'], palette: { A: '#000000', C: '#ffffff' } };
  assert.equal(nextUnusedSymbol(gap), 'B');
  const full: Colourway = {
    cords: ['A', 'A', 'A'],
    palette: Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((symbol) => [symbol, '#000000'])),
  };
  assert.equal(addSlot(full), undefined);
});

test('removeSlot refuses a used slot and the last slot; replaceSlot repaints then drops', () => {
  assert.equal(removeSlot(chevron, 'A'), undefined);
  const spare = addSlot(chevron)!.colourway;
  assert.deepEqual(removeSlot(spare, 'D'), chevron);
  assert.equal(removeSlot({ cords: ['A', 'A', 'A'], palette: { A: '#000000' } }, 'A'), undefined);
  const replaced = replaceSlot(chevron, 'C', 'B');
  assert.equal(replaced.cords.join(''), 'BBAAAABB');
  assert.deepEqual(Object.keys(replaced.palette).sort(), ['A', 'B']);
});

test('slotCounts lists every slot in letter order and sums to the cord count', () => {
  const counts = slotCounts(addSlot(chevron)!.colourway);
  assert.deepEqual([...counts.entries()], [['A', 4], ['B', 2], ['C', 2], ['D', 0]]);
  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), chevron.cords.length);
});

test('validateColourway accepts a stored design that fits and rejects one that does not', () => {
  assert.deepEqual(validateColourway({ ...chevron, name: 'Mine' }, 8), { ...chevron, name: 'Mine' });
  assert.equal(validateColourway(chevron, 9), undefined);
  assert.equal(validateColourway({ cords: chevron.cords, palette: { A: '#d3a448', B: '#77b6c9' } }, 8), undefined);
  assert.equal(validateColourway({ cords: chevron.cords, palette: { ...chevron.palette, C: 'not a colour' } }, 8), undefined);
  assert.equal(validateColourway({ cords: chevron.cords, palette: { ...chevron.palette, a: '#000000' } }, 8), undefined);
  assert.equal(validateColourway('CBAAAABC', 8), undefined);
  assert.equal(validateColourway(null, 8), undefined);
});

/** Repeats until the cords are back in starting order, or undefined within the limit. */
function closesAfter(source: string, limit = 64): number | undefined {
  const parsed = parsePattern(source);
  assert.ok(parsed.pattern);
  assert.equal(parsed.diagnostics.length, 0);
  for (let repeats = 1; repeats <= limit; repeats += 1) {
    const simulation = simulatePattern(parsed.pattern, repeats);
    assert.equal(simulation.diagnostics.length, 0);
    const start = simulation.snapshots[0].lanes;
    const end = simulation.snapshots.at(-1)!.lanes;
    if (simulation.totalRows % 2 === 0 && start.every((cord, index) => cord.id === end[index].id)) return repeats;
  }
  return undefined;
}

test('one linked chevron on eight cords is the classic eight-cord chevron', () => {
  const source = linkedChevronsPattern({ cords: 8, ways: 1 });
  assert.equal(source, `# 8-cord 1-way chevron
color: CBAAAABC
palette: A=#d3a448, B=#77b6c9, C=#d76b52

1 8>7,6,5
2 1>2,3,4,5

[repeat 1-2]`);
  assert.deepEqual(read(source), chevron);
  assert.equal(closesAfter(source), 8);
  assert.equal(closesAfter(chevronPattern), 8);
});

test('linked chevrons on 24 cords in two ways are worked like the bundled double chevron', () => {
  const source = linkedChevronsPattern({ cords: 24, ways: 2 });
  const rows = (pattern: string) => pattern.split('\n').filter((line) => /^\d+ /.test(line));
  const sampleRows = rows(doubleChevron24Pattern);
  const generated = rows(source);
  // The right chevron matches the sample; the left one meets one lane further in so both arms are equal.
  assert.deepEqual(generated.slice(0, 2), sampleRows.slice(0, 2));
  assert.deepEqual(generated.slice(2), ['3 12>11,10,9,8,7', '4 1>2,3,4,5,6,7']);
  assert.ok(source.endsWith('[repeat 1-4]'));
  assert.equal(closesAfter(source), 24);
  assert.equal(closesAfter(doubleChevron24Pattern), 24);
});

test('linked chevrons close after one repeat per cord and keep every chevron balanced', () => {
  for (const params of [{ cords: 32, ways: 2 }, { cords: 32, ways: 4 }, { cords: 12, ways: 3 }, { cords: 64, ways: 8 }]) {
    const source = linkedChevronsPattern(params);
    assert.equal(closesAfter(source), params.cords, `${params.cords}x${params.ways}`);
    const parsed = parsePattern(source);
    assert.equal(parsed.pattern!.rows.length, 2 * params.ways);
    // After one repeat each chevron has taken in two cords, one at the innermost lane of each arm.
    const width = params.cords / params.ways;
    const lanes = simulatePattern(parsed.pattern!, 1).snapshots.at(-1)!.lanes.map((cord) => Number(cord.id.slice(1)));
    for (let chevron = 0; chevron < params.ways; chevron += 1) {
      const block = lanes.slice(chevron * width, (chevron + 1) * width);
      const entered = block.filter((id, index) => Math.abs(id - (chevron * width + index + 1)) !== 1);
      assert.equal(entered.length, 2, `chevron ${chevron + 1} of ${params.cords}x${params.ways} takes in two cords`);
      assert.deepEqual(entered.map((id) => block.indexOf(id) + 1), [width / 2, width / 2 + 1], `arms of chevron ${chevron + 1} of ${params.cords}x${params.ways}`);
    }
  }
});

test('the linked chevrons template defaults to two chevrons on 32 cords with one chevron preset', () => {
  const source = linkedChevronsPattern({ cords: 32, ways: 2 });
  assert.equal(source, `# 32-cord 2-way chevron
color: CBAAAAAAAAAAAABCCBAAAAAAAAAAAABC
palette: A=#d3a448, B=#77b6c9, C=#d76b52

1 32>31,30,29,28,27,26,25
2 16>17,18,19,20,21,22,23,24,25
3 16>15,14,13,12,11,10,9
4 1>2,3,4,5,6,7,8,9

[repeat 1-4]`);
  const preset = linkedChevronsPreset({ cords: 32, ways: 2 });
  assert.equal(preset.name, 'Chevron');
  assert.deepEqual(read(source), { cords: preset.cords, palette: preset.palette });
  assert.equal(linkedChevronsPreset({ cords: 32, ways: 4 }).cords.join(''), 'CBAAAABC'.repeat(4));
  assert.equal(linkedChevronsPreset({ cords: 8, ways: 2 }).cords.join(''), 'CBBCCBBC');

  const template = colourwayTemplates.find((item) => item.id === 'linked-chevrons')!;
  assert.equal(colourwayTemplates.length, 1);
  assert.deepEqual(defaultValues(template), { cords: 32, ways: 2 });
  const built = template.build(defaultValues(template));
  assert.equal(built.source, source);
  assert.equal(built.presets.length, 1);
  assert.equal(built.presets[0].cords.length, 32);
  assert.equal(colourwayStorageKey(template.id), 'scot-colourway:linked-chevrons');
});

test('linked chevrons refuse widths that do not give every chevron two equal arms', () => {
  assert.equal(checkLinkedChevrons({ cords: 32, ways: 4 }), undefined);
  assert.equal(checkLinkedChevrons({ cords: 12, ways: 3 }), undefined);
  assert.match(checkLinkedChevrons({ cords: 30, ways: 4 })!, /multiple of 8/);
  assert.match(checkLinkedChevrons({ cords: 28, ways: 4 })!, /multiple of 8/);
  assert.equal(checkLinkedChevrons({ cords: 10, ways: 1 }), undefined);
  assert.match(checkLinkedChevrons({ cords: 9, ways: 1 })!, /multiple of 2/);
  assert.match(checkLinkedChevrons({ cords: 12, ways: 4 })!, /at least 16 cords/);
  assert.match(checkLinkedChevrons({ cords: 8, ways: 0 })!, /at least one chevron/);
  assert.throws(() => linkedChevronsPattern({ cords: 28, ways: 4 }), /multiple of 8/);

  const template = colourwayTemplates[0];
  assert.equal(checkValues(template, { cords: 32, ways: 4 }), undefined);
  assert.match(checkValues(template, { cords: 100, ways: 4 })!, /from 4 to 64/);
  assert.match(checkValues(template, { cords: 32.5, ways: 4 })!, /whole number/);
  assert.match(checkValues(template, { cords: 28, ways: 4 })!, /multiple of 8/);
  assert.deepEqual(validateValues(template, { cords: 24, ways: 2 }), { cords: 24, ways: 2 });
  assert.equal(validateValues(template, { cords: 28, ways: 4 }), undefined);
  assert.equal(validateValues(template, { cords: '32', ways: 4 }), undefined);
  assert.equal(validateValues(template, undefined), undefined);
  assert.equal(template.build({ cords: 24, ways: 2 }).presets[0].cords.length, 24);
});
