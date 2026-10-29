/// <reference lib="webworker" />
import {
	buildContext,
	explore,
	spread,
	type Context,
	type ContextSettings,
	type Prepared
} from './compute';
import type { Economics, Scenario } from './model';

/** Calculs lourds hors du fil principal : carte des combinaisons et incertitude. */
export type WorkerRequest =
	| { id: number; type: 'context'; prepared: Prepared; settings: ContextSettings }
	| { id: number; type: 'explore'; economics: Economics; scenario: Scenario }
	| { id: number; type: 'spread'; economics: Economics; scenario: Scenario };

let ctx: Context | null = null;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
	const m = ev.data;
	const t0 = performance.now();
	try {
		if (m.type === 'context') {
			ctx = buildContext(m.prepared, m.settings);
			self.postMessage({ id: m.id, result: true });
		} else if (!ctx) {
			self.postMessage({ id: m.id, error: 'Contexte absent' });
		} else if (m.type === 'explore') {
			const result = explore(ctx, m.economics, m.scenario);
			self.postMessage({ id: m.id, result, ms: performance.now() - t0 });
		} else {
			const result = spread(ctx, m.economics, m.scenario);
			self.postMessage({ id: m.id, result, ms: performance.now() - t0 });
		}
	} catch (e) {
		self.postMessage({ id: m.id, error: String(e) });
	}
};
