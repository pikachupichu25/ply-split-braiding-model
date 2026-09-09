import { buildCordNetwork } from './cordNetwork';
import type { CordNetworkOptions } from './cordNetwork';
import type { Simulation } from './types';

self.onmessage = (event: MessageEvent<{ simulation: Simulation; options: CordNetworkOptions }>) => {
  try {
    self.postMessage({ layout: buildCordNetwork(event.data.simulation, event.data.options) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The cord network could not be generated.' });
  }
};
