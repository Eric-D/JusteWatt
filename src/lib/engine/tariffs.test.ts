import { describe, expect, it } from 'vitest';
import { DEFAULT_HC_HOURS, eveOfRedDays, priceSeries, tempoCalendar, type Tariff } from './tariffs';

const days: string[] = [];
for (let t = Date.UTC(2025, 8, 1); t < Date.UTC(2026, 8, 1); t += 86_400_000)
	days.push(new Date(t).toISOString().slice(0, 10));
const temp = new Map(days.map((d, i) => [d, 12 - 10 * Math.cos((2 * Math.PI * (i - 140)) / 365)]));

describe('Tempo', () => {
	const cal = tempoCalendar(temp);
	const count = (c: string) => [...cal.values()].filter((x) => x === c).length;

	it('22 rouges, 43 blancs, jamais un rouge le week-end', () => {
		expect(count('rouge')).toBe(22);
		expect(count('blanc')).toBe(43);
		for (const [d, c] of cal)
			if (c === 'rouge') expect([0, 6]).not.toContain(new Date(d + 'T12:00Z').getUTCDay());
	});

	it('la nuit avant 6 h appartient à la couleur de la veille', () => {
		const red = [...cal].find(([, c]) => c === 'rouge')![0];
		const t: Tariff = {
			kind: 'tempo',
			subscription: 0,
			base: 0,
			hp: 0,
			hc: 0,
			hcHours: DEFAULT_HC_HOURS,
			tempo: { bleu: { hp: 1, hc: 0.5 }, blanc: { hp: 2, hc: 1.5 }, rouge: { hp: 9, hc: 3 } }
		};
		const p = priceSeries([red, red, red], [5, 7, 23], t, cal);
		expect(p[1]).toBe(9);
		expect(p[2]).toBe(3);
		expect(p[0]).not.toBe(3); // 5 h : couleur de la veille
		expect(eveOfRedDays(cal).has(red)).toBe(true);
	});
});
