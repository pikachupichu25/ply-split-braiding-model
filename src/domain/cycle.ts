import { simulatePattern } from './simulate';
import type { PatternAst, Simulation } from './types';

export type FullCycle = { repeats: number; rows: number };

const searchLimit = 64;

export function findFullCycle(pattern: PatternAst): FullCycle | undefined {
  // Every pattern expands with the repeat count: an open section repeats that
  // many times, and a pattern without one is worked through that many times.
  for (let repeats = 1; repeats <= searchLimit; repeats += 1) {
    const simulation = simulatePattern(pattern, repeats);
    if (simulation.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return undefined;
    if (returnsToStart(simulation)) return { repeats, rows: simulation.totalRows };
  }

  return undefined;
}

function returnsToStart(simulation: Simulation): boolean {
  const start = simulation.snapshots[0]?.lanes;
  const end = simulation.snapshots.at(-1)?.lanes;
  if (!start || !end || start.length !== end.length) return false;
  if (simulation.totalRows % 2 !== 0) return false;
  return start.every((cord, index) => cord.id === end[index].id);
}
