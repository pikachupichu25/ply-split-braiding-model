import { buildCordNetwork } from './cordNetwork';
import type { CordNetworkLayout, CordNetworkOptions } from './cordNetwork';
import { buildSpringNetwork } from './springNetwork.ts';
import type { SpringNetworkOptions } from './springNetwork.ts';
import type { Simulation } from './types';

export type CordNetworkModel = 'spring' | 'harmonic';
export type CordNetworkRequest = { simulation: Simulation; model: CordNetworkModel; options: CordNetworkOptions & SpringNetworkOptions };
export type CordNetworkResponse = { layout?: CordNetworkLayout; progress: number; done: boolean; error?: string };

const post = (message: CordNetworkResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<CordNetworkRequest>) => {
  const { simulation, model, options } = event.data;
  try {
    if (model === 'harmonic') {
      post({ layout: buildCordNetwork(simulation, options), progress: 1, done: true });
      return;
    }
    let lastPost = 0;
    const layout = buildSpringNetwork(simulation, options, (progress, build) => {
      const now = Date.now();
      if (now - lastPost < 300) return;                      // intermediate layouts, throttled
      lastPost = now;
      post({ layout: build(), progress, done: false });
    });
    post({ layout, progress: 1, done: true });
  } catch (error) {
    post({ progress: 1, done: true, error: error instanceof Error ? error.message : 'The cord network could not be generated.' });
  }
};
