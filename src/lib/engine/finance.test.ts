import { describe, expect, it } from 'vitest';
import { finance, type FinanceInput } from './finance';

const kit: FinanceInput = {
	investment: 5608,
	avoidedKwh: 6600,
	exportedKwh: 0,
	buyPrice: 0.21,
	sellPrice: 0,
	inflation: 0.03,
	degradation: 0.005,
	years: 15,
	discountRate: 0.024,
	yearlyCosts: 0,
	replacements: []
};

describe('finance', () => {
	it('retour en années décimales', () => {
		const r = finance(kit);
		// 1re année ≈ 1 390 € d'économie → environ 4 ans
		expect(r.payback).toBeGreaterThan(3.8);
		expect(r.payback).toBeLessThan(4.1);
	});

	it('VAN < gain net quand le taux d’actualisation est positif', () => {
		const r = finance(kit);
		expect(r.npv).toBeLessThan(r.netGain);
		expect(r.npv).toBeGreaterThan(0);
	});

	it('le TRI annule la VAN', () => {
		const r = finance(kit);
		expect(r.irr).not.toBeNull();
		const atIrr = finance({ ...kit, discountRate: r.irr! });
		expect(Math.abs(atIrr.npv)).toBeLessThan(0.01);
	});

	it('un remplacement retarde le retour', () => {
		const late = finance({ ...kit, replacements: [{ year: 2, cost: 3000 }] });
		expect(late.payback!).toBeGreaterThan(finance(kit).payback!);
	});

	it('jamais rentable → payback null', () => {
		expect(finance({ ...kit, avoidedKwh: 10 }).payback).toBeNull();
	});
});
