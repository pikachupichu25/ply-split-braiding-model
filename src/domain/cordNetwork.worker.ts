import type { CordNetworkLayout } from './cordNetwork';
import { buildFramedNetwork } from './framedNetwork.ts';
import type { FramedNetworkOptions } from './framedNetwork.ts';
import { buildElasticNetwork } from './elasticNetwork.ts';
import type { ElasticNetworkOptions } from './elasticNetwork.ts';
import type { Simulation } from './types';

export type CordNetworkModel = 'elastic' | 'framed';
export type CordNetworkRequest = { simulation: Simulation; model: CordNetworkModel; options: FramedNetworkOptions & ElasticNetworkOptions };
export type CordNetworkResponse = { layout?: CordNetworkLayout; progress: number; done: boolean; error?: string };

const post = (message: CordNetworkResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<CordNetworkRequest>) => {
  const { simulation, model, options } = event.data;
  try {
    if (model === 'framed') {
      post({ layout: buildFramedNetwork(simulation, options), progress: 1, done: true });
      return;
    }
    let lastPost = 0;
    const layout = buildElasticNetwork(simulation, options, (progress, build) => {
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
