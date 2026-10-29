import { describe, expect, it } from 'vitest';
import { reconstructLoad } from './existing';

const localHour = [12, 12, 20];
const localDay = ['2025-06-01', '2025-06-02', '2025-06-02'];

describe('consommation avec panneaux existants', () => {
	it('achat + production − injection quand l’injection est mesurée', () => {
		const r = reconstructLoad({
			localHour,
			localDay,
			import: [0, 0.2, 1],
			production: [2, 1, 0],
			export: [1.5, 0, 0]
		});
		expect(r).toEqual([0.5, 1.2, 1]);
	});

	it('sans injection : estimée par la consommation type des heures où l’on achète', () => {
		const r = reconstructLoad({
			localHour: [12, 12],
			localDay: ['2025-06-01', '2025-06-02'],
			import: [0.4, 0],
			production: [0.4, 3]
		});
		expect(r[0]).toBeCloseTo(0.8);
		expect(r[1]).toBeCloseTo(0.8); // pas plus que la consommation type de midi en juin
	});
});
