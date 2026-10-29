import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { simulate } from './simulate';
import type { SystemConfig, TimeSeries } from './types';

// Année synthétique (aucune mesure réelle) et résultats du moteur Python de référence
const fx = JSON.parse(
	readFileSync(
		new URL('../../../tests/fixtures/reference-synthetique.json', import.meta.url),
		'utf8'
	)
);

const series: TimeSeries = {
	start: fx.start,
	stepMinutes: 60,
	localHour: fx.localHour,
	localDay: fx.localDay,
	load: fx.load,
	pilotable: fx.pilotable,
	pvPerKwc: fx.pvPerKwc
};

const idealBattery = (capacity: number, power: number) => ({
	capacity,
	power,
	efficiency: 0.95,
	depthOfDischarge: 1,
	reserve: 0,
	standbyW: 0
});

function config(c: { kwc: number; battery: number; pmax: number; router: boolean }): SystemConfig {
	return {
		kwc: c.kwc,
		inverterAcMax: Infinity,
		battery: c.battery > 0 ? idealBattery(c.battery, c.pmax) : null,
		devices: c.router
			? [{ name: 'cumulus', power: 2.4, fallbackHour: 21, profile: series.pilotable }]
			: []
	};
}

describe('simulate — parité avec la référence Python', () => {
	for (const c of fx.cases) {
		it(`${c.kwc} kWc, ${c.battery} kWh, routeur ${c.router ? 'oui' : 'non'}`, () => {
			const r = simulate(series, config(c));
			expect(r.production).toBeCloseTo(c.prod, 1);
			expect(r.import).toBeCloseTo(c.import, 1);
			expect(r.export).toBeCloseTo(c.export, 1);
		});
	}
});

describe('simulate — pertes réelles', () => {
	const base = { kwc: 6, battery: 7.5, pmax: 4, router: true };

	it('la veille de la batterie augmente les achats', () => {
		const ideal = simulate(series, config(base));
		const cfg = config(base);
		cfg.battery!.standbyW = 15;
		const real = simulate(series, cfg);
		expect(real.import).toBeGreaterThan(ideal.import);
		// au plus 15 W × 8 760 h
		expect(real.import - ideal.import).toBeLessThanOrEqual(131.4 + 1e-6);
	});

	it('la profondeur de décharge réduit le gain de la batterie', () => {
		const cfg = config(base);
		cfg.battery!.depthOfDischarge = 0.8;
		expect(simulate(series, cfg).import).toBeGreaterThan(simulate(series, config(base)).import);
	});

	it("l'écrêtage plafonne la production", () => {
		const cfg = config({ ...base, kwc: 9 });
		cfg.inverterAcMax = 4;
		const r = simulate(series, cfg);
		expect(r.clipped).toBeGreaterThan(0);
		expect(Math.max(...series.pvPerKwc) * 9).toBeGreaterThan(4);
	});

	it('les appareils pilotés sont servis par ordre de priorité', () => {
		const zero = series.load.map(() => 0);
		const pool = series.load.map((_, i) => (series.localHour[i] === 22 ? 0.5 : 0));
		const withPool = series.load.map((v, i) => v + pool[i]);
		const s = { ...series, load: withPool };
		const cfg = config({ kwc: 6, battery: 0, pmax: 0, router: true });
		const piscine = { name: 'piscine', power: 1, fallbackHour: 22, profile: pool };
		const first = simulate(s, { ...cfg, devices: [piscine, ...cfg.devices] });
		const last = simulate(s, { ...cfg, devices: [...cfg.devices, piscine] });
		// même énergie totale, l'ordre change seulement qui profite du surplus
		expect(first.load).toBeCloseTo(last.load, 6);
		expect(first.import).toBeCloseTo(last.import, 0);
		expect(zero.length).toBe(series.load.length);
	});

	it('la recharge réseau remplit la batterie aux heures choisies', () => {
		const cfg = config(base);
		const hc = Array.from({ length: 24 }, (_, h) => h < 6);
		const r = simulate(series, { ...cfg, gridCharge: { hours: hc, targetSoc: 1 } });
		expect(r.gridCharged).toBeGreaterThan(0);
		// l'achat ne sert plus seulement à consommer
		expect(r.import).toBeGreaterThan(simulate(series, cfg).import);
		expect(r.autonomy).toBeLessThanOrEqual(1);
	});

	it('flux horaires cohérents', () => {
		const r = simulate(series, config(base));
		let sum = 0;
		for (let i = 0; i < r.flows.load.length; i++)
			sum += r.flows.direct[i] + r.flows.discharge[i] + r.flows.import[i] - r.flows.load[i];
		expect(Math.abs(sum)).toBeLessThan(1);
	});

	it('bilan énergétique fermé', () => {
		const r = simulate(series, config({ kwc: 6, battery: 0, pmax: 0, router: false }));
		// sans batterie : conso = production − export + import
		expect(r.load).toBeCloseTo(r.production - r.export + r.import, 6);
	});
});

describe('simulate — panneaux déjà installés', () => {
	it('la production existante compte comme du solaire, sans coût', () => {
		const base = series.pvPerKwc;
		const withBase = { ...series, basePv: Array.from(base, (v) => v * 3) };
		const a = simulate(withBase, config({ kwc: 0, battery: 0, pmax: 0, router: false }));
		const b = simulate(series, config({ kwc: 3, battery: 0, pmax: 0, router: false }));
		expect(a.production).toBeCloseTo(b.production, 6);
		expect(a.import).toBeCloseTo(b.import, 6);
	});
});
