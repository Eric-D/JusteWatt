import { describe, expect, it } from 'vitest';
import { fuse, type HourSample } from './fusion';

const TZ = 'Europe/Paris';
const start = Date.UTC(2025, 9, 31, 23); // 1er novembre 2025, 00:00 heure de Paris
const end = Date.UTC(2026, 0, 31, 23); // 1er février 2026

function haFor(fromMs: number, toMs: number, kwhPerHour: number) {
	const m = new Map<number, HourSample>();
	for (let t = fromMs; t < toMs; t += 3_600_000) {
		const h = new Date(t).getUTCHours();
		m.set(t, { load: kwhPerHour * (h >= 17 && h <= 20 ? 3 : 1), pilotable: 0.1 });
	}
	return m;
}

describe('fuse', () => {
	const enedis = { '2025-11': 1400, '2025-12': 1780, '2026-01': 1600 };

	it('chaque mois égale exactement le relevé Enedis', () => {
		const ha = haFor(start, Date.UTC(2025, 11, 31, 23), 1.5); // novembre + décembre
		const r = fuse({ tz: TZ, startMs: start, endMs: end, enedisMonthly: enedis, ha });
		for (const [m, kwh] of Object.entries(enedis)) {
			const total = r.load.reduce((s, v, i) => (r.localDay[i].startsWith(m) ? s + v : s), 0);
			expect(total).toBeCloseTo(kwh, 6);
		}
	});

	it('janvier sans HA reprend la forme de décembre', () => {
		const ha = haFor(start, Date.UTC(2025, 11, 31, 23), 1.5);
		const r = fuse({ tz: TZ, startMs: start, endMs: end, enedisMonthly: enedis, ha });
		expect(r.months.find((m) => m.month === '2026-01')?.method).toBe('borrowed');
		// pic du soir conservé
		const jan = r.load.map((v, i) => [r.localDay[i], r.localHour[i], v] as const);
		const at = (h: number) => jan.find(([d, hh]) => d === '2026-01-15' && hh === h)![2];
		expect(at(19)).toBeGreaterThan(at(4) * 2);
	});

	it('un mois où HA voit trop peu est exclu de la forme', () => {
		const ha = haFor(start, Date.UTC(2025, 11, 31, 23), 0.5); // HA sous-estime fortement
		const r = fuse({ tz: TZ, startMs: start, endMs: end, enedisMonthly: enedis, ha });
		expect(r.months.find((m) => m.month === '2025-11')?.method).toBe('excluded');
	});

	it('gère le passage à l’heure d’hiver', () => {
		const r = fuse({
			tz: TZ,
			startMs: Date.UTC(2025, 9, 25, 22),
			endMs: Date.UTC(2025, 9, 26, 23),
			enedisMonthly: { '2025-10': 100 },
			ha: new Map()
		});
		expect(r.localDay.filter((d) => d === '2025-10-26').length).toBe(25);
	});
});
