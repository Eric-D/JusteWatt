import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildConsumption, yearBefore } from '#lib/sources/consumption.js';
import { demoHours } from '#lib/sources/demo.js';
import {
	buildContext,
	explore,
	MAP_BATTERY,
	MAP_KWC,
	outcome,
	spread,
	type Prepared
} from './compute';
import { defaultBattery, defaultSettings, defaultTariff } from './model';

const fx = JSON.parse(
	readFileSync(
		new URL('../../../tests/fixtures/reference-synthetique.json', import.meta.url),
		'utf8'
	)
);
const TZ = 'Europe/Paris';
const { startMs, endMs } = yearBefore('2026-01', TZ);
const cons = buildConsumption({ tz: TZ, startMs, endMs, ha: demoHours(startMs, endMs, TZ) });
const prepared: Prepared = {
	cons,
	temp: cons.load.map((_, i) => 12 - 10 * Math.cos((2 * Math.PI * i) / 8760)),
	pv: fx.pvPerKwc,
	pvYears: [
		{ year: 2024, pv: fx.pvPerKwc.map((v: number) => v * 0.95) },
		{ year: 2025, pv: fx.pvPerKwc }
	]
};
const s = defaultSettings();
const ctx = buildContext(prepared, s);
const sc = { ...s.current, kwc: 6, battery: defaultBattery(5) };

describe('calcul d’un scénario', () => {
	it('économie cohérente et retour fini', () => {
		const o = outcome(ctx, s.economics, sc);
		expect(o.savings).toBeGreaterThan(0);
		expect(o.billAfter).toBeLessThan(o.billBefore);
		expect(o.finance.payback).not.toBeNull();
		expect(o.premium).toBe(480);
	});

	it('Tempo avec recharge les veilles de jour rouge', () => {
		const e = { ...s.economics, tariff: defaultTariff('tempo') };
		const c = buildContext(prepared, {
			...s,
			economics: e,
			gridCharge: { enabled: true, mode: 'rouge', targetSoc: 1 }
		});
		const o = outcome(c, e, sc);
		expect(o.sim.gridCharged).toBeGreaterThan(0);
		expect(c.tempo).not.toBeNull();
	});

	it('incertitude : P10 ≤ P50 ≤ P90', () => {
		const r = spread(ctx, s.economics, sc);
		expect(r.samples).toHaveLength(6);
		expect(r.p10).toBeLessThanOrEqual(r.p50);
		expect(r.p50).toBeLessThanOrEqual(r.p90);
	});

	it('performance : toute la carte en moins de 3 s', () => {
		const t0 = performance.now();
		const cells = explore(ctx, s.economics, sc);
		expect(cells).toHaveLength(MAP_KWC.length * MAP_BATTERY.length);
		expect(performance.now() - t0).toBeLessThan(3000);
	});
});
