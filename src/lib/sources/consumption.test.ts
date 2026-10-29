import { describe, expect, it } from 'vitest';
import { buildConsumption, monthStart, yearBefore } from './consumption';
import { demoHours } from './demo';

const TZ = 'Europe/Paris';

describe('consommation', () => {
	it('minuit local du 1er du mois', () => {
		expect(new Date(monthStart(2025, 1, TZ)).toISOString()).toBe('2024-12-31T23:00:00.000Z');
		expect(new Date(monthStart(2025, 7, TZ)).toISOString()).toBe('2025-06-30T22:00:00.000Z');
	});

	it('profil type quand il n’y a que des volumes mensuels', () => {
		const { startMs, endMs } = yearBefore('2026-01', TZ);
		const monthly = Object.fromEntries(
			Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}`, 500])
		);
		const c = buildConsumption({ tz: TZ, startMs, endMs, monthly });
		expect(c.load.reduce((s, v) => s + v, 0)).toBeCloseTo(6000, 4);
		expect(c.months.every((m) => m.method === 'profile')).toBe(true);
		expect(c.steps).toHaveLength(8760);
	});

	it('démo : année complète avec part pilotable', () => {
		const { startMs, endMs } = yearBefore('2026-01', TZ);
		const c = buildConsumption({ tz: TZ, startMs, endMs, ha: demoHours(startMs, endMs, TZ) });
		const total = c.load.reduce((s, v) => s + v, 0);
		expect(total).toBeGreaterThan(7000);
		expect(total).toBeLessThan(11000);
		expect(c.pilotable.reduce((s, v) => s + v, 0)).toBeCloseTo(365 * 2, 0);
	});
});
