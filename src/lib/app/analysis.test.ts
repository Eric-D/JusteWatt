import { describe, expect, it } from 'vitest';
import type { Consumption } from '#lib/sources/consumption.js';
import { analyse } from './analysis';
import { defaultTariff } from './model';
import { DEFAULT_HC_HOURS } from '#lib/engine/tariffs.js';

// année synthétique : talon 0,3 kW, soirée +1 kW, chauffage 2 kWh/jour par degré sous 15 °C
const days = 364;
const cons: Consumption = {
	tz: 'Europe/Paris',
	steps: [],
	localHour: [],
	localDay: [],
	load: [],
	pilotable: [],
	months: [],
	sources: []
};
const temp: number[] = [];
const start = Date.UTC(2025, 0, 1);
for (let d = 0; d < days; d++) {
	const day = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
	const t = 12 - 10 * Math.cos((2 * Math.PI * d) / 365) + 2 * Math.sin(d * 1.7);
	const heat = 2 * Math.max(0, 15 - t);
	for (let h = 0; h < 24; h++) {
		cons.steps.push(start + (d * 24 + h) * 3_600_000);
		cons.localHour.push(h);
		cons.localDay.push(day);
		cons.load.push(0.3 + (h >= 18 && h < 22 ? 1 : 0) + heat / 24 + (h === 13 ? 2 : 0));
		cons.pilotable.push(h === 13 ? 2 : 0);
		temp.push(t);
	}
}

const a = analyse({
	cons,
	temp,
	pvPerKwc: cons.localHour.map((h) => (h >= 9 && h < 17 ? 0.4 : 0)),
	tariffs: [defaultTariff('base'), defaultTariff('hphc'), defaultTariff('tempo')],
	hcHours: DEFAULT_HC_HOURS
});

describe('analyse de la consommation', () => {
	it('totaux, talon et pic', () => {
		expect(a.days).toBe(days);
		expect(a.total).toBeCloseTo(
			cons.load.reduce((s, v) => s + v, 0),
			6
		);
		// talon pris sur les jours sans chauffage : la veille réelle
		expect(a.standby).toBeCloseTo(0.3, 2);
		expect(a.pilotable).toBeCloseTo(2 * days, 6);
		expect(a.monthly.reduce((s, m) => s + m.kwh, 0)).toBeCloseTo(a.total, 6);
	});

	it('retrouve la sensibilité au froid', () => {
		expect(a.heating).not.toBeNull();
		expect(a.heating!.slope).toBeGreaterThan(1.6);
		expect(a.heating!.slope).toBeLessThan(2.4);
		expect(a.heating!.threshold).toBeGreaterThanOrEqual(14);
		expect(a.heating!.threshold).toBeLessThanOrEqual(16);
		expect(a.cooling).toBeNull();
		const truth = [...new Set(cons.localDay)].reduce((s, _, d) => {
			const t = temp[d * 24];
			return s + 2 * Math.max(0, 15 - t);
		}, 0);
		expect(a.heating!.total / truth).toBeGreaterThan(0.85);
		expect(a.heating!.total / truth).toBeLessThan(1.15);
	});

	it('profils, parts horaires et tarifs', () => {
		expect(a.profiles.été.weekday[19]).toBeCloseTo(1.3, 1);
		expect(a.profiles.été.weekday[3]).toBeCloseTo(0.3, 1);
		expect(a.sunShare).toBeGreaterThan(0.3);
		expect(a.tariffs.map((t) => t.kind)).toEqual(['base', 'hphc', 'tempo']);
		expect(a.redDays.days).toBe(22);
		expect(a.topDays[0].temp).toBeLessThan(5);
	});
});

describe('appareils mesurés', () => {
	it('range les appareils et les retire de l’estimation', async () => {
		const { deviceCategory } = await import('./analysis');
		expect(deviceCategory('esp32-clim-chambre Energy Usage')).toBe('clim');
		expect(deviceCategory('Pompe à chaleur')).toBe('chauffage');
		expect(deviceCategory('Chauffe-eau')).toBe('eau');
		expect(deviceCategory('Switch PoE (caméras, Wi-Fi)')).toBe('autre');
	});

	it('une clim de nuit mesurée en été est comptée telle quelle', () => {
		// 0,6 kWh par heure la nuit de juin à août, ajoutés à la consommation
		const clim = cons.load.map((_, i): number => {
			const m = Number(cons.localDay[i].slice(5, 7));
			return m >= 6 && m <= 8 && cons.localHour[i] < 8 ? 0.6 : 0;
		});
		const withClim: Consumption = {
			...cons,
			load: cons.load.map((v, i) => v + clim[i]),
			devices: [
				{ name: 'Clim chambre', kwh: clim.map((v, i) => (i < 24 * 30 ? NaN : v)) },
				{ name: 'Box internet', kwh: clim.map(() => 0.01) }
			]
		};
		const b = analyse({
			cons: withClim,
			temp,
			pvPerKwc: cons.localHour.map(() => 0),
			tariffs: [defaultTariff('base')],
			hcHours: DEFAULT_HC_HOURS
		});
		const truth = clim.reduce((s, v) => s + v, 0);
		expect(b.devices[0].name).toBe('Clim chambre');
		expect(b.devices[0].category).toBe('clim');
		expect(b.devices[0].kwh).toBeCloseTo(truth, 3);
		expect(b.devices[0].coverage).toBeLessThan(0.95);
		expect(b.monthly.reduce((s, m) => s + m.devices.clim, 0)).toBeCloseTo(truth, 3);
		// le chauffage estimé ne bouge pas : la clim est retirée avant l'ajustement
		expect(b.heating!.slope).toBeCloseTo(a.heating!.slope, 1);
		const sum = (m: (typeof b.monthly)[number]) =>
			m.pilotable +
			m.heating +
			m.cooling +
			m.other +
			Object.values(m.devices).reduce((x, v) => x + v, 0);
		for (const m of b.monthly) expect(sum(m)).toBeCloseTo(m.kwh, 6);
	});
});
