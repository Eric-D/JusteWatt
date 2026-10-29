import { describe, expect, it } from 'vitest';
import { applyEvolutions } from './evolutions';

const n = 8760;
const input = {
	localHour: Array.from({ length: n }, (_, i) => i % 24),
	localDay: Array.from({ length: n }, (_, i) => {
		const d = new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 24) * 86_400_000);
		return d.toISOString().slice(0, 10);
	}),
	temp: Array.from({ length: n }, (_, i) => 12 - 10 * Math.cos((2 * Math.PI * i) / n))
};

describe('évolutions', () => {
	it('voiture 10 000 km/an à 17 kWh/100 km = 1 700 kWh, le soir', () => {
		const r = applyEvolutions(input, [
			{ id: 'v', kind: 've', kmPerYear: 10000, kwhPer100km: 17, mode: 'soir', power: 7 }
		]);
		expect(r.totals.v).toBeCloseTo(1700, 6);
		expect(r.extra.reduce((s, v) => s + v, 0)).toBeCloseTo(1700, 6);
		expect(r.extra[12]).toBe(0);
		expect(r.devices).toHaveLength(0);
	});

	it('voiture chargée à midi = appareil pilotable', () => {
		const r = applyEvolutions(input, [
			{ id: 'v', kind: 've', kmPerYear: 10000, kwhPer100km: 17, mode: 'midi', power: 3.7 }
		]);
		expect(r.devices).toHaveLength(1);
		expect(Array.from(r.devices[0].profile).reduce((s, v) => s + v, 0)).toBeCloseTo(1700, 6);
	});

	it('la pompe à chaleur consomme surtout en hiver', () => {
		const r = applyEvolutions(input, [{ id: 'p', kind: 'pac', kwhPerYear: 3000 }]);
		const jan = r.extra.slice(0, 744).reduce((s, v) => s + v, 0);
		const jul = r.extra.slice(4344, 5088).reduce((s, v) => s + v, 0);
		expect(jan).toBeGreaterThan(jul * 5);
	});
});
