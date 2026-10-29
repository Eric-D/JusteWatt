import { describe, expect, it } from 'vitest';
import { sunPosition } from './sun';
import { horizonAt, horizonFromElevations, horizonSamplePoints, HORIZON_SECTORS } from './horizon';

describe('soleil', () => {
	it('midi solaire au solstice d’été, latitude 45° : ≈ 68,4° plein sud', () => {
		// longitude 0 : midi solaire ≈ 12:02 UTC le 21 juin
		const s = sunPosition(Date.UTC(2025, 5, 21, 12, 2), 45, 0);
		expect(s.elevation).toBeCloseTo(68.4, 0);
		expect(Math.abs(s.azimuth)).toBeLessThan(2);
	});

	it('le matin le soleil est à l’est (azimut négatif)', () => {
		const s = sunPosition(Date.UTC(2025, 5, 21, 7), 45, 0);
		expect(s.azimuth).toBeLessThan(-60);
		expect(s.elevation).toBeGreaterThan(20);
	});
});

describe('horizon', () => {
	it('une colline au sud masque le sud seulement', () => {
		const pts = horizonSamplePoints(45, 4);
		const elev = pts.map((p) => (p.sector === 0 && p.distance === 1500 ? 400 : 200));
		const h = horizonFromElevations(200, pts, elev);
		expect(h.angles).toHaveLength(HORIZON_SECTORS);
		expect(h.angles[0]).toBeCloseTo(7.6, 0);
		expect(horizonAt(h, 90)).toBe(0);
		expect(horizonAt(h, 7.5)).toBeCloseTo(h.angles[0] / 2, 1);
	});
});
