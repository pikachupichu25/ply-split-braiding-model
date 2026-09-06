import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePattern } from '../src/domain/parser.ts';

const row = '1 1>2,3';

test('reads optional source palette assignments', () => {
  const result = parsePattern(`color: ABC\npalette: A = #ff0000, B=#00ff00, C=#0000ff # colour key\n${row}`);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.pattern?.colorAssignments, {
    A: '#ff0000',
    B: '#00ff00',
    C: '#0000ff',
  });
});

test('keeps palettes optional and rejects malformed assignments', () => {
  const withoutPalette = parsePattern(`color: ABC\n${row}`);
  assert.deepEqual(withoutPalette.pattern?.colorAssignments, {});

  const named = parsePattern(`color: ABC\npalette: A=brown, B=white, C=lightblue\n${row}`);
  assert.deepEqual(named.pattern?.colorAssignments, { A: 'brown', B: 'white', C: 'lightblue' });

  const malformed = parsePattern(`color: ABC\npalette: A=not-a-colour\n${row}`);
  assert.equal(malformed.pattern, undefined);
  assert.match(malformed.diagnostics[0].message, /Invalid palette assignment/);
});
